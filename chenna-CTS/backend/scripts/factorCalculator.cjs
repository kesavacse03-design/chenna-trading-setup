const fs = require('fs');
const path = require('path');
const { synthesizeWeekly, calcRSI } = require('./synthesizeCandles.cjs');

const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');
const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');

function loadDayCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_DAY, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        return raw.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            close: parseFloat(c.close),
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            volume: parseFloat(c.volume)
        })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return null; }
}

function load30mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const byDay = {};
        for (const c of raw) {
            const parts = String(c.timestamp || c.date).split('T');
            const d = parts[0];
            const t = parts[1].substring(0, 8);
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push({
                date: d,
                timeStr: t,
                close: parseFloat(c.close),
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                volume: parseFloat(c.volume)
            });
        }
        return byDay;
    } catch (e) { return null; }
}

function calcEMA(data, startIdx, period) {
    if (startIdx < period - 1) return null;
    let sum = 0;
    let seedIdx = Math.max(0, startIdx - period * 3);
    if (seedIdx + period - 1 <= startIdx) {
        for (let i = seedIdx; i < seedIdx + period; i++) sum += data[i].close;
        let ema = sum / period;
        const m = 2 / (period + 1);
        for (let i = seedIdx + period; i <= startIdx; i++) {
            ema = (data[i].close - ema) * m + ema;
        }
        return ema;
    }
    return null;
}

function calcSMA(data, field, startIdx, period) {
    if (startIdx < period - 1) return null;
    let sum = 0;
    for (let i = startIdx - period + 1; i <= startIdx; i++) sum += data[i][field];
    return sum / period;
}

function calcATR(data, startIdx, period) {
    if (startIdx < period) return null;
    let trSum = 0;
    for (let i = startIdx - period + 1; i <= startIdx; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const pc = data[i - 1] ? data[i - 1].close : data[i].open;
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        trSum += tr;
    }
    return trSum / period;
}

function calcMACD(data, startIdx) {
    if (startIdx < 34) return null; // Need enough for EMA26 + EMA9
    const ema12 = calcEMA(data, startIdx, 12);
    const ema26 = calcEMA(data, startIdx, 26);
    if (!ema12 || !ema26) return null;

    // To get the MACD signal line, we need to calculate MACD series
    const macdSeries = [];
    for (let i = startIdx - 15; i <= startIdx; i++) {
        const e12 = calcEMA(data, i, 12);
        const e26 = calcEMA(data, i, 26);
        if (e12 && e26) macdSeries.push({ close: e12 - e26 }); // mock candle for calcEMA
    }
    if (macdSeries.length < 9) return null;
    const signalLine = calcEMA(macdSeries, macdSeries.length - 1, 9);

    const macdVal = ema12 - ema26;
    const hist = macdVal - signalLine;

    return { macd: macdVal, signal: signalLine, hist: hist };
}

// StochRSI
function calcStochRSI(data, startIdx, period) {
    if (startIdx < period * 2) return null;
    const rsiArr = calcRSI(data.slice(0, startIdx + 1), period);
    if (rsiArr.length < period) return null;

    const currentRSI = rsiArr[rsiArr.length - 1].value;
    let minRSI = 100, maxRSI = 0;
    for (let i = Math.max(0, rsiArr.length - period); i < rsiArr.length; i++) {
        if (rsiArr[i].value < minRSI) minRSI = rsiArr[i].value;
        if (rsiArr[i].value > maxRSI) maxRSI = rsiArr[i].value;
    }
    if (maxRSI === minRSI) return 0;
    return ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100;
}

function isNR(data, startIdx, n) {
    if (startIdx < n) return false;
    const targetRange = data[startIdx].high - data[startIdx].low;
    for (let i = startIdx - n + 1; i < startIdx; i++) {
        const r = data[i].high - data[i].low;
        if (r <= targetRange) return false;
    }
    return true;
}

function calcAllRound2Factors(symbol, targetDate, setupDirection = 'LONG') {
    const dayData = loadDayCache(symbol);
    if (!dayData) return null;

    const idx = dayData.findIndex(d => d.date === targetDate);
    if (idx < 50) return null;

    const historyData = dayData.slice(0, idx + 1);
    const today = historyData[historyData.length - 1];
    const prevDay = historyData[historyData.length - 2];

    const f = {};

    // PRIORITY 1: CONTRACTION (Must check the day BEFORE the breakout, avoiding the expansion candle)
    const prevIdx = historyData.length - 2;
    f.NR7 = prevIdx >= 7 ? isNR(historyData, prevIdx, 7) : false;
    f.NR4 = prevIdx >= 4 ? isNR(historyData, prevIdx, 4) : false;

    // INSIDER is an inside bar on the day BEFORE the breakout
    if (prevIdx >= 1) {
        const prePrev = historyData[prevIdx - 1];
        f.INSIDER = prevDay.high <= prePrev.high && prevDay.low >= prePrev.low && (prevDay.high < prePrev.high || prevDay.low > prePrev.low);
    } else {
        f.INSIDER = false;
    }
    f.INSIDER_NR7 = f.INSIDER && f.NR7;

    let vcpScore = 0;
    for (let i = prevIdx; i > Math.max(0, historyData.length - 7); i--) {
        if (!historyData[i] || !historyData[i - 1]) break;
        const r1 = historyData[i].high - historyData[i].low;
        const r2 = historyData[i - 1].high - historyData[i - 1].low;
        if (r1 < r2) vcpScore++;
        else break; // Consecutive smaller ranges
    }
    f.VCP_SCORE = vcpScore;

    const currentATR = calcATR(historyData, prevIdx, 14);
    const pastATR = calcATR(historyData, prevIdx - 20, 14);
    f.ATR_CONTRACT = (currentATR && pastATR) ? (currentATR / pastATR) : null;

    // PRIORITY 2: BREAKOUT QUALITY
    let boDayCount = 0;
    let targetPrice = setupDirection === 'LONG' ? today.close : today.close;
    for (let i = historyData.length - 2; i >= 0; i--) {
        if (setupDirection === 'LONG') {
            if (historyData[i].high > targetPrice) break;
        } else {
            if (historyData[i].low < targetPrice) break;
        }
        boDayCount++;
    }
    f.BO_N_DAY = boDayCount;

    // Estimate resistance/support level age and touch count over last 20 days
    let touchCount = 0;
    let levelAge = 0;
    let refLevel = setupDirection === 'LONG' ? Math.max(prevDay.high, historyData[historyData.length - 3].high) : Math.min(prevDay.low, historyData[historyData.length - 3].low);

    for (let i = historyData.length - 2; i >= Math.max(0, historyData.length - 21); i--) {
        const c = historyData[i];
        if (setupDirection === 'LONG') {
            if (Math.abs(c.high - refLevel) / refLevel < 0.005) {
                touchCount++;
                levelAge = historyData.length - 1 - i;
            }
        } else {
            if (Math.abs(c.low - refLevel) / refLevel < 0.005) {
                touchCount++;
                levelAge = historyData.length - 1 - i;
            }
        }
    }
    f.TOUCH_COUNT = touchCount;
    f.LEVEL_AGE = levelAge;

    // PRIORITY 3: EXHAUSTION
    const rsi2Arr = calcRSI(historyData, 2);
    f.RSI2 = rsi2Arr.length > 0 ? rsi2Arr[rsi2Arr.length - 1].value : null;
    f.RSI2_CUM = rsi2Arr.length > 1 ? rsi2Arr[rsi2Arr.length - 1].value + rsi2Arr[rsi2Arr.length - 2].value : null;

    f.STOCH_RSI = calcStochRSI(historyData, historyData.length - 1, 14);

    const macdRes = calcMACD(historyData, historyData.length - 1);
    const macdPrev = calcMACD(historyData, historyData.length - 2);
    f.MACD_HIST = macdRes ? macdRes.hist : null;
    f.MACD_HIST_SLOPE = (macdRes && macdPrev) ? (macdRes.hist > macdPrev.hist ? 'RISING' : 'FALLING') : 'NULL';

    // PRIORITY 5: VOLUME INTELLIGENCE
    const volAvg3 = calcSMA(historyData, 'volume', historyData.length - 1, 3);
    const volAvg10Prev = calcSMA(historyData, 'volume', historyData.length - 4, 10);
    f.VOL_BUILDUP = (volAvg3 && volAvg10Prev) ? (volAvg3 / volAvg10Prev) : null;

    let accumCount = 0;
    const vol20 = calcSMA(historyData, 'volume', historyData.length - 1, 20);
    for (let i = historyData.length - 1; i >= Math.max(0, historyData.length - 5); i--) {
        const c = historyData[i];
        const range = c.high - c.low;
        const body = Math.abs(c.close - c.open);
        if (range === 0) continue;
        if ((body / range < 0.4) && vol20 && c.volume > (vol20 * 1.2)) {
            accumCount++;
        }
    }
    f.ACCUM = accumCount;
    f.BO_VOL_RATIO = vol20 ? (today.volume / vol20) : null;

    // Existing Factors (Subset necessary for combos)
    const ema20 = calcEMA(historyData, historyData.length - 1, 20);
    const ema50 = calcEMA(historyData, historyData.length - 1, 50);
    const ema200 = idx >= 200 ? calcEMA(historyData, historyData.length - 1, 200) : null;

    f.D_STACK = (ema20 && ema50 && ema200) ?
        ((ema20 > ema50 && ema50 > ema200) ? 'BULL_STACK' :
            (ema20 < ema50 && ema50 < ema200) ? 'BEAR_STACK' : 'MIXED') : 'NULL';

    f.PS_GAP = ((today.open - prevDay.close) / prevDay.close * 100);

    const weeklyData = synthesizeWeekly(historyData);
    if (weeklyData.length >= 20) {
        const wEma20 = calcEMA(weeklyData, weeklyData.length - 1, 20);
        f.W_EMA20 = wEma20 ? (weeklyData[weeklyData.length - 1].close > wEma20 ? 'ABOVE' : 'BELOW') : 'NULL';
    } else {
        f.W_EMA20 = 'NULL';
    }

    return f;
}

module.exports = { loadDayCache, load30mCache, calcAllRound2Factors, calcATR };
