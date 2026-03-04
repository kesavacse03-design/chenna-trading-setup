const { RSI } = require('technicalindicators');
const { calculateIntelligentStop } = require('../services/stopLossCalculator.cjs');

/**
 * Strategy: ST_SWING_BO_UP (V2 - Momentum Breakout)
 * 
 * Logic:
 * 1. Filter: Weekly Trend MUST be UP (Price > Weekly SMA20).
 * 2. Setup: Fresh Breakout preferred (RSI < 70).
 * 3. Signal: Tier 1 (Fresh) vs Tier 2 (Extended).
 * 4. Stop/Target: Intelligent ATR-based (not fixed %).
 */

async function checkSignal(stock, dailyCandles, weeklyCandles, niftyCandles, options = {}) {
    if (!dailyCandles || dailyCandles.length < 20) return null; // Min for RSI

    // 1. Calculate Indicators
    const closes = dailyCandles.map(c => c.close);

    // RSI (14)
    const rsiInput = { values: closes, period: 14 };
    const rsiValues = RSI.calculate(rsiInput);
    const currentRsi = rsiValues[rsiValues.length - 1];

    // Weekly Trend (SMA 20)
    let trendUp = false;
    if (weeklyCandles && weeklyCandles.length >= 20) {
        const wCloses = weeklyCandles.map(c => c.close);
        const sum = wCloses.slice(-20).reduce((a, b) => a + b, 0);
        const wSma20 = sum / 20;
        trendUp = wCloses[wCloses.length - 1] > wSma20;
    } else {
        // Fallback to Daily SMA50 if Weekly missing
        if (closes.length >= 50) {
            const sum = closes.slice(-50).reduce((a, b) => a + b, 0);
            const sma50 = sum / 50;
            trendUp = closes[closes.length - 1] > sma50;
        }
    }

    // Nifty Trend (for stop adjustment)
    let niftyTrend = 'SIDEWAYS';
    if (niftyCandles && niftyCandles.length > 20) {
        const nCloses = niftyCandles.map(c => c.close);
        const nSma20 = nCloses.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const nPrice = nCloses[nCloses.length - 1];
        niftyTrend = nPrice > nSma20 * 1.01 ? 'UP' : nPrice < nSma20 * 0.99 ? 'DOWN' : 'SIDEWAYS';
    }

    // 2. Classify Signal

    // FILTER: If Trend is DOWN, SKIP (Tier 3 - Coin Flip)
    if (!trendUp) {
        return {
            signal: 'SKIP',
            reason: 'Counter Trend (Weekly DOWN)',
            tier: 3
        };
    }

    // 3. Calculate Intelligent Stop & Target
    const entryPrice = closes[closes.length - 1];
    const stopCalc = calculateIntelligentStop({
        entryPrice,
        candles: dailyCandles,
        atrMultiplier: 2.0,
        swingLookback: 5,
        vix: options.vix || null,
        niftyTrend,
        rrMultiple: 2.5  // Momentum: aggressive 2.5:1 R:R
    });

    // TIER 1: FRESH BREAKOUT in UPTREND
    if (currentRsi < 70) {
        return {
            signal: 'BUY',
            tier: 1,
            reason: `Fresh Breakout (RSI ${currentRsi.toFixed(1)}) + Uptrend`,
            stopLoss: stopCalc.stopPct,
            target: stopCalc.targetPct,
            stopPrice: stopCalc.stopPrice,
            targetPrice: stopCalc.targetPrice,
            stopMethod: stopCalc.method,
            atr: stopCalc.atr,
            atrPct: stopCalc.atrPct,
            riskReward: stopCalc.riskRewardRatio
        };
    }

    // TIER 2: MOMENTUM RIDE (Extended, RSI >= 70)
    return {
        signal: 'SKIP',
        tier: 2,
        reason: `Extended Momentum (RSI ${currentRsi.toFixed(1)} >= 70) - Skipping per raw analysis`,
        stopLoss: stopCalc.stopPct,
        target: stopCalc.targetPct,
        stopPrice: stopCalc.stopPrice,
        targetPrice: stopCalc.targetPrice,
        stopMethod: stopCalc.method,
        atr: stopCalc.atr,
        atrPct: stopCalc.atrPct,
        riskReward: stopCalc.riskRewardRatio
    };
}

module.exports = { checkSignal };
