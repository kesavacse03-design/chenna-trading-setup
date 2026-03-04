/**
 * UPSIDE_LOM_INTRA Strategy - Bullish Divergence Reversal
 * 
 * Concept: "Loss of Momentum" on downside = Bullish reversal coming
 *          Price making lower lows, but RSI making higher lows (BULLISH DIVERGENCE)
 * 
 * Logic:
 * 1. Detect RSI divergence on 5-min chart
 * 2. Price makes Lower Low, RSI makes Higher Low
 * 3. Confirm with price closing above 10 EMA
 * 4. Entry with increased volume
 * 
 * Timeframe: 5-minute
 * Entry: 9:30 AM - 2:00 PM
 * Target: +1.0% to +1.5%
 * Stop: Below divergence low
 * Exit: EOD at 3:15 PM
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    name: 'UPSIDE_LOM_INTRA',
    displayName: 'Bullish Divergence Reversal',
    timeframe: '5minute',
    category: 'UPSIDE_LOM_INTRA',
    direction: 'LONG',

    // Divergence settings
    swingLookback: 5,           // Candles to define swing high/low
    divergenceLookback: 20,     // Candles to look for divergence pattern
    rsiPeriod: 14,
    rsiOversoldThreshold: 40,   // RSI must have been below this

    // Entry settings
    entryWindowStart: '09:30',
    entryWindowEnd: '14:00',
    confirmationEMA: 10,

    // Exit settings
    targetPercent: 1.5,
    stopBufferPercent: 0.2,     // Buffer below divergence low
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
 * Find swing lows in price data
 */
function findSwingLows(candles, lookback = 5) {
    const swingLows = [];

    for (let i = lookback; i < candles.length - lookback; i++) {
        const currentLow = candles[i].low;
        let isSwingLow = true;

        // Check if this is the lowest point within lookback range
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i && candles[j].low < currentLow) {
                isSwingLow = false;
                break;
            }
        }

        if (isSwingLow) {
            swingLows.push({
                index: i,
                price: currentLow,
                timestamp: candles[i].timestamp
            });
        }
    }

    return swingLows;
}

/**
 * Detect bullish divergence (Price LL, RSI HL)
 */
function detectBullishDivergence(candles, rsiValues) {
    const swingLows = findSwingLows(candles, CONFIG.swingLookback);

    if (swingLows.length < 2) {
        return { isDivergence: false };
    }

    // Compare last two swing lows
    const recentLow = swingLows[swingLows.length - 1];
    const previousLow = swingLows[swingLows.length - 2];

    // Price made Lower Low?
    if (recentLow.price >= previousLow.price) {
        return { isDivergence: false };
    }

    // RSI made Higher Low?
    const recentRSI = rsiValues[recentLow.index];
    const previousRSI = rsiValues[previousLow.index];

    if (!recentRSI || !previousRSI) {
        return { isDivergence: false };
    }

    if (recentRSI <= previousRSI) {
        return { isDivergence: false };
    }

    // Bullish divergence confirmed!
    return {
        isDivergence: true,
        divergenceType: 'BULLISH',
        priceLow: recentLow.price,
        previousPriceLow: previousLow.price,
        divergenceIndex: recentLow.index,
        rsiAtLow: recentRSI,
        previousRsi: previousRSI,
        lowTimestamp: recentLow.timestamp
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
            // Fallback to 1-minute and aggregate
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
        console.error(`[UPSIDE_LOM_INTRA] Error loading 5-min candles for ${symbol}:`, error.message);
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

        // Filter 1-minute candles for the specific date FIRST
        const targetDate = new Date(date).toDateString();
        const dailyCandles = candles.filter(c => {
            const ts = Array.isArray(c) ? c[0] : (c.timestamp || c.date);
            return new Date(ts).toDateString() === targetDate;
        });

        if (dailyCandles.length === 0) return [];

        // Aggregate every 5 candles
        const aggregated = [];
        for (let i = 0; i < dailyCandles.length; i += 5) {
            const batch = dailyCandles.slice(i, i + 5);
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
        console.error(`[UPSIDE_LOM_INTRA] Error aggregating 1-min to 5-min:`, error.message);
        return [];
    }
}

/**
 * Get stocks from UPSIDE_LOM_INTRA category for a date
 */
async function getCategoryStocks(date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const category = await prisma.category.findUnique({
        where: { key: 'UPSIDE_LOM_INTRA' },
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
 * Detect volume contraction (TradeCode: "Divergence based on volume contraction")
 * Volume contracting at bottom = accumulation = bullish
 */
function detectVolumeContraction(candles, lookback = 10) {
    if (candles.length < lookback) return { isContracting: false };

    const volumes = candles.slice(-lookback).map(c => c.volume);

    // Split into older half and recent half
    const midpoint = Math.floor(lookback / 2);
    const olderVolumes = volumes.slice(0, midpoint);
    const recentVolumes = volumes.slice(midpoint);

    const olderAvg = olderVolumes.reduce((a, b) => a + b, 0) / olderVolumes.length;
    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

    // Volume is contracting if recent is 20% lower than older
    const contractionRatio = recentAvg / olderAvg;
    const isContracting = contractionRatio < 0.8;

    return {
        isContracting,
        contractionRatio,
        olderAvg,
        recentAvg
    };
}

/**
 * Check for EMA touch and bounce (TradeCode specific confirmation)
 * "Wait for retracement to EMA, enter on strength candle bouncing off"
 */
function checkEMABounce(candles, ema10, lookback = 3) {
    if (candles.length < lookback + 1) return { isBouncing: false };

    // Recent candles
    const recentCandles = candles.slice(-lookback);

    // Check if any recent candle touched or crossed EMA
    let touchedEMA = false;
    for (const candle of recentCandles.slice(0, -1)) {
        // Touched if low was within 0.3% of EMA or crossed below
        const distanceToEMA = (candle.low - ema10) / ema10 * 100;
        if (distanceToEMA <= 0.3 && distanceToEMA >= -0.5) {
            touchedEMA = true;
            break;
        }
    }

    // Current candle should be bouncing UP
    const currentCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    const isBouncing = currentCandle.close > previousCandle.close && currentCandle.close > ema10;

    // Check candle strength (marubozu-like)
    const body = Math.abs(currentCandle.close - currentCandle.open);
    const range = currentCandle.high - currentCandle.low;
    const isStrengthCandle = range > 0 && (body / range) >= 0.6;

    return {
        isBouncing: touchedEMA && isBouncing,
        isStrengthCandle,
        touchedEMA,
        currentAboveEMA: currentCandle.close > ema10
    };
}

/**
 * Generate signal for a stock on a date (with TradeCode enhancements)
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

    // 3. Detect divergence
    const divergence = detectBullishDivergence(candles, rsiValues);
    if (!divergence.isDivergence) {
        return null;
    }

    // 4. Check RSI was oversold
    if (divergence.rsiAtLow > CONFIG.rsiOversoldThreshold) {
        return null;  // RSI wasn't low enough
    }

    // 5. Check confirmation (price above 10 EMA)
    const currentPrice = candles[candles.length - 1].close;
    const ema10 = calculateEMA(candles, CONFIG.confirmationEMA);

    if (currentPrice <= ema10) {
        return null;  // Not confirmed yet
    }

    // ═══════════════════════════════════════════════════════════════
    // NEW TradeCode Filters
    // ═══════════════════════════════════════════════════════════════

    // TRADECODE FILTER 1: Volume Contraction Check
    // "Divergence based on OI + volume contraction" - volume contracts at bottom
    const volumeContraction = detectVolumeContraction(candles, 10);

    // TRADECODE FILTER 2: EMA Touch + Bounce
    // "Wait for retracement to EMA, enter on strength candle bouncing off"
    const emaBounce = checkEMABounce(candles, ema10, 3);

    // 6. Check regular volume (current candle should have decent volume)
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const currentVolume = candles[candles.length - 1].volume;
    const volumeOK = currentVolume >= avgVolume * 1.2;  // At least 1.2x (not 1.5x - bounce shouldn't require huge volume)

    // ═══════════════════════════════════════════════════════════════
    // Scoring: Original (divergence + confirmation) + TradeCode (volume contraction + EMA bounce)
    // ═══════════════════════════════════════════════════════════════

    const tradeCodeScore = [
        volumeContraction.isContracting,  // Volume contracting = accumulation
        emaBounce.isBouncing || emaBounce.currentAboveEMA,  // EMA bounce or above
        volumeOK  // Entry volume decent
    ].filter(Boolean).length;

    // Need at least 2 of 3 TradeCode checks
    if (tradeCodeScore < 2) {
        return null;
    }

    // 7. Generate signal
    const entryPrice = currentPrice;
    const stopPrice = divergence.priceLow * (1 - CONFIG.stopBufferPercent / 100);
    const targetPrice = entryPrice * (1 + CONFIG.targetPercent / 100);

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
        stopPercent: ((entryPrice - stopPrice) / entryPrice * 100).toFixed(2),
        divergence: {
            priceLow: divergence.priceLow,
            previousLow: divergence.previousPriceLow,
            rsiAtLow: divergence.rsiAtLow.toFixed(1),
            previousRsi: divergence.previousRsi.toFixed(1)
        },
        tradeCodeChecks: {
            volumeContraction: volumeContraction.isContracting,
            contractionRatio: volumeContraction.contractionRatio?.toFixed(2),
            emaBounce: emaBounce.isBouncing,
            strengthCandle: emaBounce.isStrengthCandle,
            score: tradeCodeScore
        },
        reason: `Bullish divergence with volume contraction (${(volumeContraction.contractionRatio * 100).toFixed(0)}% of prior). ${emaBounce.isBouncing ? 'Strong EMA bounce.' : 'Price above 10 EMA.'}`,
        confidence: calculateConfidence(divergence, currentVolume, avgVolume, volumeContraction, emaBounce),
        timestamp: currentTime,
        eodExit: CONFIG.eodExit
    };
}

/**
 * Calculate confidence based on divergence strength, volume, and TradeCode checks
 */
function calculateConfidence(divergence, currentVolume, avgVolume, volumeContraction, emaBounce) {
    let confidence = 45;  // Start lower, require TradeCode checks to build confidence

    // RSI divergence strength
    const rsiDiff = divergence.rsiAtLow - divergence.previousRsi;
    if (rsiDiff > 10) confidence += 12;
    else if (rsiDiff > 5) confidence += 8;
    else confidence += 4;

    // Price divergence strength
    const priceDiff = ((divergence.previousPriceLow - divergence.priceLow) / divergence.previousPriceLow) * 100;
    if (priceDiff > 2) confidence += 8;
    else if (priceDiff > 1) confidence += 4;

    // TradeCode: Volume contraction (key indicator!)
    if (volumeContraction.isContracting) {
        confidence += 12;  // Strong signal for accumulation
    }

    // TradeCode: EMA bounce with strength candle
    if (emaBounce.isBouncing && emaBounce.isStrengthCandle) {
        confidence += 10;  // Best case scenario
    } else if (emaBounce.isBouncing) {
        confidence += 6;
    } else if (emaBounce.currentAboveEMA) {
        confidence += 3;
    }

    // Entry volume factor (less important than contraction)
    const volFactor = currentVolume / avgVolume;
    if (volFactor > 2) confidence += 5;
    else if (volFactor > 1.5) confidence += 3;

    return Math.min(90, Math.max(40, confidence));
}

/**
 * Simulate trade execution for backtest
 */
async function simulateTrade(signal, candles, signalIndex) {
    const entryPrice = signal.entryPrice;
    const targetPrice = signal.targetPrice;
    const stopPrice = signal.stopPrice;

    let exitPrice = entryPrice;
    let exitReason = 'EOD_EXIT';
    let exitIndex = candles.length - 1;

    // Simulate through remaining candles of the day
    for (let i = signalIndex + 1; i < candles.length; i++) {
        const candle = candles[i];

        // Check stop first (conservative)
        if (candle.low <= stopPrice) {
            exitPrice = stopPrice;
            exitReason = 'STOP_HIT';
            exitIndex = i;
            break;
        }

        // Check target
        if (candle.high >= targetPrice) {
            exitPrice = targetPrice;
            exitReason = 'TARGET_HIT';
            exitIndex = i;
            break;
        }
    }

    // If no target/stop hit, exit at EOD
    if (exitReason === 'EOD_EXIT') {
        exitPrice = candles[candles.length - 1].close;
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
 * Backtest the strategy over a date range
 */
async function backtest(startDate, endDate) {
    console.log(`\n[UPSIDE_LOM_INTRA] Backtesting ${startDate} to ${endDate}`);

    const trades = [];
    const stocks = await getCategoryStocks(startDate);

    console.log(`[UPSIDE_LOM_INTRA] Found ${stocks.length} stocks in category`);

    // Iterate through trading days
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

        const dateStr = d.toISOString().split('T')[0];

        for (const stock of stocks) {
            const candles = await get5MinCandles(stock.symbol, dateStr);
            if (candles.length < CONFIG.divergenceLookback) continue;

            // Scan through day for signals
            for (let i = CONFIG.divergenceLookback; i < candles.length; i++) {
                const candlesUpToNow = candles.slice(0, i + 1);
                const currentTime = candles[i].timestamp;

                const signal = await generateSignal(stock.symbol, candlesUpToNow, currentTime);

                if (signal) {
                    const trade = await simulateTrade(signal, candles, i);
                    // Use the actual signal timestamp for the date, not the loop date (fixes time travel bug)
                    trade.signalDate = signal.timestamp.split('T')[0];
                    trades.push(trade);
                    console.log(`[UPSIDE_LOM_INTRA] ${dateStr} ${stock.symbol}: ${trade.exitReason} (${trade.pnlPercent.toFixed(2)}%)`);
                    break; // One signal per stock per day
                }
            }
        }
    }

    // Calculate stats
    const winners = trades.filter(t => t.outcome === 'WIN');
    const losers = trades.filter(t => t.outcome === 'LOSS');
    const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
    const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.pnlPercent, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.pnlPercent, 0) / losers.length : 0;

    console.log(`\n[UPSIDE_LOM_INTRA] Backtest Results:`);
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
    detectBullishDivergence
};
