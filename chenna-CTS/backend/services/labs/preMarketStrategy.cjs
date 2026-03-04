/**
 * PRE_MARKET Strategy - GAP UP SHORT (TradeCode Methodology)
 * 
 * From Video: "Gap Up Short" = main pre-market strategy
 * Stocks gapping UP 3%+ are candidates for SHORT (gap fills are common)
 * 
 * Logic:
 * 1. Stock gaps up 3%+ at open
 * 2. Use 1-MINUTE chart (gap plays require fast timeframe)
 * 3. Wait for first RED candle (opposite color after gap up)
 * 4. Mark Opening Range high and low
 * 5. Enter SHORT when:
 *    - Price breaks OR low with 50%+ body below
 *    - OR breaks low of first red candle
 * 6. Target: Gap fill (previous close)
 * 7. Stop: Above OR high
 * 
 * Timeframe: 1-minute
 * Entry: 9:15 - 10:00 AM only (gap plays are early)
 * Target: Gap fill (previous day close)
 * Stop: Above OR high
 * Exit: By 10:30 AM or EOD
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    name: 'PRE_MARKET_GAP_SHORT',
    displayName: 'Gap Up Short (Gap Fill)',
    timeframe: '1minute',
    category: 'PRE_MARKET',
    direction: 'SHORT',  // Primary direction is SHORT for gap fills

    // REFINEMENT #1: Exclude problem stocks (based on backtest analysis)
    // These stocks have shown low win rates on gap fill trades
    excludedStocks: [
        'NTPC',         // 0% win rate in backtest (price didn't fill gap)
        'ITC',          // Frequent STOP losses, doesn't fill gaps well
        'COALINDIA',    // Poor gap fill behavior
        'POWERGRID',    // Mixed results, inconsistent
    ],

    // Gap criteria (from TradeCode video) - REFINED
    // REFINEMENT #2: Tighter gap range (3.5-6% instead of 3-8%)
    // Very large gaps (>6%) are too volatile and risky
    minGapPercent: 3.5,         // Slightly higher minimum for quality gaps
    maxGapPercent: 6.0,         // Reduced max to avoid extreme volatility

    // Opening Range for gap plays
    maxORCandles: 15,           // First 15 candles max for OR

    // Entry settings
    entryWindowStart: '09:15',
    entryWindowEnd: '10:00',    // Gap plays are EARLY (not 10:30)

    // Exit settings
    targetType: 'GAP_FILL',     // Target = previous close
    stopAboveORPercent: 0.3,    // Stop 0.3% above OR high

    // REFINEMENT #3: Stronger breakdown confirmation
    // Originally 0.50, now 0.60 for more decisive breakdowns
    minBodyBelowOR: 0.60,       // 60% of candle body must be below OR low

    // Hard exit
    hardExit: '10:30',
    eodExit: '15:15',
};


/**
 * Get previous day's close for a stock
 */
async function getPreviousClose(symbol, date) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return null;

        let candles = cached.data;
        if (typeof candles === 'string') {
            candles = JSON.parse(candles);
        }

        // Sort by date descending
        candles.sort((a, b) => {
            const dateA = new Date(a.timestamp || a[0]);
            const dateB = new Date(b.timestamp || b[0]);
            return dateB - dateA;
        });

        // Find the candle for the day BEFORE the given date
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        for (const candle of candles) {
            const candleDate = new Date(candle.timestamp || candle[0]);
            candleDate.setHours(0, 0, 0, 0);

            if (candleDate < targetDate) {
                return Array.isArray(candle) ? parseFloat(candle[4]) : parseFloat(candle.close);
            }
        }

        return null;
    } catch (error) {
        console.error(`[GAP_SHORT] Error getting previous close for ${symbol}:`, error.message);
        return null;
    }
}

/**
 * Get 1-minute candles for a stock on a date
 */
async function get1MinCandles(symbol, date) {
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
        console.error(`[GAP_SHORT] Error loading 1-min candles for ${symbol}:`, error.message);
        return [];
    }
}

/**
 * Detect Opening Range for gap plays
 * OR ends when first OPPOSITE color candle appears (from TradeCode)
 */
function defineOpeningRangeGap(candles) {
    if (candles.length < 2) return null;

    const firstCandle = candles[0];
    const isFirstGreen = firstCandle.close >= firstCandle.open;

    let orHigh = firstCandle.high;
    let orLow = firstCandle.low;
    let orEndIndex = 0;

    // OR ends at first opposite color candle (max 15 candles)
    for (let i = 1; i < Math.min(candles.length, CONFIG.maxORCandles); i++) {
        const candle = candles[i];
        const isGreen = candle.close >= candle.open;

        // Found opposite color - OR ends here
        if (isGreen !== isFirstGreen) {
            orEndIndex = i;
            break;
        }

        // Extend OR
        orHigh = Math.max(orHigh, candle.high);
        orLow = Math.min(orLow, candle.low);
        orEndIndex = i;
    }

    return {
        high: orHigh,
        low: orLow,
        endIndex: orEndIndex,
        rangePercent: ((orHigh - orLow) / orLow) * 100,
        firstCandleGreen: isFirstGreen
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
 * Get stocks from PRE_MARKET category for a date
 */
async function getCategoryStocks(date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const category = await prisma.category.findUnique({
        where: { key: 'PRE_MARKET' },
        include: {
            stocks: {
                include: { stock: true }
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
 * Generate GAP UP SHORT signal
 * This is the MAIN strategy for PRE_MARKET based on TradeCode
 */
async function generateSignal(symbol, candles, previousClose, currentIndex) {
    // REFINEMENT #1: Check exclusion list FIRST
    if (CONFIG.excludedStocks && CONFIG.excludedStocks.includes(symbol)) {
        return null;  // Skip excluded stocks
    }

    if (candles.length < 5 || !previousClose) {
        return null;
    }

    // 1. Calculate gap from previous close
    const todayOpen = candles[0].open;
    const gapPercent = ((todayOpen - previousClose) / previousClose) * 100;

    // 2. Must be GAP UP (positive gap) within range
    if (gapPercent < CONFIG.minGapPercent || gapPercent > CONFIG.maxGapPercent) {
        return null;  // Not a valid gap
    }

    // 3. Check if within entry window
    const currentTime = candles[currentIndex].timestamp;
    if (!isWithinEntryWindow(currentTime)) {
        return null;
    }

    // 4. Define Opening Range
    const or = defineOpeningRangeGap(candles);
    if (!or || currentIndex <= or.endIndex) {
        return null;  // OR not complete yet
    }

    // 5. Wait for breakdown of OR Low
    const currentCandle = candles[currentIndex];

    // Price must be below OR low
    if (currentCandle.close >= or.low) {
        return null;  // Not broken yet
    }

    // 6. Confirm breakdown: Body must be at least 50% below OR low
    // For SHORT entry, we want decisive bearish candle
    const isBearish = currentCandle.close < currentCandle.open;
    const bodyHigh = Math.max(currentCandle.open, currentCandle.close);
    const bodyLow = Math.min(currentCandle.open, currentCandle.close);

    // How much of body is below OR low?
    const bodyBelowOR = (or.low - bodyLow) / (bodyHigh - bodyLow);

    if (!isBearish || bodyBelowOR < CONFIG.minBodyBelowOR) {
        return null;  // Not a decisive breakdown
    }

    // 7. Generate SHORT signal
    const entryPrice = currentCandle.close;
    const targetPrice = previousClose;  // Gap fill target
    const stopPrice = or.high * (1 + CONFIG.stopAboveORPercent / 100);

    const targetPercent = ((entryPrice - targetPrice) / entryPrice) * 100;
    const stopPercent = ((stopPrice - entryPrice) / entryPrice) * 100;

    return {
        symbol,
        category: CONFIG.category,
        strategy: CONFIG.name,
        strategyDisplay: CONFIG.displayName,
        direction: 'SHORT',
        entryPrice,
        targetPrice,  // Gap fill = previous close
        stopPrice,
        targetPercent: targetPercent.toFixed(2),
        stopPercent: stopPercent.toFixed(2),
        gap: {
            percent: gapPercent.toFixed(2),
            previousClose: previousClose.toFixed(2),
            todayOpen: todayOpen.toFixed(2),
            fillTarget: previousClose.toFixed(2)
        },
        openingRange: {
            high: or.high.toFixed(2),
            low: or.low.toFixed(2),
            rangePercent: or.rangePercent.toFixed(2)
        },
        reason: `Gap Up +${gapPercent.toFixed(1)}% broke OR low. SHORT entry for gap fill to ${previousClose.toFixed(2)}`,
        confidence: calculateConfidence(gapPercent, bodyBelowOR, or.rangePercent),
        timestamp: currentTime,
        hardExit: CONFIG.hardExit
    };
}

/**
 * Calculate confidence based on gap size and breakdown quality
 */
function calculateConfidence(gapPercent, bodyBelowOR, orRangePercent) {
    let confidence = 50;

    // Gap size (3-5% is ideal, larger gaps are riskier)
    if (gapPercent >= 3 && gapPercent <= 5) confidence += 15;
    else if (gapPercent < 3 || gapPercent > 6) confidence += 5;
    else confidence += 10;

    // Breakdown quality
    if (bodyBelowOR >= 0.8) confidence += 15;  // Very decisive
    else if (bodyBelowOR >= 0.6) confidence += 10;
    else confidence += 5;

    // OR range (tighter is better)
    if (orRangePercent < 1.0) confidence += 10;
    else if (orRangePercent < 1.5) confidence += 5;

    return Math.min(85, Math.max(45, confidence));
}

/**
 * Simulate SHORT trade execution for backtest
 */
async function simulateTrade(signal, candles, signalIndex) {
    const entryPrice = signal.entryPrice;
    const targetPrice = signal.targetPrice;
    const stopPrice = signal.stopPrice;

    let exitPrice = entryPrice;
    let exitReason = 'HARD_EXIT';
    let exitIndex = candles.length - 1;

    // Find hard exit index (10:30 AM)
    const hardExitTime = CONFIG.hardExit.split(':').map(Number);
    const hardExitMinutes = hardExitTime[0] * 60 + hardExitTime[1];

    for (let i = signalIndex + 1; i < candles.length; i++) {
        const candle = candles[i];
        const candleTime = new Date(candle.timestamp);
        const candleMinutes = candleTime.getHours() * 60 + candleTime.getMinutes();

        // SHORT: stop hit when price RISES
        if (candle.high >= stopPrice) {
            exitPrice = stopPrice;
            exitReason = 'STOP_HIT';
            exitIndex = i;
            break;
        }

        // SHORT: target hit when price FALLS to gap fill level
        if (candle.low <= targetPrice) {
            exitPrice = targetPrice;
            exitReason = 'GAP_FILLED';
            exitIndex = i;
            break;
        }

        // Check hard exit time
        if (candleMinutes >= hardExitMinutes) {
            exitPrice = candle.close;
            exitReason = 'HARD_EXIT';
            exitIndex = i;
            break;
        }

        // EOD exit
        const eodTime = CONFIG.eodExit.split(':').map(Number);
        const eodMinutes = eodTime[0] * 60 + eodTime[1];
        if (candleMinutes >= eodMinutes) {
            exitPrice = candle.close;
            exitReason = 'EOD_EXIT';
            exitIndex = i;
            break;
        }
    }

    // SHORT P&L: profit when price falls
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
 * Backtest the GAP UP SHORT strategy over a date range
 */
async function backtest(startDate, endDate) {
    console.log(`\n[GAP_SHORT] Backtesting Gap Up Short strategy ${startDate} to ${endDate}`);

    const trades = [];
    const stocks = await getCategoryStocks(startDate);

    console.log(`[GAP_SHORT] Found ${stocks.length} stocks in PRE_MARKET category`);

    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;  // Skip weekends

        const dateStr = d.toISOString().split('T')[0];

        for (const stock of stocks) {
            const candles = await get1MinCandles(stock.symbol, dateStr);
            if (candles.length < 20) continue;

            const previousClose = await getPreviousClose(stock.symbol, dateStr);
            if (!previousClose) continue;

            // Scan through candles looking for signal
            for (let i = 15; i < Math.min(candles.length, 60); i++) {
                const signal = await generateSignal(stock.symbol, candles, previousClose, i);

                if (signal) {
                    const trade = await simulateTrade(signal, candles, i);
                    trade.signalDate = dateStr;
                    trades.push(trade);
                    console.log(`[GAP_SHORT] ${dateStr} ${stock.symbol}: Gap +${signal.gap.percent}% → ${trade.exitReason} (${trade.pnlPercent.toFixed(2)}%)`);
                    break;  // Only one signal per stock per day
                }
            }
        }
    }

    // Calculate stats
    const winners = trades.filter(t => t.outcome === 'WIN');
    const losers = trades.filter(t => t.outcome === 'LOSS');
    const gapFills = trades.filter(t => t.exitReason === 'GAP_FILLED');
    const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
    const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.pnlPercent, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.pnlPercent, 0) / losers.length : 0;

    console.log(`\n[GAP_SHORT] Backtest Results:`);
    console.log(`  Total Trades: ${trades.length}`);
    console.log(`  Winners: ${winners.length} (${winRate.toFixed(1)}%)`);
    console.log(`  Gap Fills: ${gapFills.length}`);
    console.log(`  Losers: ${losers.length}`);
    console.log(`  Avg Win: +${avgWin.toFixed(2)}%`);
    console.log(`  Avg Loss: ${avgLoss.toFixed(2)}%`);

    return {
        trades,
        stats: {
            totalTrades: trades.length,
            winners: winners.length,
            losers: losers.length,
            gapFills: gapFills.length,
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
    get1MinCandles,
    getPreviousClose,
    defineOpeningRangeGap
};
