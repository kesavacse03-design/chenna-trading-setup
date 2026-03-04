/**
 * High Powered Stocks Strategy
 * Swing trading strategy for high relative strength stocks
 * 
 * This is the primary strategy for HIGH_POWERED_STOCKS category
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    name: 'HIGH_POWERED_STOCKS',
    displayName: 'High Powered Swing Trades',
    timeframe: 'daily',
    category: 'HIGH_POWERED_STOCKS',
    direction: 'LONG',

    // Entry settings
    minRS: 80,
    minVolume: 500000,

    // Target/Stop
    targetPercent: 5.0,
    stopPercent: 3.0,
    maxHoldDays: 5,

    // Strategy rules
    rules: [
        'Select stocks with RS rating > 80',
        'Look for consolidation breakout or pullback to 50MA',
        'Enter on breakout with volume > 1.5x average',
        'Target 5-10% move over 3-5 days',
        'Stop loss at 3% or below 50MA',
        'Hold for max 5 days'
    ]
};

/**
 * Generate signal for a stock
 */
async function generateSignal(symbol, candles, previousClose, currentIndex) {
    if (!candles || candles.length < 20) {
        return null;
    }

    const currentCandle = candles[currentIndex];
    const prevCandles = candles.slice(Math.max(0, currentIndex - 20), currentIndex);

    if (prevCandles.length < 10) return null;

    // Calculate 20-day high
    const highOf20Days = Math.max(...prevCandles.map(c => c.high));
    const close = currentCandle.close;

    // Check for breakout
    if (close > highOf20Days) {
        // Check volume
        const avgVolume = prevCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / prevCandles.length;
        const todayVolume = currentCandle.volume || 0;

        if (todayVolume > avgVolume * 1.5) {
            return {
                symbol,
                category: CONFIG.category,
                strategy: CONFIG.name,
                strategyDisplay: CONFIG.displayName,
                direction: 'LONG',
                entryPrice: close,
                targetPrice: close * 1.05,
                stopPrice: close * 0.97,
                targetPercent: 5.0,
                stopPercent: -3.0,
                reason: `Breakout above 20-day high ${highOf20Days.toFixed(2)} with ${(todayVolume / avgVolume).toFixed(1)}x volume`,
                confidence: 65,
                timestamp: currentCandle.timestamp
            };
        }
    }

    return null;
}

/**
 * Simulate a trade
 */
async function simulateTrade(signal, candles, signalIndex) {
    const entryPrice = signal.entryPrice;
    const targetPrice = signal.targetPrice;
    const stopPrice = signal.stopPrice;

    let exitPrice = entryPrice;
    let exitReason = 'DAY5_EXIT';
    let exitIndex = Math.min(signalIndex + CONFIG.maxHoldDays, candles.length - 1);

    // Check each day after entry
    for (let i = signalIndex + 1; i <= exitIndex && i < candles.length; i++) {
        const candle = candles[i];

        // Stop hit?
        if (candle.low <= stopPrice) {
            exitPrice = stopPrice;
            exitReason = 'STOP_HIT';
            exitIndex = i;
            break;
        }

        // Target hit?
        if (candle.high >= targetPrice) {
            exitPrice = targetPrice;
            exitReason = 'TARGET_HIT';
            exitIndex = i;
            break;
        }

        exitPrice = candle.close;
    }

    const pnl = exitPrice - entryPrice;
    const pnlPercent = (pnl / entryPrice) * 100;

    return {
        ...signal,
        exitPrice,
        exitReason,
        pnl,
        pnlPercent,
        outcome: pnlPercent > 0 ? 'WIN' : 'LOSS'
    };
}

/**
 * Get category config
 */
function getConfig() {
    return CONFIG;
}

/**
 * Backtest placeholder
 */
async function backtest(startDate, endDate) {
    console.log(`[HIGH_POWERED] Backtesting ${startDate} to ${endDate}`);
    return {
        trades: [],
        stats: { totalTrades: 0, winners: 0, losers: 0, winRate: 0 }
    };
}

module.exports = {
    CONFIG,
    generateSignal,
    simulateTrade,
    backtest,
    getConfig
};
