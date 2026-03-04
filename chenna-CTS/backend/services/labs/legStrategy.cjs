/**
 * LEG_STRATEGY - Trend Continuation Entry (TradeCode Methodology)
 * 
 * From Video: "If you miss ORB, use Leg Strategy"
 * For traders who missed the Opening Range Breakout
 * 
 * Logic:
 * 1. Prior move established (trend already in progress)
 * 2. Wait for retracement/consolidation
 * 3. Price retraces to 10 EMA
 * 4. Enter on strength candle bouncing off EMA
 * 5. Stop at consolidation low (for LONG) or high (for SHORT)
 * 
 * Timeframe: 3-minute (before 11:30) or 5-minute (after 11:30)
 * Entry: 10:00 AM - 2:00 PM (after initial ORB window)
 * Target: 1.0% - 1.5%
 * Stop: Below consolidation low / Above consolidation high
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getOptimalTimeframe } = require('./timeframeHelper.cjs');

const CONFIG = {
    name: 'LEG_STRATEGY',
    displayName: 'Leg Entry (Trend Continuation)',
    category: 'LEG_STRATEGY',
    direction: 'BOTH',

    // Trend detection
    trendLookback: 20,          // Candles to establish trend
    minTrendMove: 1.0,          // Prior move must be at least 1%

    // EMA settings
    emaPeriod: 10,
    emaTolerance: 0.3,          // Within 0.3% of EMA

    // Candle quality
    minBodyRatio: 0.6,          // Marubozu-like strength candle

    // Entry window (after ORB)
    entryWindowStart: '10:00',
    entryWindowEnd: '14:00',

    // Exit settings
    targetPercent: 1.2,
    maxHoldCandles: 20,         // ~1 hour on 3-min
    eodExit: '15:15'
};

/**
 * Calculate EMA at each candle
 */
function calculateEMAArray(candles, period) {
    if (candles.length < period) return [];

    const emaValues = new Array(candles.length).fill(null);
    const multiplier = 2 / (period + 1);

    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }
    emaValues[period - 1] = sum / period;

    for (let i = period; i < candles.length; i++) {
        emaValues[i] = (candles[i].close - emaValues[i - 1]) * multiplier + emaValues[i - 1];
    }

    return emaValues;
}

/**
 * Identify established trend
 */
function identifyTrend(candles) {
    if (candles.length < CONFIG.trendLookback) {
        return { isEstablished: false };
    }

    const recentCandles = candles.slice(-CONFIG.trendLookback);
    const firstClose = recentCandles[0].close;
    const lastClose = recentCandles[recentCandles.length - 1].close;
    const priceChange = ((lastClose - firstClose) / firstClose) * 100;

    // Count higher closes vs lower closes
    let higherCloses = 0;
    for (let i = 1; i < recentCandles.length; i++) {
        if (recentCandles[i].close > recentCandles[i - 1].close) {
            higherCloses++;
        }
    }

    const trendStrength = higherCloses / (recentCandles.length - 1);

    if (Math.abs(priceChange) < CONFIG.minTrendMove) {
        return { isEstablished: false, reason: 'Move too small' };
    }

    return {
        isEstablished: true,
        direction: priceChange > 0 ? 'UP' : 'DOWN',
        priceChange,
        trendStrength,
        firstPrice: firstClose,
        lastPrice: lastClose
    };
}

/**
 * Check if price is retracing to EMA
 */
function checkEMARetracement(candles, emaValues) {
    if (candles.length < 3) return { isRetracing: false };

    const currentEMA = emaValues[emaValues.length - 1];
    const currentCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];

    if (!currentEMA) return { isRetracing: false };

    // Check if low touched EMA (for LONG) or high touched EMA (for SHORT)
    const lowToEMA = Math.abs((currentCandle.low - currentEMA) / currentEMA) * 100;
    const highToEMA = Math.abs((currentCandle.high - currentEMA) / currentEMA) * 100;

    const touchedEMALow = lowToEMA <= CONFIG.emaTolerance;
    const touchedEMAHigh = highToEMA <= CONFIG.emaTolerance;

    // Bouncing up (for LONG)
    const bouncingUp = touchedEMALow && currentCandle.close > previousCandle.close;

    // Bouncing down (for SHORT)
    const bouncingDown = touchedEMAHigh && currentCandle.close < previousCandle.close;

    return {
        isRetracing: touchedEMALow || touchedEMAHigh,
        touchedEMALow,
        touchedEMAHigh,
        bouncingUp,
        bouncingDown,
        currentEMA,
        distanceToEMA: Math.min(lowToEMA, highToEMA)
    };
}

/**
 * Check candle strength (marubozu-like)
 */
function isStrengthCandle(candle, direction = 'UP') {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const bodyRatio = range > 0 ? body / range : 0;

    const isStrong = bodyRatio >= CONFIG.minBodyRatio;
    const isGreen = candle.close > candle.open;

    if (direction === 'UP') {
        return isStrong && isGreen;
    } else {
        return isStrong && !isGreen;
    }
}

/**
 * Get candles (use 5-minute or aggregate)
 */
async function getCandles(symbol, date) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: '5minute' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached?.data) return [];

        let candles = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
        const targetDate = new Date(date).toDateString();

        return candles
            .filter(c => new Date(c.timestamp || c[0]).toDateString() === targetDate)
            .map(c => Array.isArray(c) ? {
                timestamp: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5]
            } : {
                timestamp: c.timestamp, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +c.volume
            })
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (e) {
        return [];
    }
}

/**
 * Check entry window
 */
function isWithinEntryWindow(timestamp) {
    const time = new Date(timestamp);
    const timeValue = time.getHours() * 60 + time.getMinutes();

    const [startH, startM] = CONFIG.entryWindowStart.split(':').map(Number);
    const [endH, endM] = CONFIG.entryWindowEnd.split(':').map(Number);

    return timeValue >= (startH * 60 + startM) && timeValue <= (endH * 60 + endM);
}

/**
 * Generate Leg Strategy signal
 */
async function generateSignal(symbol, candles, currentIndex) {
    if (candles.length < CONFIG.trendLookback + 5) {
        return null;
    }

    const currentTime = candles[currentIndex].timestamp;

    if (!isWithinEntryWindow(currentTime)) {
        return null;
    }

    const candlesUpToNow = candles.slice(0, currentIndex + 1);

    // 1. Check if trend is established
    const trend = identifyTrend(candlesUpToNow.slice(-CONFIG.trendLookback - 10));
    if (!trend.isEstablished) {
        return null;
    }

    // 2. Calculate EMA
    const emaValues = calculateEMAArray(candlesUpToNow, CONFIG.emaPeriod);

    // 3. Check EMA retracement
    const retracement = checkEMARetracement(candlesUpToNow, emaValues);
    if (!retracement.isRetracing) {
        return null;
    }

    const currentCandle = candlesUpToNow[candlesUpToNow.length - 1];

    // 4. Determine direction and check bounce
    let direction, entryPrice, stopPrice, targetPrice;

    if (trend.direction === 'UP' && retracement.bouncingUp) {
        // Uptrend + EMA bounce = LONG
        if (!isStrengthCandle(currentCandle, 'UP')) return null;

        direction = 'LONG';
        entryPrice = currentCandle.close;

        // Stop below recent consolidation low
        const recentLows = candlesUpToNow.slice(-5).map(c => c.low);
        stopPrice = Math.min(...recentLows) * 0.998;  // Just below

        targetPrice = entryPrice * (1 + CONFIG.targetPercent / 100);
    } else if (trend.direction === 'DOWN' && retracement.bouncingDown) {
        // Downtrend + EMA rejection = SHORT
        if (!isStrengthCandle(currentCandle, 'DOWN')) return null;

        direction = 'SHORT';
        entryPrice = currentCandle.close;

        // Stop above recent consolidation high
        const recentHighs = candlesUpToNow.slice(-5).map(c => c.high);
        stopPrice = Math.max(...recentHighs) * 1.002;  // Just above

        targetPrice = entryPrice * (1 - CONFIG.targetPercent / 100);
    } else {
        return null;  // No setup
    }

    const stopPercent = Math.abs((stopPrice - entryPrice) / entryPrice) * 100;

    return {
        symbol,
        category: CONFIG.category,
        strategy: CONFIG.name,
        strategyDisplay: CONFIG.displayName,
        direction,
        entryPrice,
        targetPrice,
        stopPrice,
        targetPercent: CONFIG.targetPercent,
        stopPercent: stopPercent.toFixed(2),
        trend: {
            direction: trend.direction,
            priceChange: trend.priceChange.toFixed(2),
            strength: (trend.trendStrength * 100).toFixed(0) + '%'
        },
        ema: {
            value: retracement.currentEMA.toFixed(2),
            distancePct: retracement.distanceToEMA.toFixed(2)
        },
        reason: `Leg entry: ${trend.direction} trend (${trend.priceChange.toFixed(1)}%), price retraced to 10 EMA, strength candle bouncing. Stop below consolidation.`,
        confidence: calculateConfidence(trend, retracement, stopPercent),
        timestamp: currentTime,
        eodExit: CONFIG.eodExit
    };
}

/**
 * Calculate confidence
 */
function calculateConfidence(trend, retracement, stopPercent) {
    let confidence = 50;

    // Strong trend
    if (Math.abs(trend.priceChange) > 2) confidence += 10;
    else if (Math.abs(trend.priceChange) > 1.5) confidence += 5;

    // Tight EMA touch
    if (retracement.distanceToEMA < 0.2) confidence += 10;
    else if (retracement.distanceToEMA < 0.3) confidence += 5;

    // Tight stop (better risk/reward)
    if (stopPercent < 0.5) confidence += 10;
    else if (stopPercent < 0.8) confidence += 5;

    return Math.min(85, Math.max(45, confidence));
}

/**
 * Simulate trade
 */
async function simulateTrade(signal, candles, signalIndex) {
    const isLong = signal.direction === 'LONG';
    let exitPrice = signal.entryPrice;
    let exitReason = 'MAX_HOLD';
    let holdCandles = 0;

    for (let i = signalIndex + 1; i < candles.length && holdCandles < CONFIG.maxHoldCandles; i++) {
        holdCandles++;
        const candle = candles[i];

        if (isLong) {
            if (candle.low <= signal.stopPrice) {
                exitPrice = signal.stopPrice; exitReason = 'STOP_HIT'; break;
            }
            if (candle.high >= signal.targetPrice) {
                exitPrice = signal.targetPrice; exitReason = 'TARGET_HIT'; break;
            }
        } else {
            if (candle.high >= signal.stopPrice) {
                exitPrice = signal.stopPrice; exitReason = 'STOP_HIT'; break;
            }
            if (candle.low <= signal.targetPrice) {
                exitPrice = signal.targetPrice; exitReason = 'TARGET_HIT'; break;
            }
        }
        exitPrice = candle.close;
    }

    const pnl = isLong ? exitPrice - signal.entryPrice : signal.entryPrice - exitPrice;
    const pnlPercent = (pnl / signal.entryPrice) * 100;

    return {
        ...signal,
        exitPrice,
        exitReason,
        holdCandles,
        pnl,
        pnlPercent,
        outcome: pnlPercent > 0 ? 'WIN' : 'LOSS'
    };
}

/**
 * Get category stocks
 */
async function getCategoryStocks() {
    // Leg strategy can be used on any intraday category
    // Default to INTRADAY_BOOST stocks
    const cat = await prisma.category.findUnique({
        where: { key: 'INTRADAY_BOOST' },
        include: { stocks: { include: { stock: true } } }
    });
    return cat ? cat.stocks.map(sc => ({ symbol: sc.stock.symbol })) : [];
}

/**
 * Backtest
 */
async function backtest(startDate, endDate) {
    console.log(`\n[LEG] Backtesting Leg Strategy ${startDate} to ${endDate}`);

    const trades = [];
    const stocks = await getCategoryStocks();

    for (const stock of stocks) {
        for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 0 || d.getDay() === 6) continue;

            const candles = await getCandles(stock.symbol, d.toISOString().split('T')[0]);
            if (candles.length < CONFIG.trendLookback + 10) continue;

            for (let i = CONFIG.trendLookback + 5; i < candles.length - 10; i++) {
                const signal = await generateSignal(stock.symbol, candles, i);
                if (signal) {
                    const trade = await simulateTrade(signal, candles, i);
                    trade.signalDate = d.toISOString().split('T')[0];
                    trades.push(trade);
                    console.log(`[LEG] ${trade.signalDate} ${stock.symbol} ${signal.direction}: ${trade.exitReason} (${trade.pnlPercent.toFixed(2)}%)`);
                    break;
                }
            }
        }
    }

    const winRate = trades.length ? (trades.filter(t => t.outcome === 'WIN').length / trades.length) * 100 : 0;
    console.log(`\n[LEG] Results: ${trades.length} trades, ${winRate.toFixed(1)}% WR`);

    return { trades, stats: { totalTrades: trades.length, winRate } };
}

module.exports = {
    CONFIG,
    generateSignal,
    simulateTrade,
    backtest,
    getCategoryStocks,
    getCandles,
    identifyTrend,
    checkEMARetracement
};
