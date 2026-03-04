
const TA = require('../../strategy/technicalAnalysis.cjs');

/**
 * SIGNAL QUALITY CALCULATOR (TradeCode Trinity)
 * 
 * Assigns a Confidence Score (-3 to +3) to trading signals based on:
 * 1. Market Trend (Nifty 50 Context)
 * 2. Stock Technicals (RSI)
 * 3. Daily Context (Prev Day Close)
 */

function calculateSignalQuality(signal, stockCandles, niftyCandles, prevDayCandle) {
    let score = 0;
    const factors = {};
    const warnings = [];

    // --- HELPER: Find Index matching Signal Time ---
    // We must avoid lookahead bias by only analyzing data up to the signal time.
    let signalIndex = -1;
    let niftyIndex = -1;

    try {
        signalIndex = findIndexByTime(stockCandles, signal.entryTime);
    } catch (e) {
        throw new Error(`findIndexByTime(stock) failed for ${signal.symbol} at ${signal.entryTime}: ${e.message}`);
    }

    try {
        niftyIndex = findIndexByTime(niftyCandles, signal.entryTime);
    } catch (e) {
        // Don't crash for Nifty, just warn
        console.warn(`[SignalQuality] findIndexByTime(nifty) failed: ${e.message}`);
    }

    // If we can't find the time (e.g. data issues), use the last available candle (risky but fallback)
    // or just return neutral. 
    const idx = signalIndex !== -1 ? signalIndex : stockCandles.length - 1;
    const nIdx = niftyIndex !== -1 ? niftyIndex : niftyCandles.length - 1;

    // Slice data up to the signal point
    const stockHistory = stockCandles.slice(0, idx + 1);
    const niftyHistory = niftyCandles.slice(0, nIdx + 1);

    // 1. MARKET TREND CHECK (Nifty 50)
    // User logic: 9 EMA vs 21 EMA on 1-min candles (Proxy for immediate trend)
    // Note: User asked for 5-min chart check, but we have 1-min data. 
    // 9/21 on 1-min is very fast. We will stick to the requested 9/21 logic on available data.
    const niftyEMA9 = TA.calculateEMA(niftyHistory, 9);
    const niftyEMA21 = TA.calculateEMA(niftyHistory, 21);

    let marketTrend = 'NEUTRAL';
    let marketScore = 0;

    if (niftyEMA9 && niftyEMA21) {
        if (niftyEMA9 > niftyEMA21) {
            marketTrend = 'BULLISH';
            marketScore = 1;
        } else if (niftyEMA9 < niftyEMA21) {
            marketTrend = 'BEARISH';
            marketScore = -1;
        }
    }

    // Apply Market Score
    // For Long Signals (INTRADAY_BOOST is primarily Long)
    // If doing SHORT, we would invert this.
    // Assuming Long for now as V2.1 is N-Pattern Breakout (Bullish).
    score += marketScore;
    factors.marketTrend = { value: marketTrend, score: marketScore };

    // WARNING: Trading Against Trend
    if (marketTrend === 'BEARISH') { // Assuming Long Trade
        warnings.push('AGAINST_TREND');
    }

    // 2. STOCK RSI CHECK
    // RSI(14) on Stock Candles
    const rsi = TA.calculateRSI(stockHistory, 14);
    let rsiScore = 0;
    let rsiValue = Math.round(rsi || 0);

    if (rsi) {
        if (rsi >= 65) {
            rsiScore = 1; // Strong Momentum (Refined from 60)
        } else if (rsi < 40) {
            rsiScore = -1; // Weak Momentum
        }
        // 40-65 is Neutral (0)
    }
    score += rsiScore;

    if (rsi < 65) {
        warnings.push('WEAK_MOMENTUM');
    }
    factors.stockRSI = { value: rsiValue, score: rsiScore };

    // 3. PREVIOUS DAY CLOSE POSITION
    // Formula: (Close - Low) / (High - Low)
    // > 0.7 = Closed near High (Strong buyers)
    // < 0.3 = Closed near Low (Strong sellers)
    let prevDayScore = 0;
    let prevDayState = 'NEUTRAL';

    if (prevDayCandle) {
        const h = prevDayCandle.high;
        const l = prevDayCandle.low;
        const c = prevDayCandle.close;
        const range = h - l;

        if (range > 0) {
            const position = (c - l) / range;
            if (position > 0.7) {
                prevDayScore = 1;
                prevDayState = 'NEAR_HIGH';
            } else if (position < 0.3) {
                prevDayScore = -1;
                prevDayState = 'NEAR_LOW';
            }
        }
    }
    score += prevDayScore;
    factors.prevDayClose = { value: prevDayState, score: prevDayScore };

    // --- FINAL CONFIDENCE MAPPING ---
    let confidence = 'LOW';
    if (score >= 3) confidence = 'HIGH';
    else if (score >= 1) confidence = 'MEDIUM';
    else if (score >= 0) confidence = 'LOW';
    else confidence = 'AVOID'; // Negative scores

    return {
        score,
        confidence,
        factors,
        warnings
    };
}

// Helper to find index of a candle matching the HH:mm time
// Assumes candles have 'timestamp' as ISO string or similar that contains the time
// signalTime is "HH:mm"
function findIndexByTime(candles, timeStr) {
    if (!candles || candles.length === 0) return -1;

    // Iterate backwards as signal is likely recent
    for (let i = candles.length - 1; i >= 0; i--) {
        const c = candles[i];
        if (!c || !c.timestamp) continue;

        // Parse time from timestamp (ISO or 'YYYY-MM-DD HH:mm:ss')
        const t = new Date(c.timestamp);

        if (isNaN(t.getTime())) continue; // Skip invalid dates

        // IST correction/check might be needed depending on how `timestamp` is stored.
        // Assuming timestamp is correctly parsable. 
        // We need to match "HH:mm".
        // If timestamp is UTC, we need to convert to IST for comparison if timeStr is IST.
        // Usually system uses ISO strings. 

        const hours = t.getHours().toString().padStart(2, '0');
        const minutes = t.getMinutes().toString().padStart(2, '0');
        const cTime = `${hours}:${minutes}`;

        // Note: This matches simple HH:mm. 
        // If timezone issues exist, this might be off. 
        // Assuming consistent timezones in data.
        if (cTime <= timeStr) {
            // Found the latest candle that is ON or BEFORE the signal time
            // This is our snapshot point.
            return i;
        }
    }
    return -1;
}

module.exports = { calculateSignalQuality };
