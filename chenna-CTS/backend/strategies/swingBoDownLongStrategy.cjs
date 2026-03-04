const { RSI } = require('technicalindicators');
const { calculateIntelligentStop } = require('../services/stopLossCalculator.cjs');

/**
 * Strategy: ST_SWING_BO_DOWN (V2 - Mean Reversion)
 * 
 * Logic:
 * 1. Filter: Weekly Trend MUST be UP (Price > Weekly SMA20).
 * 2. Setup: Stock is oversold (RSI < 40) or pulling back.
 * 3. Signal: Tier 1 (Strong) vs Tier 2 (Standard).
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

    const entryPrice = closes[closes.length - 1];
    const volumes = dailyCandles.map(c => c.volume || 0);
    const recentVols = volumes.slice(-20);
    const avgVolume = recentVols.length > 0 ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : 0;
    const currentVolume = volumes[volumes.length - 1];

    if (currentRsi >= 30) {
        return {
            signal: 'SKIP',
            reason: `RSI ${currentRsi.toFixed(1)} >= 30 (Skipping Tier 2/3 per strict rules)`,
            tier: 3
        };
    }

    // TIER 1 QUALITY FILTERS
    if (entryPrice < 50) {
        return { signal: 'SKIP', reason: 'Price < 50', tier: 3 };
    }
    if (avgVolume < 300000) { // proxy for liquidity / quality
        return { signal: 'SKIP', reason: `Avg Volume < 300k`, tier: 3 };
    }
    if (currentVolume < avgVolume * 2) {
        return { signal: 'SKIP', reason: 'Volume < 2x Avg (No Capitulation)', tier: 3 };
    }

    // 3. Calculate Intelligent Stop & Target
    const stopCalc = calculateIntelligentStop({
        entryPrice,
        candles: dailyCandles,
        atrMultiplier: 2.0,
        swingLookback: 5,
        vix: options.vix || null,
        niftyTrend,
        rrMultiple: 2.5  // increased slightly to hit 5-8% target more consistently as suggested
    });

    // TIER 1: STRONG BUY (Deeply Oversold Capitulation)
    return {
        signal: 'BUY',
        tier: 1,
        reason: `Oversold Capitulation (RSI ${currentRsi.toFixed(1)})`,
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
