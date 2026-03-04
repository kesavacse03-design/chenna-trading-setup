/**
 * Intraday Boost Strategy
 * Wrapper for V2.1 N-Pattern Strategy
 * 
 * This is the primary strategy for INTRADAY_BOOST category
 */

const { generateIntradaySignalsV21, simulateIntradayTradeV21, backtestIntradayV21, calculateEMA } = require('./intradayStrategyV2_1.cjs');

const CONFIG = {
    name: 'INTRADAY_BOOST',
    displayName: 'Intraday Momentum Boost',
    timeframe: '1minute',
    category: 'INTRADAY_BOOST',
    direction: 'LONG',

    // Entry settings
    entryWindowStart: '09:30',
    entryWindowEnd: '14:30',

    // Target/Stop
    targetPercent: 2.0,
    stopPercent: 1.0,

    // Exit settings
    hardExit: '15:15',

    // Strategy rules
    rules: [
        'Identify stocks with strong momentum > 2%',
        'Wait for pullback to VWAP or 20MA',
        'Enter on reversal candle confirmation',
        'Target 2% from entry',
        'Stop loss at 1% or recent swing low',
        'Exit by 3:15 PM'
    ]
};

/**
 * Generate signal for a stock
 * Delegates to V2.1 strategy
 */
async function generateSignal(symbol, candles, previousClose, currentIndex) {
    // V2.1 handles signal generation internally
    // This is called per-stock, but V2.1 works on category level
    return null; // Signals are generated via generateIntradaySignalsV21
}

/**
 * Get category config
 */
function getConfig() {
    return CONFIG;
}

/**
 * Backtest the strategy
 */
async function backtest(startDate, endDate) {
    return await backtestIntradayV21('INTRADAY_BOOST', startDate, endDate);
}

module.exports = {
    CONFIG,
    generateSignal,
    getConfig,
    backtest,
    generateIntradaySignalsV21,
    simulateIntradayTradeV21,
    backtestIntradayV21
};
