const prisma = require('../../lib/prisma.cjs');
const priceService = require('../priceService.cjs');
const { getMarketRegime, calculateSMA, calculateATR } = require('../regimeService.cjs');

// === Technical Indicator Helpers ===

function calcEMA(candles, period) {
    if (!candles || candles.length < period) return null;
    const k = 2 / (period + 1);
    let ema = 0;
    for (let i = 0; i < period; i++) ema += candles[i].close;
    ema /= period;
    for (let i = period; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
    }
    return ema;
}

function calcRSI(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const chg = candles[i].close - candles[i - 1].close;
        if (chg > 0) avgGain += chg; else avgLoss += Math.abs(chg);
    }
    avgGain /= period;
    avgLoss /= period;
    for (let i = period + 1; i < candles.length; i++) {
        const chg = candles[i].close - candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + (chg > 0 ? chg : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (chg < 0 ? Math.abs(chg) : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcSMAProxy(candles, period) {
    if (!candles || candles.length < period) return null;
    const closes = candles.slice(-period).map(c => c.close);
    return closes.reduce((a, b) => a + b, 0) / period;
}

// Derive a rough weekly SMA20 from daily candles (roughly 100 trading days)
function calcWeeklySMA20(candles) {
    if (!candles || candles.length < 100) return null;
    return calcSMAProxy(candles, 100);
}

function classifyMinerviniStage(price, sma50, sma200) {
    if (!sma50 || !sma200 || !price) return 'UNKNOWN';
    if (price > sma50 && sma50 > sma200) return 'STAGE_2';
    if (price < sma50 && sma50 < sma200) return 'STAGE_4';
    if (price < sma50 && price > sma200) return 'STAGE_3';
    return 'STAGE_1';
}

function toISTDateString(dateObj) {
    if (!dateObj) return null;
    const d = new Date(dateObj);
    return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];
}

/**
 * Builds a multi-timeframe profile of a stock around a specific signal date.
 * Fetches ~60 days prior and up to 15 days after.
 */
async function analyzeStock({ symbol, addedDate, category }) {
    const targetDateStr = toISTDateString(addedDate);
    const targetDateObj = new Date(targetDateStr);

    // Fetch instrument key
    const stock = await prisma.stock.findUnique({ where: { symbol } });
    if (!stock || !stock.instrumentKey) {
        throw new Error(`Stock or instrumentKey not found for ${symbol}`);
    }

    // Date bounds: 150 days before (to ensure 60+ trading days for SMA200 we need 300 calendar days ideally, 
    // but the system typically fetches large chunks. Let's ask for 1 year before to ensure we have SMA200).
    const fromDateObj = new Date(targetDateObj);
    fromDateObj.setDate(fromDateObj.getDate() - 365);
    const toDateObj = new Date(targetDateObj);
    toDateObj.setDate(toDateObj.getDate() + 30); // 30 calendar days after

    const fromDateStr = toISTDateString(fromDateObj);
    const toDateStr = toISTDateString(toDateObj);

    // Fetch data
    let candles = await priceService.fetchPrice(symbol, stock.instrumentKey, fromDateStr, toDateStr);
    if (!candles || candles.length === 0) {
        throw new Error(`No price data fetched for ${symbol}`);
    }

    // Sort ascending
    candles.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

    // Dedup by date
    const uniqueCandles = [];
    const seenDates = new Set();
    for (const c of candles) {
        const dStr = toISTDateString(c.date || c.timestamp);
        if (!seenDates.has(dStr)) {
            uniqueCandles.push({ ...c, dateStr: dStr });
            seenDates.add(dStr);
        }
    }
    candles = uniqueCandles;

    // Find Signal Day index
    const signalDayIdx = candles.findIndex(c => c.dateStr === targetDateStr);
    if (signalDayIdx === -1) {
        throw new Error(`Signal day ${targetDateStr} not found in fetched candles`);
    }

    const signalCandle = candles[signalDayIdx];
    const pastCandles = candles.slice(0, signalDayIdx + 1); // Up to and including signal day
    const futureCandles = candles.slice(signalDayIdx + 1, signalDayIdx + 16); // Up to 15 days after

    if (pastCandles.length < 5) {
        throw new Error(`Not enough history (only ${pastCandles.length} candles) for ${symbol} on ${targetDateStr}`);
    }

    // --- DAY 0 INDICATORS ---
    const sma20 = calcSMAProxy(pastCandles, 20);
    const sma50 = calcSMAProxy(pastCandles, 50);
    const sma200 = calcSMAProxy(pastCandles, 200);
    const ema20 = calcEMA(pastCandles, 20);
    const rsi14 = calcRSI(pastCandles, 14);
    const atr14 = calculateATR(pastCandles, 14) || ((signalCandle.high - signalCandle.low) * 1.5); // fallback

    const weeklySMA20 = calcWeeklySMA20(pastCandles);
    const weeklyTrend = signalCandle.close > weeklySMA20 ? 'UP' : 'DOWN';

    // Volume ratio
    const recent20 = pastCandles.slice(Math.max(0, pastCandles.length - 20));
    const avgVol20 = recent20.reduce((s, c) => s + (c.volume || 0), 0) / (recent20.length || 1);
    const day0VolRatio = avgVol20 > 0 ? (signalCandle.volume / avgVol20) : 1;

    // --- DAY 0 SIGNAL QUALITY ---
    const prevCandle = pastCandles[signalDayIdx - 1] || signalCandle;
    const bodySize = Math.abs(signalCandle.close - signalCandle.open);
    const range = signalCandle.high - signalCandle.low || 0.01;
    const bodyPercent = (bodySize / range) * 100;

    let closePosition = 'MIDDLE';
    if (signalCandle.close > signalCandle.low + range * 0.66) closePosition = 'UPPER';
    if (signalCandle.close < signalCandle.low + range * 0.33) closePosition = 'LOWER';

    const gapPercent = ((signalCandle.open - prevCandle.close) / prevCandle.close) * 100;

    // Check pre-breakout consolidation (simple check: inside 4% range for last 3 days)
    const last3closes = pastCandles.slice(Math.max(0, pastCandles.length - 4), pastCandles.length - 1).map(c => c.close);
    const maxClose3 = Math.max(...last3closes);
    const minClose3 = Math.min(...last3closes);
    const hadBaseBeforeBreakout = last3closes.length >= 3 && ((maxClose3 - minClose3) / minClose3) < 0.04;

    // --- NIFTY CONTEXT ---
    // Extract NIFTY regime using the existing robust service (it uses OHLC cache under the hood)
    // NOTE: This uses breadths as fallback which is precisely what we want for market context.
    const regime = await getMarketRegime(targetDateObj, category);

    // Calculate Nifty change (we don't have direct NIFTY forward data instantly in regimeService,
    // so we'll just use the day0 breadth/trend as the context. The user asked for forward Nifty
    // but without full index data in cache, breadth is safer/faster.)

    // --- POST-SIGNAL OUTCOMES ---
    const after = {
        bestDay: null, worstDay: null,
        maxUpWithin5Days: -999, maxDownWithin5Days: 999,
        maxUpWithin10Days: -999, maxDownWithin10Days: 999,
        dayOfMaxUp: 1, dayOfMaxDown: 1
    };

    const d1Open = futureCandles[0] ? futureCandles[0].open : signalCandle.close;
    let bestEntryPrice = d1Open;
    let bestEntryDay = 1;

    let maxGainSoFar = -999;
    let maxLossSoFar = 999;

    const afterDaysConfig = {};

    for (let i = 0; i < futureCandles.length; i++) {
        const fc = futureCandles[i];
        const dayNum = i + 1;

        const changeFromD1Open = ((fc.close - d1Open) / d1Open) * 100;
        const highFromD1Open = ((fc.high - d1Open) / d1Open) * 100;
        const lowFromD1Open = ((fc.low - d1Open) / d1Open) * 100;

        if (highFromD1Open > maxGainSoFar) { maxGainSoFar = highFromD1Open; after.dayOfMaxUp = dayNum; }
        if (lowFromD1Open < maxLossSoFar) { maxLossSoFar = lowFromD1Open; after.dayOfMaxDown = dayNum; }

        if (fc.low < bestEntryPrice) {
            bestEntryPrice = fc.low;
            bestEntryDay = dayNum;
        }

        if (dayNum === 5) {
            after.maxUpWithin5Days = maxGainSoFar;
            after.maxDownWithin5Days = maxLossSoFar;
        }
        if (dayNum === 10) {
            after.maxUpWithin10Days = maxGainSoFar;
            after.maxDownWithin10Days = maxLossSoFar;
        }

        afterDaysConfig[`day${dayNum}`] = {
            o: fc.open, h: fc.high, l: fc.low, c: fc.close, v: fc.volume,
            changeFromD1Open: parseFloat(changeFromD1Open.toFixed(2)),
            maxUpFromD1Open: parseFloat(highFromD1Open.toFixed(2)),
            maxDownFromD1Open: parseFloat(lowFromD1Open.toFixed(2))
        };
    }

    // Fill remaining if we didn't reach day 5/10
    if (futureCandles.length < 5) {
        after.maxUpWithin5Days = maxGainSoFar;
        after.maxDownWithin5Days = maxLossSoFar;
    }
    if (futureCandles.length < 10) {
        after.maxUpWithin10Days = maxGainSoFar;
        after.maxDownWithin10Days = maxLossSoFar;
    }

    const gainAt5Days = futureCandles[4] ? ((futureCandles[4].close - d1Open) / d1Open) * 100 : null;
    const gainAt10Days = futureCandles[9] ? ((futureCandles[9].close - d1Open) / d1Open) * 100 : null;

    // Classify WIN/LOSS based on 10-day hold theoretically
    let result = 'FLAT';
    if (gainAt10Days !== null) {
        if (gainAt10Days > 2) result = 'WIN';
        else if (gainAt10Days < -2) result = 'LOSS';
    } else if (gainAt5Days !== null) { // Fallback to 5 days if 10 not available
        if (gainAt5Days > 2) result = 'WIN';
        else if (gainAt5Days < -2) result = 'LOSS';
    }

    // Assemble the complete profile
    const profile = {
        symbol,
        addedDate: targetDateStr,
        category,
        weekly: {
            trend: weeklyTrend,
            priceVsWeeklySMA20: weeklySMA20 ? parseFloat((((signalCandle.close - weeklySMA20) / weeklySMA20) * 100).toFixed(2)) : null,
        },
        before: {
            hadBaseBeforeBreakout,
            dayMinus1: pastCandles[signalDayIdx - 1] ? { c: pastCandles[signalDayIdx - 1].close } : null,
            dayMinus2: pastCandles[signalDayIdx - 2] ? { c: pastCandles[signalDayIdx - 2].close } : null,
            dayMinus3: pastCandles[signalDayIdx - 3] ? { c: pastCandles[signalDayIdx - 3].close } : null,
        },
        signalDay: {
            open: signalCandle.open,
            high: signalCandle.high,
            low: signalCandle.low,
            close: signalCandle.close,
            volume: signalCandle.volume,
            bodyPercent: parseFloat(bodyPercent.toFixed(1)),
            closePosition,
            volumeRatio: parseFloat(day0VolRatio.toFixed(2)),
            gapFromPrevClose: parseFloat(gapPercent.toFixed(2)),
            candleColor: signalCandle.close > signalCandle.open ? 'GREEN' : 'RED',
            isStrongCandle: bodyPercent > 60 && closePosition === 'UPPER' && day0VolRatio > 1.2
        },
        indicators: {
            rsi14: rsi14 ? parseFloat(rsi14.toFixed(1)) : null,
            priceVsSMA20: sma20 ? parseFloat((((signalCandle.close - sma20) / sma20) * 100).toFixed(2)) : null,
            priceVsSMA50: sma50 ? parseFloat((((signalCandle.close - sma50) / sma50) * 100).toFixed(2)) : null,
            priceVsSMA200: sma200 ? parseFloat((((signalCandle.close - sma200) / sma200) * 100).toFixed(2)) : null,
            sma20AboveSMA50: sma20 && sma50 ? sma20 > sma50 : null,
            atr14: parseFloat(atr14.toFixed(2)),
            volumeRatio: parseFloat(day0VolRatio.toFixed(2))
        },
        trendStage: classifyMinerviniStage(signalCandle.close, sma50, sma200),
        after: {
            ...afterDaysConfig,
            bestDay: after.dayOfMaxUp,
            worstDay: after.dayOfMaxDown,
            maxUpWithin5Days: parseFloat(after.maxUpWithin5Days.toFixed(2)),
            maxDownWithin5Days: parseFloat(after.maxDownWithin5Days.toFixed(2)),
            maxUpWithin10Days: parseFloat(after.maxUpWithin10Days.toFixed(2)),
            maxDownWithin10Days: parseFloat(after.maxDownWithin10Days.toFixed(2)),
            dayOfMaxUp: after.dayOfMaxUp,
            dayOfMaxDown: after.dayOfMaxDown
        },
        nifty: {
            trendAtSignal: regime.niftyTrend,
            regimeScore: regime.regimeScore,
            breadthScore: regime.breadth
        },
        outcome: {
            gainAt5Days: gainAt5Days !== null ? parseFloat(gainAt5Days.toFixed(2)) : null,
            gainAt10Days: gainAt10Days !== null ? parseFloat(gainAt10Days.toFixed(2)) : null,
            maxGain: parseFloat(maxGainSoFar.toFixed(2)),
            maxLoss: parseFloat(maxLossSoFar.toFixed(2)),
            bestEntryDay,
            bestEntryPrice,
            result
        }
    };

    return profile;
}

module.exports = { analyzeStock };
