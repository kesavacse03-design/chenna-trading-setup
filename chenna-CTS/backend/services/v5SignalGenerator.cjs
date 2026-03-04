/**
 * V5 Unified Signal Generator — Module 1
 * 
 * Scans for 3 categories: ST_SWING_UP, ST_SWING_DOWN, LT_SWING_UP.
 * Applies strict V5 base filters and calculates data-driven confidence tiers.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const priceService = require('./priceService.cjs');

// ======= Technical Indicator Helpers =======

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    return closes.slice(closes.length - period).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
    return ema;
}

function calcEMAArray(closes, period) {
    const result = new Array(closes.length).fill(null);
    if (closes.length < period) return result;
    const k = 2 / (period + 1);
    result[period - 1] = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) result[i] = closes[i] * k + result[i - 1] * (1 - k);
    return result;
}

function calcMACD(closes) {
    if (closes.length < 26) return { histogram: 0 };
    const ema12 = calcEMAArray(closes, 12);
    const ema26 = calcEMAArray(closes, 26);
    const macdLine = [];
    for (let i = 0; i < closes.length; i++) {
        if (ema12[i] !== null && ema26[i] !== null) macdLine.push(ema12[i] - ema26[i]);
    }
    if (macdLine.length < 9) return { histogram: macdLine[macdLine.length - 1] || 0 };
    const k = 2 / 10;
    let signal = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    for (let i = 9; i < macdLine.length; i++) signal = macdLine[i] * k + signal * (1 - k);
    return { histogram: macdLine[macdLine.length - 1] - signal };
}

function calcRSI(closes, period = 14) {
    if (closes.length <= period) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gains += change; else losses -= change;
    }
    let avgGain = gains / period; let avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
    }
    return avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
}

function calcATR(dailyC, index, period = 14) {
    if (index < period) return 0;
    let trSum = 0;
    for (let i = index - period + 1; i <= index; i++) {
        const tr = Math.max(
            dailyC[i].high - dailyC[i].low,
            Math.abs(dailyC[i].high - dailyC[i - 1].close),
            Math.abs(dailyC[i].low - dailyC[i - 1].close)
        );
        trSum += tr;
    }
    return trSum / period;
}

function calcBollingerBands(closes, period = 20, multiplier = 2) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return { upper: middle + multiplier * stdDev, middle, lower: middle - multiplier * stdDev, width: (2 * multiplier * stdDev) / middle };
}

function getYearWeek(dateStr) {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${weekNo}`;
}

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function calcPreBreakoutVolumeRatio(dailyC, sIdx, period = 10) {
    if (sIdx < period) return 1.0;
    let greenVol = 0;
    let redVol = 0;
    for (let i = sIdx - period; i < sIdx; i++) {
        const c = dailyC[i];
        if (c.close >= c.open) greenVol += c.volume;
        else redVol += c.volume;
    }
    if (redVol === 0) return greenVol > 0 ? 999 : 1.0;
    return greenVol / redVol;
}

function findOrderBlockLow(dailyC, sIdx) {
    for (let i = sIdx - 1; i >= Math.max(0, sIdx - 20); i--) {
        if (dailyC[i].close < dailyC[i].open) {
            return dailyC[i].low;
        }
    }
    return null;
}

async function getNiftyContext(signalDateStr) {
    const niftyCandles = await priceService.fetchFromUpstox('NSE_INDEX|Nifty 50', '2020-01-01', '2026-12-31', 'day', 'NIFTY50');
    if (!niftyCandles || niftyCandles.length === 0) return null;
    const dailyC = niftyCandles.map(c => ({
        date: String(c.timestamp || c.date).split('T')[0],
        close: parseFloat(c.close)
    })).sort((a, b) => a.date.localeCompare(b.date));

    let nIdx = dailyC.findIndex(c => c.date === signalDateStr);
    if (nIdx === -1) {
        for (let i = dailyC.length - 1; i >= 0; i--) { if (dailyC[i].date <= signalDateStr) { nIdx = i; break; } }
    }
    if (nIdx < 20) return null;

    const closes = dailyC.slice(0, nIdx + 1).map(c => c.close);
    const ema20 = calcEMA(closes, 20);
    const currentClose = closes[closes.length - 1];
    const distPct = ((currentClose - ema20) / ema20) * 100;

    return { close: currentClose, ema20, distPct };
}

const RISK_PER_TRADE = 1000;

// ======= Handlers =======

async function processStSwingUp(sym, iKey, dateStr, dailyC, sIdx, targetDate, niftyInfo) {
    const sigCandle = dailyC[sIdx];

    // Filt 1: NIFTY Context (buffer)
    if (niftyInfo.close <= niftyInfo.ema20 * 0.98) return { skip: true, reason: 'NIFTY_BUFFER' };

    // Filt 2: Close > prior 10d high
    const highestClosePrior10 = Math.max(...dailyC.slice(sIdx - 10, sIdx).map(c => c.high)); // 10 day high
    if (sigCandle.close <= highestClosePrior10) return { skip: true, reason: 'NOT_BREAKOUT_10D' };

    // Filt 3: Stage 2
    const closes200 = dailyC.slice(Math.max(0, sIdx - 200), sIdx + 1).map(c => c.close);
    const sma50 = calcSMA(closes200, 50);
    const sma200 = calcSMA(closes200, 200);
    if (!sma50 || !sma200 || sigCandle.close <= sma50 || sma50 <= sma200) return { skip: true, reason: 'STAGE2_FAIL' };

    // Filt 4: RSI 60-70
    const rsi = calcRSI(closes200.slice(-15), 14);
    if (rsi === null || rsi < 60 || rsi > 70) return { skip: true, reason: 'RSI_FILTER' };

    // Indicators for Score
    const volumeRatio = sigCandle.volume / (dailyC.slice(sIdx - 20, sIdx).reduce((a, c) => a + c.volume, 0) / 20);
    const cBodyPos = (sigCandle.close - sigCandle.low) / (sigCandle.high - sigCandle.low + 0.0001) * 100;

    // BB Squeeze Width
    const bb = calcBollingerBands(closes200);
    let bbWidthRatio = 1;
    if (bb) {
        const ws = [];
        for (let i = 0; i < 20; i++) {
            const b = calcBollingerBands(closes200.slice(0, closes200.length - i));
            if (b) ws.push(b.width);
        }
        if (ws.length > 0) bbWidthRatio = bb.width / (ws.reduce((a, b) => a + b, 0) / ws.length);
    }

    // Intraday 1H MACD & 1H FVG
    let macd1hBullish = false;
    let fvg1hPresent = false;
    try {
        const minD = await priceService.fetchFromUpstox(iKey, '2025-01-01', '2026-12-31', '30minute', sym);
        if (minD && minD.length) {
            const m30Data = minD.map(c => ({
                date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16),
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close)
            })).sort((a, b) => a.date.localeCompare(b.date));
            const sig30Idx = m30Data.findIndex(c => c.date.startsWith(dailyC[sIdx].date));
            if (sig30Idx > 50) {
                const h1Closes = m30Data.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close);
                const m12 = calcEMA(h1Closes, 12);
                const m26 = calcEMA(h1Closes, 26);
                if (m12 && m26) macd1hBullish = m12 > m26;

                // 1H FVG logic on the breakout day (or simple 30m gap)
                const day30m = m30Data.filter(c => c.date.startsWith(dailyC[sIdx].date));
                for (let i = 2; i < day30m.length; i++) {
                    if (day30m[i].low > day30m[i - 2].high) {
                        fvg1hPresent = true; break;
                    }
                }
            }
        }
    } catch (e) { }

    // Score ST_SWING_UP
    let score = 0;
    // F1 NIFTY (Max 12 -> 10)
    if (niftyInfo.distPct < 0) score += 10; else if (niftyInfo.distPct <= 1.5) score += 5; else score += 3;
    // F2 Vol (Max 22 -> 20)
    if (volumeRatio > 2.5) score += 20; else if (volumeRatio >= 1.5) score += 14; else score += 0;
    // F3 Candle (Max 22 -> 20)
    if (cBodyPos > 66) score += 20; else if (cBodyPos > 33) score += 10; else score += 0;
    // F4 MACD (Max 17 -> 15)
    if (macd1hBullish) score += 15; else score += 5;
    // F5 ADX (Max 12 -> 12)
    score += 12; // Flat 12 proxy
    // F6 Squeeze (Max 15 -> 15)
    if (bbWidthRatio < 0.9) score += 15; else if (bbWidthRatio <= 1.1) score += 8; else score += 0;
    // F7 NEW: FVG
    if (fvg1hPresent) score += 8;

    const tier = score >= 70 ? 'TIER_1' : score >= 40 ? 'TIER_2' : 'TIER_3';

    const atr14 = calcATR(dailyC, sIdx, 14);
    const atrStop = sigCandle.close - (2.0 * atr14);
    const obLow = findOrderBlockLow(dailyC, sIdx);

    let safeObStop = (obLow !== null && !isNaN(obLow)) ? (obLow * 0.995) : atrStop;
    let finalStop = (!isNaN(atrStop) && !isNaN(safeObStop)) ? Math.min(atrStop, safeObStop) : (!isNaN(atrStop) ? atrStop : (sigCandle.close * 0.95));
    if (isNaN(finalStop) || finalStop <= 0) finalStop = sigCandle.close * 0.95;

    const suggestedStop = finalStop;
    const suggestedQty = (sigCandle.close - suggestedStop) > 0 ? Math.floor(RISK_PER_TRADE / (sigCandle.close - suggestedStop)) : 1;

    return {
        skip: false,
        data: {
            signalClose: sigCandle.close,
            breakoutLevel: highestClosePrior10,
            rsi14: rsi,
            adx14: score >= 0 ? 12 : 12, // Dummy ADX
            volumeRatio,
            candleQuality: cBodyPos > 66 ? 25 : (cBodyPos > 33 ? 10 : 0),
            macd1hState: macd1hBullish ? 'bullish' : 'flat',
            niftyClose: niftyInfo.close,
            niftyEma20: niftyInfo.ema20,
            niftyContext: niftyInfo.distPct > 0.5 ? 'up' : (niftyInfo.distPct < -0.5 ? 'down' : 'flat'),
            confidenceScore: score,
            confidenceTier: tier,
            atr14,
            suggestedStop,
            suggestedQty: Math.max(1, suggestedQty),
            status: 'PENDING_CONFIRMATION'
        }
    };
}

async function processStSwingDown(sym, iKey, dateStr, dailyC, sIdx, targetDate, niftyInfo) {
    const sigCandle = dailyC[sIdx];

    // Filt 1: NIFTY Buffer 0.96
    if (niftyInfo.close <= niftyInfo.ema20 * 0.96) return { skip: true, reason: 'NIFTY_BUFFER_96' };

    // Filt 2: Close < 10d low
    const lowestClosePrior10 = Math.min(...dailyC.slice(sIdx - 10, sIdx).map(c => c.close));
    if (sigCandle.close >= lowestClosePrior10) return { skip: true, reason: 'NOT_BREAKDOWN_10D' };

    // Filt 3: RSI < 40
    const closes200 = dailyC.slice(Math.max(0, sIdx - 200), sIdx + 1).map(c => c.close);
    const rsi = calcRSI(closes200.slice(-15), 14);
    if (rsi === null || rsi >= 40) return { skip: true, reason: 'RSI_NOT_OVERSOLD' };

    // ST_SWING_DOWN Score is evaluated upon Daily confirmation. So we leave it at 0.
    const atr14 = calcATR(dailyC, sIdx, 14);
    const volumeRatio = sigCandle.volume / (dailyC.slice(sIdx - 20, sIdx).reduce((a, c) => a + c.volume, 0) / 20);

    return {
        skip: false,
        data: {
            signalClose: sigCandle.close,
            breakoutLevel: lowestClosePrior10, // Not breakout, but tracking level
            rsi14: rsi,
            adx14: 0,
            volumeRatio,
            candleQuality: 0,
            macd1hState: 'N/A',
            niftyClose: niftyInfo.close,
            niftyEma20: niftyInfo.ema20,
            niftyContext: niftyInfo.distPct > 0.5 ? 'up' : (niftyInfo.distPct < -0.5 ? 'down' : 'flat'),
            confidenceScore: 0,
            confidenceTier: 'TBD',
            atr14,
            suggestedStop: 0, // Calculated later
            suggestedQty: 1,
            status: 'WATCHLIST'
        }
    };
}

async function processLtSwingUp(sym, iKey, dateStr, dailyC, sIdx, targetDate, niftyInfo) {
    const sigCandle = dailyC[sIdx];

    // Filt: NIFTY Context 0.98
    if (niftyInfo.close <= niftyInfo.ema20 * 0.98) return { skip: true, reason: 'NIFTY_BUFFER' };

    // Filt: RSI 60-70
    const closes200 = dailyC.slice(Math.max(0, sIdx - 200), sIdx + 1).map(c => c.close);
    const rsi = calcRSI(closes200.slice(-15), 14);
    if (rsi === null || rsi < 60 || rsi > 70) return { skip: true, reason: 'RSI_FILTER' };

    // Filt: Weekly Trend EMA10 > EMA30
    const hist = dailyC.slice(0, sIdx + 1);
    const wCloses = [];
    const wMap = new Map();
    for (const c of hist) wMap.set(getYearWeek(c.date), c.close);
    wMap.forEach(v => wCloses.push(v));
    if (wCloses.length < 30) return { skip: true, reason: 'NOT_ENOUGH_WEEKS' };
    const wEma10 = calcEMA(wCloses, 10);
    const wEma30 = calcEMA(wCloses, 30);
    if (!wEma10 || !wEma30 || wEma10 <= wEma30) return { skip: true, reason: 'WEEKLY_TREND_FAIL' };

    // Filt: Close > 50-day high (highest close of prior 50 days)
    const max50C = Math.max(...dailyC.slice(sIdx - 50, sIdx).map(c => c.close));
    if (sigCandle.close <= max50C) return { skip: true, reason: 'NOT_50D_BREAKOUT' };

    // Score LT_SWING_UP
    const distH52 = (() => {
        const histH = dailyC.slice(Math.max(0, sIdx - 250), sIdx).map(c => c.high);
        const maxH = histH.length > 0 ? Math.max(...histH) : 0;
        return maxH > 0 ? ((maxH - sigCandle.close) / maxH * 100) : 0;
    })();
    const volumeRatio = sigCandle.volume / (dailyC.slice(sIdx - 20, sIdx).reduce((a, c) => a + c.volume, 0) / 20);

    const bb = calcBollingerBands(closes200);
    let bbWidthRatio = 1;
    if (bb) {
        const ws = [];
        for (let i = 0; i < 20; i++) {
            const b = calcBollingerBands(closes200.slice(0, closes200.length - i));
            if (b) ws.push(b.width);
        }
        if (ws.length > 0) bbWidthRatio = bb.width / (ws.reduce((a, b) => a + b, 0) / ws.length);
    }

    const weGap = ((wEma10 - wEma30) / wEma30) * 100;
    const cBodyPos = (sigCandle.close - sigCandle.low) / (sigCandle.high - sigCandle.low + 0.0001) * 100;

    let score = 0;
    // F1 Dist 52wk
    if (distH52 >= 2 && distH52 <= 10) score += 20; else if (distH52 < 2) score += 12; else score += 0;
    // F2 Vol
    if (volumeRatio > 2.5) score += 20; else if (volumeRatio >= 1.5) score += 14; else score += 4;
    // F3 BB Squeeze
    if (bbWidthRatio < 0.9) score += 20; else if (bbWidthRatio <= 1.1) score += 10; else score += 0;
    // F4 Wk Trend
    if (weGap < 5) score += 15; else if (weGap > 15) score += 10; else score += 0;
    // F5 Nifty
    if (niftyInfo.distPct < 0) score += 13; else if (niftyInfo.distPct <= 1.5) score += 6; else score += 4;
    // F6 Candle
    if (cBodyPos < 60) score += 12; else if (cBodyPos > 80) score += 8; else score += 4;

    const tier = score >= 70 ? 'TIER_1' : score >= 40 ? 'TIER_2' : 'TIER_3';

    const atr14 = calcATR(dailyC, sIdx, 14);
    const atrStop = sigCandle.close - (3.0 * atr14); // Wider stop LT
    const obLow = findOrderBlockLow(dailyC, sIdx);

    let safeObStop = (obLow !== null && !isNaN(obLow)) ? (obLow * 0.995) : atrStop;
    let finalStop = (!isNaN(atrStop) && !isNaN(safeObStop)) ? Math.min(atrStop, safeObStop) : (!isNaN(atrStop) ? atrStop : (sigCandle.close * 0.95));
    if (isNaN(finalStop) || finalStop <= 0) finalStop = sigCandle.close * 0.95;

    const suggestedStop = finalStop;
    const suggestedQty = (sigCandle.close - suggestedStop) > 0 ? Math.floor(RISK_PER_TRADE / (sigCandle.close - suggestedStop)) : 1;

    return {
        skip: false,
        data: {
            signalClose: sigCandle.close,
            breakoutLevel: max50C,
            rsi14: rsi,
            adx14: 0,
            volumeRatio,
            candleQuality: cBodyPos > 80 ? 25 : (cBodyPos > 60 ? 10 : 0),
            macd1hState: 'N/A',
            niftyClose: niftyInfo.close,
            niftyEma20: niftyInfo.ema20,
            niftyContext: niftyInfo.distPct > 0.5 ? 'up' : (niftyInfo.distPct < -0.5 ? 'down' : 'flat'),
            confidenceScore: score,
            confidenceTier: tier,
            atr14,
            suggestedStop,
            suggestedQty: Math.max(1, suggestedQty),
            status: 'PENDING_CONFIRMATION'
        }
    };
}


async function generateSignals(dateStr, categoryKey) {
    console.log(`[V5 Builder] Starting Generator for ${categoryKey} on ${dateStr}`);

    // NIFTY baseline
    const niftyInfo = await getNiftyContext(dateStr);
    if (!niftyInfo) {
        console.log(`[V5 Builder] ❌ Missing NIFTY context`);
        return { generated: 0, skipped: [], signals: [] };
    }

    const cat = await prisma.category.findUnique({ where: { key: categoryKey } });
    if (!cat) return { generated: 0, skipped: [], signals: [] };

    const targetDate = new Date(dateStr + 'T00:00:00Z');
    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id, addedDate: targetDate },
        include: { stock: true }
    });

    const uniqueStocks = Array.from(new Map(stockEntries.map(s => [s.stock.symbol, s])).values());
    console.log(`[V5 Builder] Found ${uniqueStocks.length} unique candidates`);

    const generated = [], skipped = [];

    for (const entry of uniqueStocks) {
        const sym = entry.stock.symbol;
        const iKey = entry.stock.instrumentKey;

        // Dedup: Check if a V5Signal already exists within 7 days
        const sevenDaysAgo = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentSignal = await prisma.v5Signal.findFirst({
            where: { symbol: sym, category: categoryKey, signalDate: { gte: sevenDaysAgo, lt: targetDate } }
        });
        if (recentSignal) { skipped.push({ symbol: sym, reason: 'DEDUP' }); continue; }

        const dailyData = await priceService.fetchFromUpstox(iKey, '2020-01-01', '2026-12-31', 'day', sym);
        if (!dailyData || dailyData.length < 60) { skipped.push({ symbol: sym, reason: 'NO_DATA' }); continue; }

        const dailyC = dailyData.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            open: parseFloat(c.open), high: parseFloat(c.high),
            low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
        })).sort((a, b) => a.date.localeCompare(b.date));

        const sIdx = dailyC.findIndex(c => c.date === dateStr);
        if (sIdx < 50) { skipped.push({ symbol: sym, reason: 'INDEX_LOW' }); continue; }

        let result;
        if (categoryKey === 'SHORT_TERM_SWING_BO_UP') result = await processStSwingUp(sym, iKey, dateStr, dailyC, sIdx, targetDate, niftyInfo);
        else if (categoryKey === 'SHORT_TERM_SWING_BO_DOWN') result = await processStSwingDown(sym, iKey, dateStr, dailyC, sIdx, targetDate, niftyInfo);
        else if (categoryKey === 'LONG_TERM_SWING_BO_UP') result = await processLtSwingUp(sym, iKey, dateStr, dailyC, sIdx, targetDate, niftyInfo);
        else result = { skip: true, reason: 'UNKNOWN_CATEGORY' };

        if (result.skip) {
            skipped.push({ symbol: sym, reason: result.reason });
            continue;
        }

        // Write to DB
        const signal = await prisma.v5Signal.upsert({
            where: { symbol_signalDate_category: { symbol: sym, signalDate: targetDate, category: categoryKey } },
            update: { ...result.data, instrumentKey: iKey },
            create: { ...result.data, category: categoryKey, symbol: sym, instrumentKey: iKey, signalDate: targetDate }
        });

        generated.push({ symbol: sym, ...result.data });
        console.log(`[V5 Builder] ✅ ${sym} | Status: ${result.data.status} | Tier: ${result.data.confidenceTier}`);
    }

    return { generated: generated.length, skipped, signals: generated };
}

async function generateAllSignals(dateStr) {
    console.log(`\n=== RUNNING V5 UNIFIED SIGNAL PIPELINE FOR ${dateStr} ===`);
    const results = {};
    results['ST_SWING_BO_UP'] = await generateSignals(dateStr, 'SHORT_TERM_SWING_BO_UP');
    results['ST_SWING_BO_DOWN'] = await generateSignals(dateStr, 'SHORT_TERM_SWING_BO_DOWN');
    results['LT_SWING_BO_UP'] = await generateSignals(dateStr, 'LONG_TERM_SWING_BO_UP');
    return results;
}

module.exports = { generateSignals, generateAllSignals };
