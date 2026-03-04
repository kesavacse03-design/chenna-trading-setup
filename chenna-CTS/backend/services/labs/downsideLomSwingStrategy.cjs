/**
 * DOWNSIDE_LOM_SWING Strategy - Swing Trade on Bearish LOM (SHORT)
 * 
 * Concept: Daily timeframe bearish divergence for multi-day SHORT hold
 *          Same as DOWNSIDE_LOM_INTRA but with daily candles and longer hold
 * 
 * Logic:
 * 1. Detect RSI divergence on Daily chart
 * 2. Price makes Higher High, RSI makes Lower High
 * 3. Entry on Thu/Fri for swing trades
 * 4. SHORT trade - profit when price falls
 * 
 * Timeframe: Daily
 * Entry: Thu/Fri only
 * Target: -3.0% to -5.0%
 * Stop: Above divergence high
 * Hold: Max 5-10 days
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    name: 'DOWNSIDE_LOM_SWING',
    displayName: 'Swing Bearish Divergence',
    timeframe: 'daily',
    category: 'DOWNSIDE_LOM_SWING',
    direction: 'SHORT',

    swingLookback: 3,
    divergenceLookback: 15,
    rsiPeriod: 14,
    rsiOverboughtThreshold: 60,

    entryDays: [4, 5],
    targetPercent: 4.0,
    stopPercent: 2.0,
    maxHoldDays: 7,
    minVolumeFactor: 1.2,
};

function calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return [];
    const rsiValues = new Array(candles.length).fill(null);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) gains += change; else losses += Math.abs(change);
    }
    let avgGain = gains / period, avgLoss = losses / period;
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

function findSwingHighs(candles, lookback = 3) {
    const swingHighs = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
        const currentHigh = candles[i].high;
        let isSwingHigh = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i && candles[j].high > currentHigh) { isSwingHigh = false; break; }
        }
        if (isSwingHigh) swingHighs.push({ index: i, price: currentHigh, timestamp: candles[i].timestamp });
    }
    return swingHighs;
}

function detectBearishDivergence(candles, rsiValues) {
    const swingHighs = findSwingHighs(candles, CONFIG.swingLookback);
    if (swingHighs.length < 2) return { isDivergence: false };

    const recentHigh = swingHighs[swingHighs.length - 1];
    const previousHigh = swingHighs[swingHighs.length - 2];

    if (recentHigh.price <= previousHigh.price) return { isDivergence: false };

    const recentRSI = rsiValues[recentHigh.index];
    const previousRSI = rsiValues[previousHigh.index];

    if (!recentRSI || !previousRSI || recentRSI >= previousRSI) return { isDivergence: false };

    return {
        isDivergence: true,
        priceHigh: recentHigh.price,
        previousPriceHigh: previousHigh.price,
        rsiAtHigh: recentRSI,
        previousRsi: previousRSI
    };
}

async function getDailyCandles(symbol) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({ where: { symbol, interval: 'day' }, orderBy: { createdAt: 'desc' } });
        if (!cached?.data) return [];
        let candles = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
        return candles.map(c => Array.isArray(c) ?
            { timestamp: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseInt(c[5]) } :
            { ...c, open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseInt(c.volume) }
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (e) { return []; }
}

async function getCategoryStocks() {
    const cat = await prisma.category.findUnique({ where: { key: 'DOWNSIDE_LOM_SWING' }, include: { stocks: { include: { stock: true } } } });
    return cat ? cat.stocks.map(sc => ({ symbol: sc.stock.symbol, name: sc.stock.name })) : [];
}

async function generateSignal(symbol, dailyCandles, currentDate) {
    if (dailyCandles.length < CONFIG.divergenceLookback + 10) return null;

    const day = new Date(currentDate).getDay();
    if (!CONFIG.entryDays.includes(day)) return null;

    const filteredCandles = dailyCandles.filter(c => new Date(c.timestamp) <= new Date(currentDate));
    if (filteredCandles.length < CONFIG.divergenceLookback) return null;

    const rsiValues = calculateRSI(filteredCandles, CONFIG.rsiPeriod);
    const divergence = detectBearishDivergence(filteredCandles, rsiValues);

    if (!divergence.isDivergence) return null;
    if (divergence.rsiAtHigh < CONFIG.rsiOverboughtThreshold) return null;

    const todayCandle = filteredCandles[filteredCandles.length - 1];
    const entryPrice = todayCandle.close;
    const stopPrice = divergence.priceHigh * 1.01;
    const targetPrice = entryPrice * (1 - CONFIG.targetPercent / 100);

    return {
        symbol, category: CONFIG.category, strategy: CONFIG.name, strategyDisplay: CONFIG.displayName,
        direction: 'SHORT', entryPrice, targetPrice, stopPrice, targetPercent: CONFIG.targetPercent,
        divergence: { priceHigh: divergence.priceHigh.toFixed(2), rsiAtHigh: divergence.rsiAtHigh.toFixed(1) },
        reason: `Daily bearish divergence. RSI ${divergence.rsiAtHigh.toFixed(1)} made LH. Swing SHORT.`,
        confidence: 55 + (divergence.previousRsi - divergence.rsiAtHigh > 5 ? 10 : 5),
        timestamp: currentDate, maxHoldDays: CONFIG.maxHoldDays
    };
}

async function simulateTrade(signal, candles, signalIndex) {
    let exitPrice = signal.entryPrice, exitReason = 'MAX_HOLD', holdDays = 0;

    for (let i = signalIndex + 1; i < candles.length && holdDays < CONFIG.maxHoldDays; i++) {
        holdDays++;
        if (candles[i].high >= signal.stopPrice) { exitPrice = signal.stopPrice; exitReason = 'STOP_HIT'; break; }
        if (candles[i].low <= signal.targetPrice) { exitPrice = signal.targetPrice; exitReason = 'TARGET_HIT'; break; }
        exitPrice = candles[i].close;
    }

    const pnlPercent = ((signal.entryPrice - exitPrice) / signal.entryPrice) * 100;
    return { ...signal, exitPrice, exitReason, holdDays, pnlPercent, outcome: pnlPercent > 0 ? 'WIN' : 'LOSS' };
}

async function backtest(startDate, endDate) {
    console.log(`[DOWNSIDE_LOM_SWING] Backtesting SHORT ${startDate} to ${endDate}`);
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
    console.log(`[DOWNSIDE_LOM_SWING] ${trades.length} trades, ${winRate.toFixed(1)}% WR`);
    return { trades, stats: { totalTrades: trades.length, winRate } };
}

module.exports = { CONFIG, generateSignal, simulateTrade, backtest, getCategoryStocks, getDailyCandles };
