const { calculateIntelligentStop } = require('../services/stopLossCalculator.cjs');

/**
 * MULTI_SUPPORT_BO Strategy (Contrarian Reversal Long)
 * 
 * Logic verified by Raw Analysis:
 * - Edge: STRONG LONG (Ratio ~1.95x at 10 days)
 * - Concept: Support Breakdown is often a Bear Trap / Stop Hunt.
 * - Filter: None (Works across Deep Drop, Moderate Drop, and Flat Base).
 * - Holding: 10-20 Days.
 * - Stop: Wide (2.5x ATR) to survive the "trap" volatility.
 */
async function checkSignal(stock, dailyCandles, weeklyCandles, niftyCandles, options = {}) {
    if (!dailyCandles || dailyCandles.length < 30) return null;

    const closes = dailyCandles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];

    // 1. No Filter (All segments show Long Edge)
    // We just take the trade.

    // 2. Intelligent Stop & Target
    // Use wider stop because breakdowns are volatile
    const stopResult = calculateIntelligentStop({
        entryPrice: currentPrice,
        candles: dailyCandles,
        atrMultiplier: 2.5, // Wide stop
        swingLookback: 5,
        targetMultiplier: 3.0
    });

    return {
        signal: 'BUY',
        tier: 1, // High Confidence Setup
        reason: `Support Breakdown Reversal (Contrarian Buy)`,
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
