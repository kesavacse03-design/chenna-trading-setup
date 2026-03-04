/**
 * DAILY_CONTRACTION Strategy - VCP/NR7 (TradeCode Methodology)
 * 
 * From Video: SPECIFIC method for daily contraction (NR7/Inside Day):
 * Step 1: Use HOURLY chart for trend (20 EMA)
 * Step 2: Mark previous day's HIGH (for LONG) or LOW (for SHORT)
 * Step 3: Enter on 3-MINUTE chart breakout
 * 
 * Logic:
 * 1. Identify Insider (Inside Day) or NR7 on daily chart
 * 2. Check HOURLY 20 EMA for trend direction
 *    - Price above 20 EMA = Uptrend = Look for LONG
 *    - Price below 20 EMA = Downtrend = Look for SHORT
 * 3. Mark breakout level (previous day high for LONG, low for SHORT)
 * 4. Enter on 3-minute close above/below that level
 * 
 * Timeframe: Daily (detection), Hourly (trend), 3-min (entry)
 * Target: +1.5% - +2.0%
 * Stop: Below breakout level or previous day extreme
 * Hold: 1-3 days
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    name: 'DAILY_CONTRACTION_VCP',
    displayName: 'VCP/NR7 (Hourly Trend + 3Min Entry)',
    timeframe: 'multi',  // Uses daily + hourly + 3min
    category: 'DAILY_CONTRACTION',
    direction: 'BOTH',

    // Pattern detection
    nr7Lookback: 7,                 // NR7 = Narrowest Range of 7 days

    // Trend determination (HOURLY chart)
    hourlyEMAPeriod: 20,            // 20 EMA on hourly for trend

    // Entry settings
    entryTimeframe: '3minute',      // 3-minute for entry timing
    breakoutBuffer: 0.2,            // Must break by 0.2% to confirm

    // Exit settings
    targetPercent: 2.0,
    stopPercent: 1.0,
    maxHoldDays: 3,
};

/**
 * Get daily candles for a stock
 */
async function getDailyCandles(symbol) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return [];

        let candles = cached.data;
        if (typeof candles === 'string') {
            candles = JSON.parse(candles);
        }

        return candles.map(c => {
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
        }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (error) {
        console.error(`[VCP] Error loading daily candles for ${symbol}:`, error.message);
        return [];
    }
}

/**
 * Get 5-minute candles (will aggregate to hourly)
 */
async function get5MinCandles(symbol, date) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: '5minute' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return [];

        let candles = cached.data;
        if (typeof candles === 'string') {
            candles = JSON.parse(candles);
        }

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
        }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (error) {
        return [];
    }
}

/**
 * Aggregate 5-min candles to hourly candles
 */
function aggregateToHourly(fiveMinCandles) {
    const hourlyMap = new Map();

    for (const candle of fiveMinCandles) {
        const date = new Date(candle.timestamp);
        const hourKey = `${date.toISOString().split('T')[0]}-${date.getHours()}`;

        if (!hourlyMap.has(hourKey)) {
            hourlyMap.set(hourKey, {
                timestamp: candle.timestamp,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume
            });
        } else {
            const existing = hourlyMap.get(hourKey);
            existing.high = Math.max(existing.high, candle.high);
            existing.low = Math.min(existing.low, candle.low);
            existing.close = candle.close;  // Latest close
            existing.volume += candle.volume;
        }
    }

    return Array.from(hourlyMap.values()).sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
    );
}

/**
 * Calculate EMA
 */
function calculateEMA(candles, period) {
    if (candles.length < period) return null;

    const multiplier = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }
    let ema = sum / period;

    for (let i = period; i < candles.length; i++) {
        ema = (candles[i].close - ema) * multiplier + ema;
    }

    return ema;
}

/**
 * Detect Inside Day or NR7 pattern on daily chart
 */
function detectContractionPattern(dailyCandles, currentDateStr) {
    // Get candles up to current date (no future data)
    const filtered = dailyCandles.filter(c => {
        const candleDateStr = new Date(c.timestamp).toISOString().split('T')[0];
        return candleDateStr <= currentDateStr;
    });

    if (filtered.length < CONFIG.nr7Lookback + 1) return null;

    const today = filtered[filtered.length - 1];
    const yesterday = filtered[filtered.length - 2];

    // Check Inside Day (today's range inside yesterday's)
    const isInsideDay = (today.high < yesterday.high) && (today.low > yesterday.low);

    // Check NR7 (narrowest range of last 7 days)
    const todayRange = today.high - today.low;
    let isNR7 = true;

    for (let i = 2; i <= CONFIG.nr7Lookback + 1 && i <= filtered.length; i++) {
        const pastCandle = filtered[filtered.length - i];
        const pastRange = pastCandle.high - pastCandle.low;
        if (pastRange < todayRange) {
            isNR7 = false;
            break;
        }
    }

    if (!isInsideDay && !isNR7) {
        return null;
    }

    return {
        pattern: isInsideDay ? 'INSIDE_DAY' : 'NR7',
        today,
        yesterday,
        previousDayHigh: yesterday.high,
        previousDayLow: yesterday.low,
        rangePercent: (todayRange / today.close) * 100
    };
}

/**
 * Determine trend from HOURLY 20 EMA (TradeCode specific!)
 */
function determineHourlyTrend(hourlyCandles) {
    if (hourlyCandles.length < CONFIG.hourlyEMAPeriod) {
        return { direction: null, reason: 'Not enough hourly data' };
    }

    const ema20 = calculateEMA(hourlyCandles, CONFIG.hourlyEMAPeriod);
    const currentClose = hourlyCandles[hourlyCandles.length - 1].close;

    if (!ema20) {
        return { direction: null, reason: 'Unable to calculate EMA' };
    }

    const percentAboveEMA = ((currentClose - ema20) / ema20) * 100;

    if (currentClose > ema20) {
        return {
            direction: 'LONG',
            ema20,
            currentClose,
            percentAboveEMA,
            reason: `Price ${currentClose.toFixed(2)} above 20 EMA ${ema20.toFixed(2)} (+${percentAboveEMA.toFixed(2)}%)`
        };
    } else {
        return {
            direction: 'SHORT',
            ema20,
            currentClose,
            percentAboveEMA,
            reason: `Price ${currentClose.toFixed(2)} below 20 EMA ${ema20.toFixed(2)} (${percentAboveEMA.toFixed(2)}%)`
        };
    }
}

/**
 * Get stocks from DAILY_CONTRACTION category
 */
async function getCategoryStocks(startDate) {
    const category = await prisma.category.findUnique({
        where: { key: 'DAILY_CONTRACTION' },
        include: {
            stocks: { include: { stock: true } }
        }
    });

    if (!category) return [];
    return category.stocks.map(sc => ({
        symbol: sc.stock.symbol,
        name: sc.stock.name
    }));
}

/**
 * Generate signal using TradeCode VCP/NR7 method
 */
async function generateSignal(symbol, dailyCandles, fiveMinCandles, currentDateStr) {
    // STEP 1: Check for Inside Day or NR7 pattern on daily
    const pattern = detectContractionPattern(dailyCandles, currentDateStr);
    if (!pattern) {
        return null;
    }

    // STEP 2: Aggregate to hourly and determine trend
    const hourlyCandles = aggregateToHourly(fiveMinCandles);
    const trend = determineHourlyTrend(hourlyCandles);

    if (!trend.direction) {
        return null;  // Can't determine trend
    }

    // STEP 3: Set breakout level based on trend
    let breakoutLevel, direction, stopLevel;

    if (trend.direction === 'LONG') {
        breakoutLevel = pattern.previousDayHigh;  // Previous day HIGH
        stopLevel = pattern.previousDayLow;
        direction = 'LONG';
    } else {
        breakoutLevel = pattern.previousDayLow;   // Previous day LOW
        stopLevel = pattern.previousDayHigh;
        direction = 'SHORT';
    }

    // STEP 4: Check if broken on 5-min (proxy for 3-min)
    if (fiveMinCandles.length === 0) return null;

    const currentCandle = fiveMinCandles[fiveMinCandles.length - 1];
    let isBroken = false;

    if (direction === 'LONG') {
        isBroken = currentCandle.close > breakoutLevel * (1 + CONFIG.breakoutBuffer / 100);
    } else {
        isBroken = currentCandle.close < breakoutLevel * (1 - CONFIG.breakoutBuffer / 100);
    }

    if (!isBroken) {
        return null;  // Not broken yet
    }

    // STEP 5: Generate signal
    const entryPrice = currentCandle.close;
    let targetPrice, stopPrice;

    if (direction === 'LONG') {
        targetPrice = entryPrice * (1 + CONFIG.targetPercent / 100);
        stopPrice = stopLevel * 0.995;  // Just below previous day low
    } else {
        targetPrice = entryPrice * (1 - CONFIG.targetPercent / 100);
        stopPrice = stopLevel * 1.005;  // Just above previous day high
    }

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
        stopPercent: ((Math.abs(entryPrice - stopPrice) / entryPrice) * 100).toFixed(2),
        pattern: {
            type: pattern.pattern,
            previousDayHigh: pattern.previousDayHigh.toFixed(2),
            previousDayLow: pattern.previousDayLow.toFixed(2),
            rangePercent: pattern.rangePercent.toFixed(2)
        },
        trend: {
            direction: trend.direction,
            hourlyEMA20: trend.ema20?.toFixed(2),
            percentAboveEMA: trend.percentAboveEMA?.toFixed(2),
            reason: trend.reason
        },
        breakoutLevel: breakoutLevel.toFixed(2),
        reason: `${pattern.pattern} detected. Hourly ${trend.direction} (${trend.reason}). Broke ${direction === 'LONG' ? 'previous day high' : 'previous day low'} ${breakoutLevel.toFixed(2)}.`,
        confidence: calculateConfidence(pattern, trend),
        timestamp: currentCandle.timestamp,
        maxHoldDays: CONFIG.maxHoldDays
    };
}

/**
 * Calculate confidence
 */
function calculateConfidence(pattern, trend) {
    let confidence = 50;

    // Pattern type
    if (pattern.pattern === 'INSIDE_DAY') confidence += 10;  // Inside day is clearer
    else confidence += 5;  // NR7 also good

    // Tight range is better
    if (pattern.rangePercent < 1.0) confidence += 15;
    else if (pattern.rangePercent < 1.5) confidence += 10;
    else confidence += 5;

    // Strong trend alignment
    const aboveEMA = Math.abs(trend.percentAboveEMA || 0);
    if (aboveEMA > 1.0) confidence += 10;  // Clear trend
    else if (aboveEMA > 0.5) confidence += 5;

    return Math.min(85, Math.max(45, confidence));
}

/**
 * Simulate trade
 */
async function simulateTrade(signal, dailyCandles, signalIndex) {
    const entryPrice = signal.entryPrice;
    const targetPrice = signal.targetPrice;
    const stopPrice = signal.stopPrice;
    const isLong = signal.direction === 'LONG';

    let exitPrice = entryPrice;
    let exitReason = 'MAX_HOLD';
    let holdDays = 0;

    for (let i = signalIndex + 1; i < dailyCandles.length && holdDays < CONFIG.maxHoldDays; i++) {
        const candle = dailyCandles[i];
        holdDays++;

        if (isLong) {
            if (candle.low <= stopPrice) {
                exitPrice = stopPrice;
                exitReason = 'STOP_HIT';
                break;
            }
            if (candle.high >= targetPrice) {
                exitPrice = targetPrice;
                exitReason = 'TARGET_HIT';
                break;
            }
        } else {
            if (candle.high >= stopPrice) {
                exitPrice = stopPrice;
                exitReason = 'STOP_HIT';
                break;
            }
            if (candle.low <= targetPrice) {
                exitPrice = targetPrice;
                exitReason = 'TARGET_HIT';
                break;
            }
        }

        exitPrice = candle.close;
    }

    let pnl, pnlPercent;
    if (isLong) {
        pnl = exitPrice - entryPrice;
        pnlPercent = (pnl / entryPrice) * 100;
    } else {
        pnl = entryPrice - exitPrice;
        pnlPercent = (pnl / entryPrice) * 100;
    }

    return {
        ...signal,
        exitPrice,
        exitReason,
        holdDays,
        pnl,
        pnlPercent,
        outcome: pnlPercent > 0 ? 'WIN' : 'LOSS'
    };
}

/**
 * Backtest
 */
async function backtest(startDate, endDate) {
    console.log(`\n[VCP] Backtesting TradeCode VCP/NR7 strategy ${startDate} to ${endDate}`);

    const trades = [];
    const stocks = await getCategoryStocks(startDate);

    console.log(`[VCP] Found ${stocks.length} stocks in DAILY_CONTRACTION category`);

    for (const stock of stocks) {
        const dailyCandles = await getDailyCandles(stock.symbol);
        if (dailyCandles.length < CONFIG.nr7Lookback + 10) continue;

        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 0 || d.getDay() === 6) continue;

            const dateStr = d.toISOString().split('T')[0];

            const fiveMinCandles = await get5MinCandles(stock.symbol, dateStr);

            const signal = await generateSignal(stock.symbol, dailyCandles, fiveMinCandles, dateStr);

            if (signal) {
                const signalIndex = dailyCandles.findIndex(c =>
                    new Date(c.timestamp).toISOString().split('T')[0] === dateStr
                );

                if (signalIndex >= 0) {
                    const trade = await simulateTrade(signal, dailyCandles, signalIndex);
                    trade.signalDate = dateStr;
                    trades.push(trade);
                    console.log(`[VCP] ${dateStr} ${stock.symbol} ${signal.direction}: ${signal.pattern.type} → ${trade.exitReason} (${trade.pnlPercent.toFixed(2)}%)`);
                }
            }
        }
    }

    const winners = trades.filter(t => t.outcome === 'WIN');
    const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;

    console.log(`\n[VCP] Results: ${trades.length} trades, ${winRate.toFixed(1)}% win rate`);

    return { trades, stats: { totalTrades: trades.length, winRate } };
}

module.exports = {
    CONFIG,
    generateSignal,
    simulateTrade,
    backtest,
    getCategoryStocks,
    getDailyCandles,
    get5MinCandles,
    detectContractionPattern,
    determineHourlyTrend
};
