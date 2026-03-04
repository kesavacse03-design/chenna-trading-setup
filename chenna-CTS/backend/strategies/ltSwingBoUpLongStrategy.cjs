const { SMA, RSI } = require('technicalindicators');
const { calculateIntelligentStop } = require('../services/stopLossCalculator.cjs');

/**
 * LT_SWING_BO_UP Strategy (Trend Following Long)
 * 
 * Logic verified by Raw Analysis:
 * - Edge: Strong Long (Trend Continuation)
 * - Filter: Pre-Trend Rally > 5%
 * - Tier 1: Strong Momentum (>15% rally) -> 3.47x Edge!
 * - Tier 2: Moderate Momentum (5-15%) -> 1.66x Edge
 * - Holding: 15-20 Days
 */
async function checkSignal(stock, dailyCandles, weeklyCandles, niftyCandles, options = {}) {
    if (!dailyCandles || dailyCandles.length < 30) return null;

    const lookback = 20;
    const closes = dailyCandles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 1 - lookback];

    // 1. Pre-Trend Filter (Rally > 5%)
    if (!prevPrice) return null;

    const preTrendPct = ((currentPrice - prevPrice) / prevPrice) * 100;

    if (preTrendPct < 5) {
        return {
            signal: 'SKIP',
            reason: `Weak Momentum (${preTrendPct.toFixed(1)}%) - Needs > 5% rally`
        };
    }

    // 2. Intelligent Stop & Target
    // For breakouts, we can use slightly tighter stop to ride trend?
    // Raw analysis suggests allowing volatility. Use standard multiplier.
    const stopResult = calculateIntelligentStop({
        entryPrice: currentPrice,
        candles: dailyCandles,
        atrMultiplier: 2.0,
        swingLookback: 10,
        rrMultiple: 3.0 // Let winners run
    });

    // 3. Tier Classification
    let tier = 2;
    if (preTrendPct > 15) tier = 1; // "Super Momentum"

    return {
        signal: 'BUY',
        tier,
        reason: `Momentum Breakout (Rally ${preTrendPct.toFixed(1)}%)`,
        stopLoss: 0,
        target: 0,
        stopPrice: stopResult.stopPrice,
        targetPrice: stopResult.targetPrice,
        quantity: 1,
        riskReward: stopResult.riskRewardRatio,
        maxHoldDays: 20
    };
}

module.exports = { checkSignal };
