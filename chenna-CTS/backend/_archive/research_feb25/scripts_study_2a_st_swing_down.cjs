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
    const prevBody = Math.abs(prevClose - prevOpen);
    const body = Math.abs(close - open);
    const prevIsRed = prevClose < prevOpen;
    const isGreen = close > open;
    return prevIsRed && isGreen && close > prevOpen && open < prevClose;
}

// 1H logic helper
function build1HCandles(m30Data, targetDateStr) {
    const dayData = m30Data.filter(c => c.date.startsWith(targetDateStr));
    const h1Candles = [];
    for (let i = 0; i < dayData.length; i += 2) {
        const c1 = dayData[i];
        const c2 = dayData[i + 1];
        if (!c2) {
            h1Candles.push(c1);
            continue;
        }
        h1Candles.push({
            date: c1.date,
            open: c1.open,
            high: Math.max(c1.high, c2.high),
            low: Math.min(c1.low, c2.low),
            close: c2.close,
            volume: c1.volume + c2.volume
        });
    }
    return h1Candles;
}


async function main() {
    console.log(`\n======================================================`);
    console.log(`STUDY 2A: SHORT_TERM_SWING_BO_DOWN - FINDING THE BOTTOM`);

    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
    if (!cat) return;

    const stockCategories = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

    const uniqueMap = new Map();
    for (const sc of stockCategories) {
        const dStr = toISTDateString(sc.addedDate);
        uniqueMap.set(`${sc.stock.symbol}_${dStr}`, {
            symbol: sc.stock.symbol,
            instrumentKey: sc.stock.instrumentKey || sc.stock.symbol,
            signalDateStr: dStr
        });
    }
    const uniqueSignals = Array.from(uniqueMap.values());

    // Metrics
    const bottomTiming = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, '6-10': 0, '11-15': 0 };
    const reversalCandle = {
        'Hammer': { c: 0, w: 0 }, 'Bullish Engulfing': { c: 0, w: 0 }, 'Doji': { c: 0, w: 0 },
        'Marubozu Green': { c: 0, w: 0 }, 'Normal Green': { c: 0, w: 0 }, 'Normal Red': { c: 0, w: 0 }
    };
    const rsiBottom = { '<25': { c: 0, w: 0 }, '25-30': { c: 0, w: 0 }, '30-35': { c: 0, w: 0 }, '35-40': { c: 0, w: 0 }, '>40': { c: 0, w: 0 } };
    const volBottom = { '>2x': { c: 0, w: 0 }, '1-2x': { c: 0, w: 0 }, '<1x': { c: 0, w: 0 } };
    const h1Bottom = { '1H Hammer': { c: 0, w: 0 }, 'No Reversal': { c: 0, w: 0 } };

    let totalProcessed = 0;
    const cacheDirDay = path.join(__dirname, '../cache/day');
    const cacheDir30m = path.join(__dirname, '../cache/30minute');

    for (const sig of uniqueSignals) {
        const cleanKey = sig.instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fallbackKey = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');

        let dayPath = path.join(cacheDirDay, `${cleanKey}_master.json`);
        if (!fs.existsSync(dayPath)) dayPath = path.join(cacheDirDay, `${fallbackKey}_master.json`);

        let m30Path = path.join(cacheDir30m, `${cleanKey}_master.json`);
        if (!fs.existsSync(m30Path)) m30Path = path.join(cacheDir30m, `${fallbackKey}_master.json`);

        if (!fs.existsSync(dayPath)) continue;

        let dayData;
        try {
            const parsed = JSON.parse(fs.readFileSync(dayPath, 'utf8'));
            dayData = parsed.data || parsed;
            dayData = dayData.map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));
        } catch (e) { continue; }

        const signalIdx = dayData.findIndex(c => c.date === sig.signalDateStr);
        if (signalIdx === -1 || signalIdx + 15 >= dayData.length) continue;

        // 1. Find the Absolute Bottom within 15 days
        let lowestLow = Infinity;
        let bottomDayIdxRelativeToSignal = -1;

        for (let d = 1; d <= 15; d++) {
            const fIdx = signalIdx + d;
            if (dayData[fIdx].low < lowestLow) {
                lowestLow = dayData[fIdx].low;
                bottomDayIdxRelativeToSignal = d;
            }
        }

        const bottomIdx = signalIdx + bottomDayIdxRelativeToSignal;
        const bottomCandle = dayData[bottomIdx];

        // Ensure we have 10 days of future data AFTER the day *after* the bottom to calculate win rate
        // We evaluate the entry on the close of the day *after* the bottom (the reversal confirmation day)
        const reversalDayIdx = bottomIdx + 1;
        if (reversalDayIdx + 10 >= dayData.length) continue;

        const reversalCandleObj = dayData[reversalDayIdx];
        const entryPrice = reversalCandleObj.close;
        const day10Close = dayData[reversalDayIdx + 10].close;
        const isWin = day10Close > entryPrice;

        totalProcessed++;

        // A. Bottom Timing
        if (bottomDayIdxRelativeToSignal <= 5) bottomTiming[bottomDayIdxRelativeToSignal]++;
        else if (bottomDayIdxRelativeToSignal <= 10) bottomTiming['6-10']++;
        else bottomTiming['11-15']++;

        // B. Reversal Candle (on the day after the bottom)
        let cType = getCandleType(reversalCandleObj.open, reversalCandleObj.high, reversalCandleObj.low, reversalCandleObj.close);
        if (isBullishEngulfing(bottomCandle.open, bottomCandle.close, reversalCandleObj.open, reversalCandleObj.close)) {
            cType = 'Bullish Engulfing';
        }
        if (reversalCandle[cType]) {
            reversalCandle[cType].c++;
            if (isWin) reversalCandle[cType].w++;
        }

        // C. RSI at the Bottom
        const historyCloses = dayData.slice(0, bottomIdx + 1).map(c => c.close);
        const rsi = calcRSI(historyCloses, 14);
        if (rsi !== null) {
            let rsiBucket = '';
            if (rsi < 25) rsiBucket = '<25';
            else if (rsi < 30) rsiBucket = '25-30';
            else if (rsi < 35) rsiBucket = '30-35';
            else if (rsi < 40) rsiBucket = '35-40';
            else rsiBucket = '>40';
            rsiBottom[rsiBucket].c++;
            if (isWin) rsiBottom[rsiBucket].w++;
        }

        // D. Volume at the Bottom
        const vol20Avgs = historyCloses.length >= 20 ? dayData.slice(bottomIdx - 19, bottomIdx + 1).reduce((s, c) => s + c.volume, 0) / 20 : bottomCandle.volume;
        const volRatio = bottomCandle.volume / vol20Avgs;
        let vBucket = '';
        if (volRatio > 2) vBucket = '>2x';
        else if (volRatio >= 1) vBucket = '1-2x';
        else vBucket = '<1x';
        volBottom[vBucket].c++;
        if (isWin) volBottom[vBucket].w++;

        // E. 1H Candle at Bottom
        if (fs.existsSync(m30Path)) {
            try {
                const parsed30 = JSON.parse(fs.readFileSync(m30Path, 'utf8'));
                let m30Data = parsed30.data || parsed30;
                m30Data = m30Data.map(c => ({
                    date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16),
                    open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
                })).sort((a, b) => a.date.localeCompare(b.date));

                const h1Candles = build1HCandles(m30Data, bottomCandle.date);
                let found1HHammer = false;
                for (const c of h1Candles) {
                    if (getCandleType(c.open, c.high, c.low, c.close) === 'Hammer') {
                        found1HHammer = true; break;
                    }
                }

                if (found1HHammer) {
                    h1Bottom['1H Hammer'].c++;
                    if (isWin) h1Bottom['1H Hammer'].w++;
                } else {
                    h1Bottom['No Reversal'].c++;
                    if (isWin) h1Bottom['No Reversal'].w++;
                }
            } catch (e) { }
        }
    }

    console.log(`\nBOTTOM TIMING:  (Total Analyzed: ${totalProcessed})`);
    for (const key of ['1', '2', '3', '4', '5', '6-10', '11-15']) {
        const pct = (bottomTiming[key] / totalProcessed) * 100;
        console.log(`  Bottomed Day+${key}:`.padEnd(20) + `${String(bottomTiming[key]).padStart(3)} signals | ${pct.toFixed(1)}% of total`);
    }

    console.log(`\nREVERSAL SIGNAL (on the day AFTER the bottom):`);
    for (const [key, val] of Object.entries(reversalCandle)) {
        const wr = val.c > 0 ? (val.w / val.c) * 100 : 0;
        console.log(`  ${key.padEnd(20)}: ${String(val.c).padStart(3)} signals | subsequent 10d WR: ${wr.toFixed(1)}%`);
    }

    console.log(`\nRSI AT THE BOTTOM:`);
    for (const [key, val] of Object.entries(rsiBottom)) {
        const wr = val.c > 0 ? (val.w / val.c) * 100 : 0;
        console.log(`  RSI ${key.padEnd(14)}: ${String(val.c).padStart(3)} bottoms | bounce 10d WR: ${wr.toFixed(1)}%`);
    }

    console.log(`\nVOLUME AT THE BOTTOM (capitulation signal):`);
    for (const [key, val] of Object.entries(volBottom)) {
        const wr = val.c > 0 ? (val.w / val.c) * 100 : 0;
        console.log(`  Volume ${key.padEnd(13)}: ${String(val.c).padStart(3)} bottoms | bounce 10d WR: ${wr.toFixed(1)}%`);
    }

    console.log(`\n1H CANDLE AT BOTTOM (from 30-min data):`);
    for (const [key, val] of Object.entries(h1Bottom)) {
        const wr = val.c > 0 ? (val.w / val.c) * 100 : 0;
        console.log(`  ${key.padEnd(20)}: ${String(val.c).padStart(3)} bottoms | bounce 10d WR: ${wr.toFixed(1)}%`);
    }

    await prisma.$disconnect();
}

main().catch(console.error);
