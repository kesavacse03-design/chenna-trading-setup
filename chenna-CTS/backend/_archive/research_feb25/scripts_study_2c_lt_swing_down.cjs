const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
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

function getYearWeek(dateStr) {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${weekNo}`;
}

function getCandleType(open, high, low, close) {
    const body = Math.abs(close - open);
    const range = high - low;
    if (range === 0) return 'Doji';
    const bodyPct = body / range;
    const isGreen = close > open;
    const upperWick = isGreen ? high - close : high - open;
    const lowerWick = isGreen ? open - low : close - low;

    if (bodyPct <= 0.1) return 'Doji';
    if (lowerWick > body * 2 && upperWick < body * 0.5) return 'Hammer';
    if (bodyPct >= 0.8) return isGreen ? 'Marubozu Green' : 'Marubozu Red';
    return isGreen ? 'Normal Green' : 'Normal Red';
}

function isBullishEngulfing(prevOpen, prevClose, open, close) {
    const isGreen = close > open;
    const prevIsRed = prevClose < prevOpen;
    return prevIsRed && isGreen && close > prevOpen && open < prevClose;
}


async function main() {
    console.log(`\n======================================================`);
    console.log(`STUDY 2C: LONG_TERM_SWING_BO_DOWN - FINDING THE DEEP BOTTOM`);

    const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_DOWN' } });
    if (!cat) return;

    const stockCategories = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

    const uniqueSignals = Array.from(new Map(stockCategories.map(sc => [
        `${sc.stock.symbol}_${toISTDateString(sc.addedDate)}`,
        { symbol: sc.stock.symbol, instrumentKey: sc.stock.instrumentKey || sc.stock.symbol, signalDateStr: toISTDateString(sc.addedDate) }
    ])).values());

    const drops = { '10-20%': { c: 0, w: 0 }, '20-30%': { c: 0, w: 0 }, '30-40%': { c: 0, w: 0 }, '40%+': { c: 0, w: 0 } };
    const wRsi = { '<30': { c: 0, w: 0 }, '30-40': { c: 0, w: 0 }, '40-50': { c: 0, w: 0 }, '>50': { c: 0, w: 0 } };
    const bottomTiming = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, '6-10': 0, '11-15': 0, '16-20': 0 };
    const reversalCandle = {
        'Hammer': { c: 0, w: 0 }, 'Bullish Engulfing': { c: 0, w: 0 }, 'Doji': { c: 0, w: 0 },
        'Marubozu Green': { c: 0, w: 0 }, 'Normal Green': { c: 0, w: 0 }, 'Normal Red': { c: 0, w: 0 }
    };
    const reclaims = { 'Bounced AND reclaimed': { c: 0, w: 0 }, 'Bounced but below support': { c: 0, w: 0 }, 'Never bounced': { c: 0, w: 0 } };

    let totalProcessed = 0;
    let sumFurtherDrop = 0;
    let bottomCount = 0;

    const cacheDirDay = path.join(__dirname, '../cache/day');

    for (const sig of uniqueSignals) {
        const cleanKey = sig.instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fbKey = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');

        let dayPath = path.join(cacheDirDay, `${cleanKey}_master.json`);
        if (!fs.existsSync(dayPath)) dayPath = path.join(cacheDirDay, `${fbKey}_master.json`);

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
        if (signalIdx === -1 || signalIdx + 20 >= dayData.length) continue;

        const history = dayData.slice(0, signalIdx + 1);
         // Need 1yr lookback for 52wk high

        const signalClose = dayData[signalIdx].close;
        const entryPrice = dayData[signalIdx + 1].open;
        const isWin15 = dayData[signalIdx + 15].close > entryPrice;

        totalProcessed++;

        // A. Drop from 52-week High
        const high52wk = Math.max(...history.map(c => c.high));
        const dropPct = ((high52wk - signalClose) / high52wk) * 100;

        let dBucket = '';
        if (dropPct >= 40) dBucket = '40%+';
        else if (dropPct >= 30) dBucket = '30-40%';
        else if (dropPct >= 20) dBucket = '20-30%';
        else if (dropPct >= 10) dBucket = '10-20%';

        if (dBucket) { drops[dBucket].c++; if (isWin15) drops[dBucket].w++; }

        // B. Weekly RSI
        const weeklyClosesMap = new Map();
        for (const c of history) weeklyClosesMap.set(getYearWeek(c.date), c.close);
        const weeklyClosesArr = Array.from(weeklyClosesMap.values());
        const wRsiVal = calcRSI(weeklyClosesArr, 14);

        if (wRsiVal !== null) {
            let rBucket = '';
            if (wRsiVal < 30) rBucket = '<30';
            else if (wRsiVal < 40) rBucket = '30-40';
            else if (wRsiVal < 50) rBucket = '40-50';
            else rBucket = '>50';
            wRsi[rBucket].c++; if (isWin15) wRsi[rBucket].w++;
        }

        // C. Bottom Timing & Support Reclaim
        let lowestLow = signalClose;
        let bottomDayIdx = 0;
        for (let d = 1; d <= 20; d++) {
            if (dayData[signalIdx + d].low < lowestLow) {
                lowestLow = dayData[signalIdx + d].low;
                bottomDayIdx = d;
            }
        }

        if (bottomDayIdx > 0) {
            bottomCount++;
            sumFurtherDrop += ((lowestLow - signalClose) / signalClose) * 100;

            if (bottomDayIdx <= 5) bottomTiming[bottomDayIdx]++;
            else if (bottomDayIdx <= 10) bottomTiming['6-10']++;
            else if (bottomDayIdx <= 15) bottomTiming['11-15']++;
            else bottomTiming['16-20']++;

            const bottomIdx = signalIdx + bottomDayIdx;
            const reversalIdx = bottomIdx + 1;

            if (reversalIdx < dayData.length) {
                const bottomCandle = dayData[bottomIdx];
                const rCandle = dayData[reversalIdx];
                let cType = getCandleType(rCandle.open, rCandle.high, rCandle.low, rCandle.close);
                if (isBullishEngulfing(bottomCandle.open, bottomCandle.close, rCandle.open, rCandle.close)) {
                    cType = 'Bullish Engulfing';
                }

                // Track 10-day WR from reversal
                let bounceWin = false;
                if (reversalIdx + 10 < dayData.length) {
                    bounceWin = dayData[reversalIdx + 10].close > rCandle.close;
                }
                if (reversalCandle[cType]) {
                    reversalCandle[cType].c++;
                    if (bounceWin) reversalCandle[cType].w++;
                }
            }

            // Reclaims: Define "Broken Support" as the lowest close in the 10 days before signal
            const prior10d = history.slice(-11, -1);
            const supportLvl = Math.min(...prior10d.map(c => c.close));
            const day15Close = dayData[signalIdx + 15].close;
            const day20Close = dayData[signalIdx + 20].close;

            const highestBounce = Math.max(...dayData.slice(bottomIdx + 1, signalIdx + 21).map(c => c.high));
            const didBounce = highestBounce > (lowestLow * 1.02); // bounced at least 2%

            if (!didBounce) {
                reclaims['Never bounced'].c++;
                if (isWin15) reclaims['Never bounced'].w++;
            } else if (day15Close > supportLvl || day20Close > supportLvl) {
                reclaims['Bounced AND reclaimed'].c++;
                if (isWin15) reclaims['Bounced AND reclaimed'].w++;
            } else {
                reclaims['Bounced but below support'].c++;
                if (isWin15) reclaims['Bounced but below support'].w++;
            }
        } else {
            // Never went below signal close in next 20 days
        }
    }

    const printBlock = (obj) => {
        for (const [key, val] of Object.entries(obj)) {
            const wr = val.c ? (val.w / val.c) * 100 : 0;
            console.log(`  ${key.padEnd(25)}: ${String(val.c).padStart(3)} signals | WR: ${wr.toFixed(1)}%`);
        }
    };

    console.log(`\nDROP FROM 52-WEEK HIGH: (Total: ${totalProcessed})`);
    printBlock(drops);

    console.log(`\nWEEKLY RSI AT SIGNAL:`);
    printBlock(wRsi);

    console.log(`\nBOTTOM TIMING (Absolute Low in 20 days):`);
    for (const key of ['1', '2', '3', '4', '5', '6-10', '11-15', '16-20']) {
        const pct = bottomCount ? (bottomTiming[key] / bottomCount) * 100 : 0;
        console.log(`  Bottomed Day+${key.padEnd(8)}: ${String(bottomTiming[key]).padStart(3)} signals | ${pct.toFixed(1)}% of total`);
    }
    console.log(`  Average further drop from signal to bottom: ${(sumFurtherDrop / bottomCount).toFixed(2)}%`);

    console.log(`\nREVERSAL SIGNAL AT BOTTOM:`);
    printBlock(reversalCandle);

    console.log(`\nPOST-BOTTOM RECLAIM BEHAVIOR (Support broken vs Day 15/20 reclaim):`);
    printBlock(reclaims);

    await prisma.$disconnect();
}

main().catch(console.error);
