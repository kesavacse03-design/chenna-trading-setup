/**
 * UPSIDE_LOM_SWING Strategy - Swing Trade on Bullish LOM Reversal
 * 
 * Concept: Daily timeframe bullish divergence for multi-day hold
 *          Same as UPSIDE_LOM_INTRA but with daily candles and longer hold
 * 
 * Logic:
 * 1. Detect RSI divergence on Daily chart
 * 2. Price makes Lower Low, RSI makes Higher Low
 * 3. Entry on Thu/Fri for swing trades
 * 4. Hold: 3-5 days
 * 
 * Timeframe: Daily
 * Entry: Thu/Fri only (swing entry days)
 * Target: +3.0% to +5.0%
 * Stop: Below divergence low
 * Hold: Max 5-10 days
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    name: 'UPSIDE_LOM_SWING',
    displayName: 'Swing Bullish Divergence',
    timeframe: 'daily',
    category: 'UPSIDE_LOM_SWING',
    direction: 'LONG',

    // Divergence settings
    swingLookback: 3,               // Days for swing high/low
    divergenceLookback: 15,         // Days to look for divergence
    rsiPeriod: 14,
    rsiOversoldThreshold: 40,

    // Entry settings
    entryDays: [4, 5],              // Thu, Fri

    // Exit settings
    targetPercent: 4.0,
    stopPercent: 2.0,
    maxHoldDays: 7,

    // Filters
    minVolumeFactor: 1.2,
};

/**
 * Calculate RSI
 */
function calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return [];

    const rsiValues = new Array(candles.length).fill(null);
    let gains = 0, losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period; i < candles.length; i++) {
        if (i > period) {
            const change = candles[i].close - candles[i - 1].close;
            avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
            avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
        }
        rsiValues[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }

    return rsiValues;
}

/**
 * Find swing lows
 */
function findSwingLows(candles, lookback = 3) {
    const swingLows = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
        const currentLow = candles[i].low;
        let isSwingLow = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i && candles[j].low < currentLow) {
                isSwingLow = false;
                break;
            }
        }
        if (isSwingLow) {
            swingLows.push({ index: i, price: currentLow, timestamp: candles[i].timestamp });
        }
    }
    return swingLows;
}

/**
 * Detect bullish divergence
 */
function detectBullishDivergence(candles, rsiValues) {
    const swingLows = findSwingLows(candles, CONFIG.swingLookback);
    if (swingLows.length < 2) return { isDivergence: false };

    const recentLow = swingLows[swingLows.length - 1];
    const previousLow = swingLows[swingLows.length - 2];

    // Price LL, RSI HL
    if (recentLow.price >= previousLow.price) return { isDivergence: false };

    const recentRSI = rsiValues[recentLow.index];
    const previousRSI = rsiValues[previousLow.index];

    if (!recentRSI || !previousRSI || recentRSI <= previousRSI) return { isDivergence: false };

    return {
        isDivergence: true,
        priceLow: recentLow.price,
        previousPriceLow: previousLow.price,
        rsiAtLow: recentRSI,
        previousRsi: previousRSI
    };
}

/**
 * Get daily candles
 */
async function getDailyCandles(symbol) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });
        if (!cached || !cached.data) return [];
        let candles = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
        return candles.map(c => Array.isArray(c) ? {
            timestamp: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]),
            low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseInt(c[5])
        } : {
            ...c, open: parseFloat(c.open), high: parseFloat(c.high),
            low: parseFloat(c.low), close: parseFloat(c.close), volume: parseInt(c.volume)
        }
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (e) { return []; }
}

/**
 * Get category stocks
 */
async function getCategoryStocks() {
    const cat = await prisma.category.findUnique({
        where: { key: 'UPSIDE_LOM_SWING' },
        include: { stocks: { include: { stock: true } } }
    });
    return cat ? cat.stocks.map(sc => ({ symbol: sc.stock.symbol, name: sc.stock.name })) : [];
}

/**
 * Generate signal
 */
async function generateSignal(symbol, dailyCandles, currentDate) {
    if (dailyCandles.length < CONFIG.divergenceLookback + 10) return null;

    const day = new Date(currentDate).getDay();
    if (!CONFIG.entryDays.includes(day)) return null;

    const filteredCandles = dailyCandles.filter(c => new Date(c.timestamp) <= new Date(currentDate));
    if (filteredCandles.length < CONFIG.divergenceLookback) return null;

    const rsiValues = calculateRSI(filteredCandles, CONFIG.rsiPeriod);
    const divergence = detectBullishDivergence(filteredCandles, rsiValues);

    if (!divergence.isDivergence) return null;
    if (divergence.rsiAtLow > CONFIG.rsiOversoldThreshold) return null;

    const todayCandle = filteredCandles[filteredCandles.length - 1];
    const entryPrice = todayCandle.close;
    const stopPrice = divergence.priceLow * 0.99;
    const targetPrice = entryPrice * (1 + CONFIG.targetPercent / 100);

    return {
        symbol,
        category: CONFIG.category,
        strategy: CONFIG.name,
        strategyDisplay: CONFIG.displayName,
        direction: 'LONG',
        entryPrice, targetPrice, stopPrice,
        targetPercent: CONFIG.targetPercent,
        divergence: {
            priceLow: divergence.priceLow.toFixed(2),
            rsiAtLow: divergence.rsiAtLow.toFixed(1)
        },
        reason: `Daily bullish divergence. RSI ${divergence.rsiAtLow.toFixed(1)} made HL. Swing entry.`,
        confidence: 55 + (divergence.rsiAtLow - divergence.previousRsi > 5 ? 10 : 5),
        timestamp: currentDate,
        maxHoldDays: CONFIG.maxHoldDays
    };
}

/**
 * Simulate trade
 */
async function simulateTrade(signal, candles, signalIndex) {
    let exitPrice = signal.entryPrice, exitReason = 'MAX_HOLD', holdDays = 0;

    for (let i = signalIndex + 1; i < candles.length && holdDays < CONFIG.maxHoldDays; i++) {
        holdDays++;
        if (candles[i].low <= signal.stopPrice) { exitPrice = signal.stopPrice; exitReason = 'STOP_HIT'; break; }
        if (candles[i].high >= signal.targetPrice) { exitPrice = signal.targetPrice; exitReason = 'TARGET_HIT'; break; }
        exitPrice = candles[i].close;
    }

    const pnlPercent = ((exitPrice - signal.entryPrice) / signal.entryPrice) * 100;
    return { ...signal, exitPrice, exitReason, holdDays, pnlPercent, outcome: pnlPercent > 0 ? 'WIN' : 'LOSS' };
}

async function backtest(startDate, endDate) {
    console.log(`[UPSIDE_LOM_SWING] Backtesting ${startDate} to ${endDate}`);
    const trades = [], stocks = await getCategoryStocks();
    for (const stock of stocks) {
        const candles = await getDailyCandles(stock.symbol);
        for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const signal = await generateSignal(stock.symbol, candles, d.toISOString().split('T')[0]);
            if (signal) {
                const idx = candles.findIndex(c => new Date(c.timestamp).toISOString().split('T')[0] === d.toISOString().split('T')[0]);
                if (idx >= 0) trades.push(await simulateTrade(signal, candles, idx));
            }
        }
    }
    const winRate = trades.length ? (trades.filter(t => t.outcome === 'WIN').length / trades.length) * 100 : 0;
    console.log(`[UPSIDE_LOM_SWING] ${trades.length} trades, ${winRate.toFixed(1)}% WR`);
    return { trades, stats: { totalTrades: trades.length, winRate } };
}

module.exports = { CONFIG, generateSignal, simulateTrade, backtest, getCategoryStocks, getDailyCandles };
