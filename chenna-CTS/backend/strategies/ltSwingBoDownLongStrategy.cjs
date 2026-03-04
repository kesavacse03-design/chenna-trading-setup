const { SMA, RSI } = require('technicalindicators');
const { calculateIntelligentStop } = require('../services/stopLossCalculator.cjs');

/**
 * LT_SWING_BO_DOWN Strategy (Mean Reversion Long)
 * 
 * Logic verified by Raw Analysis:
 * - Edge: Long (Mean Reversion)
 * - Filter: Pre-Trend Drop > 5% (Oversold condition)
 * - Holding: 15-20 Days
 * - Stop: Wide ATR-based to accommodate volatility
 */
async function checkSignal(stock, dailyCandles, weeklyCandles, niftyCandles, options = {}) {
    if (!dailyCandles || dailyCandles.length < 30) return null;

    const lookback = 20;
    const closes = dailyCandles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 1 - lookback];

    // 1. Pre-Trend Filter (Drop > 5%)
    // If prevPrice not available (should be with length 30), skip.
    if (!prevPrice) return null;

    const preTrendPct = ((currentPrice - prevPrice) / prevPrice) * 100;

    if (preTrendPct > -5) {
        return {
            signal: 'SKIP',
            reason: `Fresh/Weak Drop (${preTrendPct.toFixed(1)}%) - Needs > 5% drop`
        };
    }

    // 2. Intelligent Stop & Target
    const stopResult = calculateIntelligentStop({
        entryPrice: currentPrice,
        candles: dailyCandles,
        atrMultiplier: 2.5, // Wider stop for LT
        swingLookback: 10,
        rrMultiple: 3.0
    });

    // 3. Tier Classification
    // Tier 1: Deep Crash (<-15%) - High Conviction
    // Tier 2: Moderate Drop (-5% to -15%)
    let tier = 2;
    if (preTrendPct < -15) tier = 1;

    return {
        signal: 'BUY',
        tier,
        reason: `Oversold Reversal (Drop ${preTrendPct.toFixed(1)}%)`,
        stopLoss: 0, // Legacy field (ignored if stopPrice present)
        target: 0,   // Legacy field
        stopPrice: stopResult.stopPrice,
        targetPrice: stopResult.targetPrice,
        quantity: 1, // Placeholder
        riskReward: stopResult.riskRewardRatio,
        maxHoldDays: 20 // Verified by raw analysis
    };
}

module.exports = { checkSignal };
