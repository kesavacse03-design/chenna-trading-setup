const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(closes.length - period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

function classifyStage(price, sma50, sma200) {
    if (!sma50 || !sma200) return 'UNKNOWN';
    if (price > sma50 && sma50 > sma200) return 'STAGE_2';
    return 'UNKNOWN';
}

function getYearWeek(dateStr) {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${weekNo}`;
}

// 1H confirmation: we just check if any 1H close on Day+1 is > max high of 10 prior days.
function checkTypeAConfirmation(m30Data, day1DateStr, maxHigh10d) {
    const day1Data = m30Data.filter(c => c.date.startsWith(day1DateStr));
    let hasConfirmation = false;
    for (let i = 0; i < day1Data.length; i += 2) {
        const c1 = day1Data[i];
        const c2 = day1Data[i + 1];
        const h1Close = c2 ? c2.close : c1.close;
        const h1Date = c2 ? c2.date : c1.date;
        // After 10:15 means 2nd candle (09:45-10:15) minimum
        if (h1Date.includes(' 10:') || h1Date.includes(' 11:') || h1Date.includes(' 12:') || h1Date.includes(' 13:') || h1Date.includes(' 14:') || h1Date.includes(' 15:')) {
            if (h1Close > maxHigh10d) {
                hasConfirmation = true;
                break;
            }
        }
    }
    return hasConfirmation;
}


async function main() {
    console.log(`\n======================================================`);
    console.log(`STUDY 2B: LONG_TERM_SWING_BO_UP - FILTER EFFECTIVENESS`);

    // Load NIFTY 50 from cache
    const cacheDirDay = path.join(__dirname, '../cache/day');
    const cacheDir30m = path.join(__dirname, '../cache/30minute');
    const niftyPath = path.join(cacheDirDay, `NSE_INDEX_Nifty_50_master.json`);
    let niftyData = [];
    if (fs.existsSync(niftyPath)) {
        const parsed = JSON.parse(fs.readFileSync(niftyPath, 'utf8'));
        niftyData = parsed.data || parsed;
        niftyData = niftyData.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
            close: parseFloat(c.close)
        })).sort((a, b) => a.date.localeCompare(b.date));
    }

    const checkNifty = (signalDateStr) => {
        if (!niftyData.length) return false;
        const idx = niftyData.findIndex(c => c.date <= signalDateStr);
        let nIdx = niftyData.findIndex(c => c.date === signalDateStr);
        if (nIdx === -1) nIdx = niftyData.findIndex(c => c.date > signalDateStr) - 1;
        if (nIdx < 20) return false;
        const closes = niftyData.slice(0, nIdx + 1).map(c => c.close);
        const sma20 = calcEMA(closes, 20); // V5 rule says 20 EMA
        const close = closes[closes.length - 1];
        return close > (sma20 * 0.98);
    };

    const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_UP' } });
    if (!cat) return;

    const stockCategories = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

    const uniqueSignals = Array.from(new Map(stockCategories.map(sc => [
        `${sc.stock.symbol}_${toISTDateString(sc.addedDate)}`,
        { symbol: sc.stock.symbol, instrumentKey: sc.stock.instrumentKey || sc.stock.symbol, signalDateStr: toISTDateString(sc.addedDate) }
    ])).values());

    let allCount = 0, stg2Count = 0, rsiCount = 0, stg2RsiCount = 0, allFilterCount = 0, typeACount = 0;
    let weekUpCount = 0, weekDownCount = 0;

    let wAll = { c: 0, 10: 0, 13: 0 }, wStg2 = { c: 0, 10: 0, 13: 0 }, wRsi = { c: 0, 10: 0, 13: 0 },
        wStg2Rsi = { c: 0, 10: 0, 13: 0 }, wAllFilter = { c: 0, 10: 0, 13: 0 }, wTypeA = { c: 0, 10: 0, 13: 0 };
    let wWeekUp = { c: 0, 10: 0, 13: 0 }, wWeekDown = { c: 0, 10: 0, 13: 0 };

    for (const sig of uniqueSignals) {
        const cleanKey = sig.instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fbKey = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');

        let dayPath = path.join(cacheDirDay, `${cleanKey}_master.json`);
        if (!fs.existsSync(dayPath)) dayPath = path.join(cacheDirDay, `${fbKey}_master.json`);
        let m30Path = path.join(cacheDir30m, `${cleanKey}_master.json`);
        if (!fs.existsSync(m30Path)) m30Path = path.join(cacheDir30m, `${fbKey}_master.json`);

        if (!fs.existsSync(dayPath)) continue;

        let dayData;
        try {
            const parsed = JSON.parse(fs.readFileSync(dayPath, 'utf8'));
            dayData = (parsed.data || parsed).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close)
            })).sort((a, b) => a.date.localeCompare(b.date));
        } catch (e) { continue; }

        const signalIdx = dayData.findIndex(c => c.date === sig.signalDateStr);
        if (signalIdx === -1 || signalIdx + 13 >= dayData.length) continue;

        const history = dayData.slice(0, signalIdx + 1);
        const closes = history.map(c => c.close);
        const price = closes[closes.length - 1];

        const sma50 = calcSMA(closes, 50);
        const sma200 = calcSMA(closes, 200);
        const isStage2 = classifyStage(price, sma50, sma200) === 'STAGE_2';

        const rsi = calcRSI(closes, 14);
        const isRsiValid = rsi >= 60 && rsi <= 70;

        const isNiftyValid = checkNifty(sig.signalDateStr);

        // Weekly processing
        const weeklyClosesMap = new Map();
        for (const c of history) weeklyClosesMap.set(getYearWeek(c.date), c.close); // overwrite till last day of week
        const weeklyClosesArr = Array.from(weeklyClosesMap.values());
        let weeklyEma10 = null, weeklyEma30 = null;
        if (weeklyClosesArr.length >= 30) {
            weeklyEma10 = calcEMA(weeklyClosesArr, 10);
            weeklyEma30 = calcEMA(weeklyClosesArr, 30);
        }
        const isWeeklyUp = weeklyEma10 && weeklyEma30 && weeklyEma10 > weeklyEma30;
        const isWeeklyDown = weeklyEma10 && weeklyEma30 && weeklyEma10 < weeklyEma30;

        // Type A confirmation
        let isTypeA = false;
        if (fs.existsSync(m30Path) && signalIdx >= 10) {
            try {
                const maxHigh10d = Math.max(...dayData.slice(signalIdx - 10, signalIdx).map(c => c.high));
                const p30 = JSON.parse(fs.readFileSync(m30Path, 'utf8'));
                let m30Data = (p30.data || p30).map(c => ({
                    date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16),
                    close: parseFloat(c.close)
                })).sort((a, b) => a.date.localeCompare(b.date));

                const day1Str = dayData[signalIdx + 1].date;
                isTypeA = checkTypeAConfirmation(m30Data, day1Str, maxHigh10d);
            } catch (e) { }
        }

        // Win evaluation
        const entryPrice = dayData[signalIdx + 1].open; // default entry assumption for baseline
        const day10Close = dayData[signalIdx + 10].close;
        const day13Close = dayData[signalIdx + 13].close;
        const win10 = day10Close > entryPrice;
        const win13 = day13Close > entryPrice;

        const track = (obj) => {
            obj.c++;
            if (win10) obj[10]++;
            if (win13) obj[13]++;
        };

        track(wAll);
        if (isStage2) track(wStg2);
        if (isRsiValid) track(wRsi);
        if (isStage2 && isRsiValid) track(wStg2Rsi);
        if (isStage2 && isRsiValid && isNiftyValid) track(wAllFilter);
        if (isTypeA) track(wTypeA);

        if (isWeeklyUp) track(wWeekUp);
        if (isWeeklyDown) track(wWeekDown);
    }

    const printLine = (label, obj) => {
        const wr10 = obj.c ? (obj[10] / obj.c) * 100 : 0;
        const wr13 = obj.c ? (obj[13] / obj.c) * 100 : 0;
        console.log(`  ${label.padEnd(28)}: ${String(obj.c).padStart(3)} | Day10 WR: ${wr10.toFixed(1)}% | Day13 WR: ${wr13.toFixed(1)}%`);
    };

    console.log(`\nFILTER PERFORMANCE SUMMARY:`);
    printLine('All raw signals', wAll);
    console.log(`  ----------------------------------------------------------------`);
    printLine('Stage 2 (SMA50 > SMA200)', wStg2);
    printLine('RSI 60-70', wRsi);
    printLine('Stage 2 + RSI 60-70', wStg2Rsi);
    printLine('Stage 2 + RSI 60-70 + NIFTY', wAllFilter);
    console.log(`  ----------------------------------------------------------------`);
    printLine('Type A (1H confirmed)', wTypeA);
    console.log(`  ----------------------------------------------------------------`);
    console.log(`Does WEEKLY trend direction matter?`);
    printLine('Weekly EMA 10 > Weekly EMA 30', wWeekUp);
    printLine('Weekly EMA 10 < Weekly EMA 30', wWeekDown);

    await prisma.$disconnect();
}

main().catch(console.error);
