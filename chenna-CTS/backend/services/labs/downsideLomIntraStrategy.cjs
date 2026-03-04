/**
 * DOWNSIDE_LOM_INTRA Strategy - Bearish Divergence Reversal (SHORT)
 * 
 * Concept: "Loss of Momentum" on upside = Bearish reversal coming
 *          Price making higher highs, but RSI making lower highs (BEARISH DIVERGENCE)
 *          This is a SHORT trade (sell first, buy back lower)
 * 
 * Logic:
 * 1. Detect RSI divergence on 5-min chart
 * 2. Price makes Higher High, RSI makes Lower High
 * 3. Confirm with price closing below 10 EMA
 * 4. Entry short with increased volume
 * 
 * Timeframe: 5-minute
 * Entry: 9:30 AM - 2:00 PM
 * Target: -1.0% to -1.5% (price going DOWN)
 * Stop: Above divergence high
 * Exit: EOD at 3:15 PM
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    name: 'DOWNSIDE_LOM_INTRA',
    displayName: 'Bearish Divergence Reversal',
    timeframe: '5minute',
    category: 'DOWNSIDE_LOM_INTRA',
    direction: 'SHORT',

    // Divergence settings
    swingLookback: 5,           // Candles to define swing high/low
    divergenceLookback: 20,     // Candles to look for divergence pattern
    rsiPeriod: 14,
    rsiOverboughtThreshold: 60, // RSI must have been above this

    // Entry settings
    entryWindowStart: '09:30',
    entryWindowEnd: '14:00',
    confirmationEMA: 10,

    // Exit settings
    targetPercent: 1.5,         // Price drops 1.5% (SHORT profit)
    stopBufferPercent: 0.2,     // Buffer above divergence high
    eodExit: '15:15',

    // Filters
    minVolumeFactor: 1.5,       // Volume > 1.5x average
};

/**
 * Calculate RSI for a series of candles
 */
function calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return [];

    const rsiValues = new Array(candles.length).fill(null);
    let gains = 0;
    let losses = 0;

    // Calculate first average gain/loss
    for (let i = 1; i <= period; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Calculate RSI for each candle
    for (let i = period; i < candles.length; i++) {
        if (i > period) {
            const change = candles[i].close - candles[i - 1].close;
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }

        if (avgLoss === 0) {
            rsiValues[i] = 100;
        } else {
            const rs = avgGain / avgLoss;
            rsiValues[i] = 100 - (100 / (1 + rs));
        }
    }

    return rsiValues;
}

/**
 * Calculate EMA for a series of candles
 */
function calculateEMA(candles, period) {
    if (candles.length < period) return null;

    const multiplier = 2 / (period + 1);
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;

    for (let i = period; i < candles.length; i++) {
        ema = (candles[i].close - ema) * multiplier + ema;
    }

    return ema;
}

/**
 * Find swing highs in price data
 */
function findSwingHighs(candles, lookback = 5) {
    const swingHighs = [];

    for (let i = lookback; i < candles.length - lookback; i++) {
        const currentHigh = candles[i].high;
        let isSwingHigh = true;

        // Check if this is the highest point within lookback range
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i && candles[j].high > currentHigh) {
                isSwingHigh = false;
                break;
            }
        }

        if (isSwingHigh) {
            swingHighs.push({
                index: i,
                price: currentHigh,
                timestamp: candles[i].timestamp
            });
        }
    }

    return swingHighs;
}

/**
 * Detect bearish divergence (Price HH, RSI LH)
 */
function detectBearishDivergence(candles, rsiValues) {
    const swingHighs = findSwingHighs(candles, CONFIG.swingLookback);

    if (swingHighs.length < 2) {
        return { isDivergence: false };
    }

    // Compare last two swing highs
    const recentHigh = swingHighs[swingHighs.length - 1];
    const previousHigh = swingHighs[swingHighs.length - 2];

    // Price made Higher High?
    if (recentHigh.price <= previousHigh.price) {
        return { isDivergence: false };
    }

    // RSI made Lower High?
    const recentRSI = rsiValues[recentHigh.index];
    const previousRSI = rsiValues[previousHigh.index];

    if (!recentRSI || !previousRSI) {
        return { isDivergence: false };
    }

    if (recentRSI >= previousRSI) {
        return { isDivergence: false };
    }

    // Bearish divergence confirmed!
    return {
        isDivergence: true,
        divergenceType: 'BEARISH',
        priceHigh: recentHigh.price,
        previousPriceHigh: previousHigh.price,
        divergenceIndex: recentHigh.index,
        rsiAtHigh: recentRSI,
        previousRsi: previousRSI,
        highTimestamp: recentHigh.timestamp
    };
}

/**
 * Check if current time is within entry window
 */
function isWithinEntryWindow(timestamp) {
    const time = new Date(timestamp);
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const timeValue = hours * 60 + minutes;

    const [startH, startM] = CONFIG.entryWindowStart.split(':').map(Number);
    const [endH, endM] = CONFIG.entryWindowEnd.split(':').map(Number);

    const startValue = startH * 60 + startM;
    const endValue = endH * 60 + endM;

    return timeValue >= startValue && timeValue <= endValue;
}

/**
 * Get 5-minute candles for a stock on a date
 */
async function get5MinCandles(symbol, date) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: {
                symbol,
                interval: '5minute'
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) {
            return await aggregate1MinTo5Min(symbol, date);
        }

        let candles = cached.data;
        if (typeof candles === 'string') {
            candles = JSON.parse(candles);
        }

        // Filter to specific date
        const targetDate = new Date(date).toDateString();
        const filtered = candles.filter(c => {
            const candleDate = new Date(c.timestamp || c[0]).toDateString();
            return candleDate === targetDate;
        });

        return filtered.map(c => {
            if (Array.isArray(c)) {
                return {
                    timestamp: c[0],
                    open: parseFloat(c[1]) || 0,
                    high: parseFloat(c[2]) || 0,
                    low: parseFloat(c[3]) || 0,
                    close: parseFloat(c[4]) || 0,
                    volume: parseInt(c[5]) || 0
                };
            }
            return {
                timestamp: c.timestamp || c.date,
                open: parseFloat(c.open) || 0,
                high: parseFloat(c.high) || 0,
                low: parseFloat(c.low) || 0,
                close: parseFloat(c.close) || 0,
                volume: parseInt(c.volume) || 0
            };
        });
    } catch (error) {
        console.error(`[DOWNSIDE_LOM_INTRA] Error loading candles for ${symbol}:`, error.message);
        return [];
    }
}

/**
 * Aggregate 1-minute candles to 5-minute
 */
async function aggregate1MinTo5Min(symbol, date) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: '1minute' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return [];

        let candles = cached.data;
        if (typeof candles === 'string') {
            candles = JSON.parse(candles);
        }

        const aggregated = [];
        for (let i = 0; i < candles.length; i += 5) {
            const batch = candles.slice(i, i + 5);
            if (batch.length === 0) continue;

            const first = batch[0];
            const last = batch[batch.length - 1];

            aggregated.push({
                timestamp: Array.isArray(first) ? first[0] : first.timestamp,
                open: Array.isArray(first) ? parseFloat(first[1]) : parseFloat(first.open),
                high: Math.max(...batch.map(c => Array.isArray(c) ? parseFloat(c[2]) : parseFloat(c.high))),
                low: Math.min(...batch.map(c => Array.isArray(c) ? parseFloat(c[3]) : parseFloat(c.low))),
                close: Array.isArray(last) ? parseFloat(last[4]) : parseFloat(last.close),
                volume: batch.reduce((sum, c) => sum + (Array.isArray(c) ? parseInt(c[5]) || 0 : parseInt(c.volume) || 0), 0)
            });
        }

        return aggregated;
    } catch (error) {
        console.error(`[DOWNSIDE_LOM_INTRA] Error aggregating candles:`, error.message);
        return [];
    }
}

/**
 * Get stocks from DOWNSIDE_LOM_INTRA category for a date
 */
async function getCategoryStocks(date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const category = await prisma.category.findUnique({
        where: { key: 'DOWNSIDE_LOM_INTRA' },
        include: {
            stocks: {
                include: { stock: true },
                where: {
                    addedDate: { gte: targetDate }
                }
            }
        }
    });

    if (!category) return [];

    return category.stocks.map(sc => ({
        symbol: sc.stock.symbol,
        name: sc.stock.name,
        addedDate: sc.addedDate
    }));
}

/**
 * Detect volume contraction at TOP (TradeCode: volume contracting at top = distribution)
 */
function detectVolumeContraction(candles, lookback = 10) {
    if (candles.length < lookback) return { isContracting: false };

    const volumes = candles.slice(-lookback).map(c => c.volume);
    const midpoint = Math.floor(lookback / 2);
    const olderVolumes = volumes.slice(0, midpoint);
    const recentVolumes = volumes.slice(midpoint);

    const olderAvg = olderVolumes.reduce((a, b) => a + b, 0) / olderVolumes.length;
    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

    const contractionRatio = recentAvg / olderAvg;
    const isContracting = contractionRatio < 0.8;  // 20% lower = distribution

    return { isContracting, contractionRatio, olderAvg, recentAvg };
}

/**
 * Check for EMA breakdown (TradeCode: weakness candle breaking below EMA)
 */
function checkEMABreakdown(candles, ema10, lookback = 3) {
    if (candles.length < lookback + 1) return { isBreakingDown: false };

    const recentCandles = candles.slice(-lookback);

    // Check if price was above EMA and is now breaking down
    let wasAboveEMA = false;
    for (const candle of recentCandles.slice(0, -1)) {
        if (candle.close > ema10) {
            wasAboveEMA = true;
            break;
        }
    }

    const currentCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    const isBreakingDown = currentCandle.close < previousCandle.close && currentCandle.close < ema10;

    // Check weakness candle (bearish body)
    const body = Math.abs(currentCandle.close - currentCandle.open);
    const range = currentCandle.high - currentCandle.low;
    const isBearish = currentCandle.close < currentCandle.open;
    const isWeaknessCandle = range > 0 && (body / range) >= 0.6 && isBearish;

    return {
        isBreakingDown: wasAboveEMA && isBreakingDown,
        isWeaknessCandle,
        wasAboveEMA,
        currentBelowEMA: currentCandle.close < ema10
    };
}

/**
 * Generate SHORT signal for a stock on a date (with TradeCode enhancements)
 */
async function generateSignal(symbol, candles, currentTime) {
    if (candles.length < CONFIG.divergenceLookback) {
        return null;
    }

    // 1. Check time window
    if (!isWithinEntryWindow(currentTime)) {
        return null;
    }

    // 2. Calculate RSI
    const rsiValues = calculateRSI(candles, CONFIG.rsiPeriod);

    // 3. Detect bearish divergence
    const divergence = detectBearishDivergence(candles, rsiValues);
    if (!divergence.isDivergence) {
        return null;
    }

    // 4. Check RSI was overbought
    if (divergence.rsiAtHigh < CONFIG.rsiOverboughtThreshold) {
        return null;  // RSI wasn't high enough
    }

    // 5. Check confirmation (price below 10 EMA)
    const currentPrice = candles[candles.length - 1].close;
    const ema10 = calculateEMA(candles, CONFIG.confirmationEMA);

    if (currentPrice >= ema10) {
        return null;  // Not confirmed yet - price still above EMA
    }

    // ═══════════════════════════════════════════════════════════════
    // NEW TradeCode Filters for SHORT
    // ═══════════════════════════════════════════════════════════════

    // TRADECODE FILTER 1: Volume Contraction at TOP
    // Volume contracting at top = distribution = bearish
    const volumeContraction = detectVolumeContraction(candles, 10);

    // TRADECODE FILTER 2: EMA Breakdown
    // Price breaking below EMA with weakness candle
    const emaBreakdown = checkEMABreakdown(candles, ema10, 3);

    // 6. Check entry volume
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const currentVolume = candles[candles.length - 1].volume;
    const volumeOK = currentVolume >= avgVolume * 1.2;

    // ═══════════════════════════════════════════════════════════════
    // Scoring: Need at least 2 of 3 TradeCode checks
    // ═══════════════════════════════════════════════════════════════

    const tradeCodeScore = [
        volumeContraction.isContracting,
        emaBreakdown.isBreakingDown || emaBreakdown.currentBelowEMA,
        volumeOK
    ].filter(Boolean).length;

    if (tradeCodeScore < 2) {
        return null;
    }

    // 7. Generate SHORT signal
    const entryPrice = currentPrice;
    const stopPrice = divergence.priceHigh * (1 + CONFIG.stopBufferPercent / 100);
    const targetPrice = entryPrice * (1 - CONFIG.targetPercent / 100);

    return {
        symbol,
        category: CONFIG.category,
        strategy: CONFIG.name,
        strategyDisplay: CONFIG.displayName,
        direction: CONFIG.direction,
        entryPrice,
        targetPrice,
        stopPrice,
        targetPercent: CONFIG.targetPercent,
        stopPercent: ((stopPrice - entryPrice) / entryPrice * 100).toFixed(2),
        divergence: {
            priceHigh: divergence.priceHigh,
            previousHigh: divergence.previousPriceHigh,
            rsiAtHigh: divergence.rsiAtHigh.toFixed(1),
            previousRsi: divergence.previousRsi.toFixed(1)
        },
        tradeCodeChecks: {
            volumeContraction: volumeContraction.isContracting,
            contractionRatio: volumeContraction.contractionRatio?.toFixed(2),
            emaBreakdown: emaBreakdown.isBreakingDown,
            weaknessCandle: emaBreakdown.isWeaknessCandle,
            score: tradeCodeScore
        },
        reason: `Bearish divergence with volume contraction at top (${(volumeContraction.contractionRatio * 100).toFixed(0)}% of prior). ${emaBreakdown.isBreakingDown ? 'EMA breakdown confirmed.' : 'Price below 10 EMA.'} SHORT entry.`,
        confidence: calculateConfidence(divergence, currentVolume, avgVolume, volumeContraction, emaBreakdown),
        timestamp: currentTime,
        eodExit: CONFIG.eodExit
    };
}

/**
 * Calculate confidence based on divergence strength, volume, and TradeCode checks
 */
function calculateConfidence(divergence, currentVolume, avgVolume, volumeContraction, emaBreakdown) {
    let confidence = 45;

    // RSI divergence strength
    const rsiDiff = divergence.previousRsi - divergence.rsiAtHigh;
    if (rsiDiff > 10) confidence += 12;
    else if (rsiDiff > 5) confidence += 8;
    else confidence += 4;

    // Price divergence strength
    const priceDiff = ((divergence.priceHigh - divergence.previousPriceHigh) / divergence.previousPriceHigh) * 100;
    if (priceDiff > 2) confidence += 8;
    else if (priceDiff > 1) confidence += 4;

    // TradeCode: Volume contraction at top = distribution
    if (volumeContraction.isContracting) {
        confidence += 12;
    }

    // TradeCode: EMA breakdown with weakness candle
    if (emaBreakdown.isBreakingDown && emaBreakdown.isWeaknessCandle) {
        confidence += 10;
    } else if (emaBreakdown.isBreakingDown) {
        confidence += 6;
    } else if (emaBreakdown.currentBelowEMA) {
        confidence += 3;
    }

    // Entry volume factor
    const volFactor = currentVolume / avgVolume;
    if (volFactor > 2) confidence += 5;
    else if (volFactor > 1.5) confidence += 3;

    return Math.min(90, Math.max(40, confidence));
}

/**
 * Simulate SHORT trade execution for backtest
 * For SHORT: profit when price goes DOWN, loss when price goes UP
 */
async function simulateTrade(signal, candles, signalIndex) {
    const entryPrice = signal.entryPrice;
    const targetPrice = signal.targetPrice;
    const stopPrice = signal.stopPrice;

    let exitPrice = entryPrice;
    let exitReason = 'EOD_EXIT';
    let exitIndex = candles.length - 1;

    // Simulate through remaining candles
    for (let i = signalIndex + 1; i < candles.length; i++) {
        const candle = candles[i];

        // For SHORT: Stop is HIT when price goes UP (high >= stopPrice)
        if (candle.high >= stopPrice) {
            exitPrice = stopPrice;
            exitReason = 'STOP_HIT';
            exitIndex = i;
            break;
        }

        // For SHORT: Target is HIT when price goes DOWN (low <= targetPrice)
        if (candle.low <= targetPrice) {
            exitPrice = targetPrice;
            exitReason = 'TARGET_HIT';
            exitIndex = i;
            break;
        }
    }

    if (exitReason === 'EOD_EXIT') {
        exitPrice = candles[candles.length - 1].close;
    }

    // For SHORT: P&L = Entry - Exit (profit when price falls)
    const pnl = entryPrice - exitPrice;
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
 * Backtest the strategy over a date range
 */
async function backtest(startDate, endDate) {
    console.log(`\n[DOWNSIDE_LOM_INTRA] Backtesting SHORT strategy ${startDate} to ${endDate}`);

    const trades = [];
    const stocks = await getCategoryStocks(startDate);

    console.log(`[DOWNSIDE_LOM_INTRA] Found ${stocks.length} stocks in category`);

    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const dateStr = d.toISOString().split('T')[0];

        for (const stock of stocks) {
            const candles = await get5MinCandles(stock.symbol, dateStr);
            if (candles.length < CONFIG.divergenceLookback) continue;

            for (let i = CONFIG.divergenceLookback; i < candles.length; i++) {
                const candlesUpToNow = candles.slice(0, i + 1);
                const currentTime = candles[i].timestamp;

                const signal = await generateSignal(stock.symbol, candlesUpToNow, currentTime);

                if (signal) {
                    const trade = await simulateTrade(signal, candles, i);
                    trade.signalDate = dateStr;
                    trades.push(trade);
                    console.log(`[DOWNSIDE_LOM_INTRA] ${dateStr} ${stock.symbol}: ${trade.exitReason} (${trade.pnlPercent.toFixed(2)}%)`);
                    break;
                }
            }
        }
    }

    const winners = trades.filter(t => t.outcome === 'WIN');
    const losers = trades.filter(t => t.outcome === 'LOSS');
    const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
    const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.pnlPercent, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.pnlPercent, 0) / losers.length : 0;

    console.log(`\n[DOWNSIDE_LOM_INTRA] Backtest Results:`);
    console.log(`  Total Trades: ${trades.length}`);
    console.log(`  Winners: ${winners.length} (${winRate.toFixed(1)}%)`);
    console.log(`  Losers: ${losers.length}`);
    console.log(`  Avg Win: +${avgWin.toFixed(2)}%`);
    console.log(`  Avg Loss: ${avgLoss.toFixed(2)}%`);

    return {
        trades,
        stats: {
            totalTrades: trades.length,
            winners: winners.length,
            losers: losers.length,
            winRate,
            avgWin,
            avgLoss
        }
    };
}

module.exports = {
    CONFIG,
    generateSignal,
    simulateTrade,
    backtest,
    getCategoryStocks,
    get5MinCandles,
    calculateRSI,
    calculateEMA,
    detectBearishDivergence
};
