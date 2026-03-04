const { calculateIntelligentStop } = require('../services/stopLossCalculator.cjs');

/**
 * MULTI_RESISTANCE_BO Strategy (Breakout from Base)
 * 
 * Logic verified by Raw Analysis:
 * - Edge: Long (Ratio 1.57x at 20 days)
 * - Condition: PRE-TREND must be FLAT (-5% to +5%).
 * - Failure Mode: Moderate Rally (5-15%) breakouts tend to fail.
 * - Holding: 20 Days.
 */
async function checkSignal(stock, dailyCandles, weeklyCandles, niftyCandles, options = {}) {
    if (!dailyCandles || dailyCandles.length < 30) return null;

    const lookback = 20;
    const closes = dailyCandles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 1 - lookback];

    // 1. Pre-Trend Filter (Must be Flat Base)
    if (!prevPrice) return null;

    const preTrendPct = ((currentPrice - prevPrice) / prevPrice) * 100;

    // Range: -5% to +5%
    if (preTrendPct < -5 || preTrendPct > 5) {
        return {
            signal: 'SKIP',
            reason: `Pre-Trend ${preTrendPct.toFixed(1)}% (Not a Flat Base)`
        };
    }

    // 2. Intelligent Stop & Target
    const stopResult = calculateIntelligentStop({
        entryPrice: currentPrice,
        candles: dailyCandles,
        atrMultiplier: 2.0,
        swingLookback: 10,
        rrMultiple: 3.0
    });

    return {
        signal: 'BUY',
        tier: 1, // Base Breakout is Tier 1
        reason: `Base Breakout (Pre-Trend ${preTrendPct.toFixed(1)}%)`,
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
