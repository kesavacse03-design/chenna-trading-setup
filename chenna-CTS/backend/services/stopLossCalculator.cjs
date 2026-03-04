/**
 * Intelligent Stop Loss Calculator
 * 
 * Professional-grade stop loss system combining:
 * 1. ATR-based volatility stop
 * 2. Swing structure stop
 * 3. VIX market volatility adjustment
 * 4. Nifty trend context adjustment
 * 5. Trailing stop with activation threshold + breakeven
 * 
 * Philosophy: Each stock gets a stop tailored to ITS volatility,
 * adjusted for current market conditions. No more "4% for everyone".
 */

// ═══════════════════════════════════════════════════════════
// CORE CALCULATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Calculate Average True Range (14-period default)
 * Measures a stock's daily volatility in absolute terms.
 * 
 * @param {Array} candles - OHLCV candle array (sorted oldest→newest)
 * @param {number} period - Lookback period (default 14)
 * @returns {number} ATR value in price units
 */
function calculateATR(candles, period = 14) {
    if (!candles || candles.length < period + 1) return 0;

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trueRanges.push(tr);
    }

    if (trueRanges.length < period) return 0;

    // Simple Moving Average of last `period` true ranges
    const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
    return atr;
}

/**
 * Find the lowest low in the last N candles (swing low).
 * Used for structure-based stop placement.
 * 
 * @param {Array} candles - OHLCV candle array (sorted oldest→newest)
 * @param {number} lookback - How many candles to search back (default 5)
 * @returns {number} The lowest low price found
 */
function findSwingLow(candles, lookback = 5) {
    if (!candles || candles.length < lookback) return 0;

    const recentCandles = candles.slice(-lookback);
    let lowestLow = Infinity;

    for (const c of recentCandles) {
        if (c.low < lowestLow) {
            lowestLow = c.low;
        }
    }

    return lowestLow;
}

// ═══════════════════════════════════════════════════════════
// INTELLIGENT STOP LOSS
// ═══════════════════════════════════════════════════════════

/**
 * Calculate an intelligent stop loss combining ATR + Swing Structure + Market Context.
 * 
 * @param {Object} params
 * @param {number} params.entryPrice - Entry price
 * @param {Array}  params.candles - Daily candles (min 20, sorted oldest→newest)
 * @param {number} [params.atrPeriod=14] - ATR lookback
 * @param {number} [params.atrMultiplier=2.0] - ATR stop multiplier
 * @param {number} [params.swingLookback=5] - Swing low lookback
 * @param {number} [params.vix=null] - India VIX value (optional)
 * @param {string} [params.niftyTrend=null] - 'UP'|'DOWN'|'SIDEWAYS' (optional)
 * @param {number} [params.minStopPct=0.02] - Minimum stop distance (2%)
 * @param {number} [params.maxStopPct=0.10] - Maximum stop distance (10%)
 * @param {number} [params.rrMultiple=2.5] - Risk:Reward multiple for target
 * @returns {Object} Stop loss details
 */
function calculateIntelligentStop(params) {
    const {
        entryPrice,
        candles,
        atrPeriod = 14,
        atrMultiplier = 2.0,
        swingLookback = 5,
        vix = null,
        niftyTrend = null,
        minStopPct = 0.02,
        maxStopPct = 0.10,
        rrMultiple = 2.5,
    } = params;

    if (!entryPrice || !candles || candles.length < 15) {
        // Fallback: fixed 4% if insufficient data
        return {
            stopPrice: round2(entryPrice * 0.96),
            stopPct: 4.0,
            targetPrice: round2(entryPrice * 1.10),
            targetPct: 10.0,
            method: 'FALLBACK_FIXED',
            atr: 0,
            swingLow: 0,
            vixAdjustment: 1.0,
            trendAdjustment: 1.0,
            riskRewardRatio: '1:2.5'
        };
    }

    // 1. Calculate ATR
    const atr = calculateATR(candles, atrPeriod);

    // 2. Find Swing Low
    const swingLow = findSwingLow(candles, swingLookback);

    // 3. Base stop prices
    const atrStop = entryPrice - (atr * atrMultiplier);
    const structureStop = swingLow - (atr * 0.2); // Just below structure

    // 4. VIX adjustment — widen stop in high-fear markets
    let vixAdjustment = 1.0;
    if (vix !== null && vix > 20) {
        vixAdjustment = 1 + ((vix - 20) / 50); // VIX 25 → 1.10, VIX 30 → 1.20
    }

    // 5. Nifty trend adjustment — widen for counter-trend longs
    let trendAdjustment = 1.0;
    if (niftyTrend === 'DOWN') {
        trendAdjustment = 1.10; // 10% wider for counter-trend
    }

    // 6. Apply adjustments (widen the stop distance)
    const totalAdj = vixAdjustment * trendAdjustment;
    const adjAtrStop = entryPrice - ((entryPrice - atrStop) * totalAdj);
    const adjStructureStop = entryPrice - ((entryPrice - structureStop) * totalAdj);

    // 7. Use the TIGHTER of the two (closer to entry)
    let stopPrice = Math.max(adjAtrStop, adjStructureStop);
    let method = stopPrice === adjAtrStop ? 'ATR_BASED' : 'STRUCTURE_BASED';

    // 8. Clamp to min/max bounds
    let stopPct = (entryPrice - stopPrice) / entryPrice;
    if (stopPct < minStopPct) {
        stopPrice = entryPrice * (1 - minStopPct);
        stopPct = minStopPct;
        method += '_CLAMPED_MIN';
    }
    if (stopPct > maxStopPct) {
        stopPrice = entryPrice * (1 - maxStopPct);
        stopPct = maxStopPct;
        method += '_CLAMPED_MAX';
    }

    // 9. Calculate target from risk
    const risk = entryPrice - stopPrice;
    const targetPrice = entryPrice + (risk * rrMultiple);
    const targetPct = (targetPrice - entryPrice) / entryPrice;

    return {
        stopPrice: round2(stopPrice),
        stopPct: round2(stopPct * 100),
        targetPrice: round2(targetPrice),
        targetPct: round2(targetPct * 100),
        method,
        atr: round2(atr),
        atrPct: round2((atr / entryPrice) * 100),
        swingLow: round2(swingLow),
        vixAdjustment: round2(vixAdjustment),
        trendAdjustment: round2(trendAdjustment),
        riskRewardRatio: `1:${rrMultiple}`
    };
}

// ═══════════════════════════════════════════════════════════
// TRAILING STOP
// ═══════════════════════════════════════════════════════════

/**
 * Calculate trailing stop with activation threshold and breakeven logic.
 * 
 * Rules:
 * 1. Trail only activates after price moves +activationPct from entry
 * 2. Once active, stop = highestPrice × (1 - trailPct)
 * 3. Stop only moves UP, never down
 * 4. After +breakevenPct, floor the stop at entry price (zero risk)
 * 
 * @param {Object} params
 * @param {number} params.entryPrice - Original entry price
 * @param {number} params.currentStop - Current stop level
 * @param {number} params.highestPrice - Highest price reached since entry
 * @param {number} [params.trailPct=0.03] - Trail distance (3%)
 * @param {number} [params.activationPct=0.015] - Activation threshold (1.5%)
 * @param {number} [params.breakevenPct=0.02] - Breakeven threshold (2%)
 * @returns {Object} Updated stop details
 */
function calculateTrailingStop(params) {
    const {
        entryPrice,
        currentStop,
        highestPrice,
        trailPct = 0.03,
        activationPct = 0.015,
        breakevenPct = 0.02,
    } = params;

    const unrealizedPnl = (highestPrice - entryPrice) / entryPrice;
    let newStop = currentStop;
    let action = 'NO_CHANGE';

    // 1. Check breakeven condition first (after +2% from entry)
    if (unrealizedPnl >= breakevenPct && currentStop < entryPrice) {
        newStop = entryPrice;
        action = 'BREAKEVEN';
    }

    // 2. Check trailing activation (after +1.5% from entry)
    if (unrealizedPnl >= activationPct) {
        const trailStop = highestPrice * (1 - trailPct);

        // Only move stop UP, never down
        if (trailStop > newStop) {
            newStop = trailStop;
            action = 'TRAIL_UPDATE';
        }
    }

    return {
        newStop: round2(newStop),
        previousStop: round2(currentStop),
        action,
        unrealizedPnl: round2(unrealizedPnl * 100),
        trailActive: unrealizedPnl >= activationPct,
        atBreakeven: newStop >= entryPrice
    };
}

// ═══════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════

function round2(val) {
    return Math.round(val * 100) / 100;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
    calculateATR,
    findSwingLow,
    calculateIntelligentStop,
    calculateTrailingStop
};
