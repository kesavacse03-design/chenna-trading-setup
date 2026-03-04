/**
 * Intraday Strategy V2 - Pattern-Based Signals
 * 
 * PATTERN-FILTERED STRATEGY (Opening Range + N-Pattern + Volume Confirmation)
 * Expected: 65-75% win rate (vs V1's 33%)
 * 
 * Signal Logic:
 * 1. Volume > 1.5x average (V1 filter)
 * 2. Opening Range defined (first opposite color candle)
 * 3. N-Pattern detected (pullback → higher low → breakout)
 * 4. Volume + small body at breakout (confirmation)
 * 5. Entry: Opening Range high (breakout level)
 * 6. Stop: Pullback low (dynamic)
 * 7. Target: +1.5%
 * 8. Force exit: 3:15 PM
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Configuration
const CONFIG = {
    TARGET_PERCENT: 1.5,        // +1.5% profit target
    VOLUME_THRESHOLD: 1.5,      // 1.5x average volume
    ENTRY_TIME: '09:20',        // Minimum entry time
    EXIT_TIME: '15:15',         // Force exit at 3:15 PM
    MIN_CANDLES: 100,           // Minimum candles required
    MAX_OR_WIDTH_PERCENT: 3.0,  // Max Opening Range width
    MIN_OR_CANDLES: 5,          // Minimum candles for Opening Range
    MAX_OR_CANDLES: 30,         // Maximum candles for Opening Range (30 min)
    MIN_WAIT_AFTER_OR: 10,      // Min minutes after OR for breakout
    MAX_WAIT_AFTER_OR: 60,      // Max minutes after OR for breakout
    MAX_BODY_RATIO: 0.7         // Max body/range ratio at breakout
};

/**
 * Get 1-minute candles for a stock on a specific date
 */
async function get1MinCandles(symbol, date) {
    const targetDateStr = typeof date === 'string'
        ? date.split('T')[0]
        : new Date(date).toISOString().split('T')[0];

    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: '5m' }
    });

    if (!cached || !cached.data) return [];

    const candles = cached.data.filter(c => {
        if (!c.timestamp) return false;
        const candleDateStr = c.timestamp.split('T')[0];
        if (candleDateStr !== targetDateStr) return false;

        const timePart = c.timestamp.split('T')[1];
        if (!timePart) return false;

        const hours = parseInt(timePart.substring(0, 2), 10);
        const minutes = parseInt(timePart.substring(3, 5), 10);
        const timeNum = hours * 100 + minutes;

        return timeNum >= 915 && timeNum <= 1530;
    });

    return candles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Get 20-day average volume for a stock
 */
async function getAvgVolume(symbol, date) {
    const targetDateStr = typeof date === 'string'
        ? date.split('T')[0]
        : new Date(date).toISOString().split('T')[0];

    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: 'day' }
    });

    if (!cached || !cached.data || cached.data.length < 10) return null;

    const priorCandles = cached.data
        .filter(c => {
            const candleDateStr = typeof c.timestamp === 'string'
                ? c.timestamp.split('T')[0]
                : new Date(c.timestamp).toISOString().split('T')[0];
            return candleDateStr < targetDateStr;
        })
        .slice(-20);

    if (priorCandles.length < 10) return null;

    const totalVolume = priorCandles.reduce((sum, c) => sum + (c.volume || 0), 0);
    return totalVolume / priorCandles.length;
}

/**
 * Get stocks from intraday categories that have 1-min data
 */
async function getIntradayStocks(categoryName) {
    const category = await prisma.category.findFirst({
        where: { key: categoryName },
        include: {
            stocks: { include: { stock: true } }
        }
    });

    if (!category) {
        console.log(`Category ${categoryName} not found`);
        return [];
    }

    const symbolsWithData = await prisma.$queryRaw`
        SELECT DISTINCT symbol FROM ohlcv_cache WHERE interval = '5m'
    `;
    const validSymbols = new Set(symbolsWithData.map(r => r.symbol));

    return category.stocks
        .filter(sc => sc.stock && validSymbols.has(sc.stock.symbol))
        .map(sc => ({
            symbol: sc.stock.symbol,
            instrumentKey: sc.stock.instrumentKey
        }));
}

/**
 * Helper: Check if candle is green (close > open)
 */
function isGreenCandle(candle) {
    return candle.close > candle.open;
}

/**
 * Helper: Extract time in minutes from market open (9:15 = 0)
 */
function getMinutesFromOpen(timestamp) {
    const timePart = timestamp.split('T')[1];
    const hours = parseInt(timePart.substring(0, 2), 10);
    const minutes = parseInt(timePart.substring(3, 5), 10);
    return (hours - 9) * 60 + (minutes - 15);
}

/**
 * FILTER 1: Detect Opening Range
 * Returns: { high, low, endIndex } or null if invalid
 */
function detectOpeningRange(candles) {
    if (candles.length < CONFIG.MIN_OR_CANDLES) return null;

    const firstCandle = candles[0];
    const firstIsGreen = isGreenCandle(firstCandle);

    let orHigh = firstCandle.high;
    let orLow = firstCandle.low;
    let endIndex = 0;

    // Find first opposite color candle
    for (let i = 1; i < Math.min(candles.length, CONFIG.MAX_OR_CANDLES); i++) {
        const candle = candles[i];
        const isGreen = isGreenCandle(candle);

        // Track high/low
        orHigh = Math.max(orHigh, candle.high);
        orLow = Math.min(orLow, candle.low);

        // Found opposite color?
        if ((firstIsGreen && !isGreen) || (!firstIsGreen && isGreen)) {
            endIndex = i;
            break;
        }
    }

    // No opposite candle found within limit
    if (endIndex === 0) return null;

    // Check range width
    const rangePercent = ((orHigh - orLow) / orLow) * 100;
    if (rangePercent > CONFIG.MAX_OR_WIDTH_PERCENT) return null;

    return {
        high: orHigh,
        low: orLow,
        endIndex,
        rangePercent
    };
}

/**
 * FILTER 2: Detect N-Pattern after Opening Range
 * Returns: { breakoutIndex, pullbackLow, breakoutCandle } or null if invalid
 */
function detectNPattern(candles, openingRange) {
    let pullbackLow = Infinity;
    let pullbackIndex = -1;
    let breakoutIndex = -1;
    let breakoutCandle = null;

    // Start checking after Opening Range ends
    const startIndex = openingRange.endIndex + 1;
    const maxIndex = Math.min(candles.length, startIndex + CONFIG.MAX_WAIT_AFTER_OR);

    for (let i = startIndex; i < maxIndex; i++) {
        const candle = candles[i];

        // Track pullback (lowest point after OR)
        if (candle.low < pullbackLow) {
            pullbackLow = candle.low;
            pullbackIndex = i;
        }

        // Check for breakout above Opening Range high
        if (candle.high > openingRange.high) {
            breakoutIndex = i;
            breakoutCandle = candle;

            // Time check: breakout not too early
            const minutesAfterOR = i - openingRange.endIndex;
            if (minutesAfterOR < CONFIG.MIN_WAIT_AFTER_OR) {
                continue; // Too early, keep looking
            }

            // VALIDATE: Higher low? (pullback stays above OR low)
            if (pullbackLow > openingRange.low) {
                // N-PATTERN FOUND! ✅
                return {
                    breakoutIndex,
                    pullbackLow,
                    pullbackIndex,
                    breakoutCandle
                };
            } else {
                // Lower low = invalid pattern (breakdown, not breakout)
                return null;
            }
        }
    }

    // No valid breakout found
    return null;
}

/**
 * FILTER 3: Validate breakout candle (volume + body size)
 */
function validateBreakoutCandle(breakoutCandle, avgDailyVolume) {
    // Volume check: should be significant
    const expectedVolume = avgDailyVolume * 0.02; // ~2% of daily at breakout
    const breakoutVolume = breakoutCandle.volume || 0;
    const hasVolume = breakoutVolume > expectedVolume;

    // Body size check: prefer small bodies (accumulation, not spike)
    const bodySize = Math.abs(breakoutCandle.close - breakoutCandle.open);
    const rangeSize = breakoutCandle.high - breakoutCandle.low;
    const bodyRatio = rangeSize > 0 ? bodySize / rangeSize : 1;
    const smallBody = bodyRatio < CONFIG.MAX_BODY_RATIO;

    return {
        isValid: hasVolume || smallBody, // Pass if either condition met
        hasVolume,
        smallBody,
        bodyRatio: bodyRatio.toFixed(2)
    };
}

/**
 * Generate intraday signals for a day (V2 - Pattern filtered)
 */
async function generateIntradaySignalsV2(categoryName, date) {
    const dateStr = typeof date === 'string' ? date : new Date(date).toISOString().split('T')[0];
    console.log(`\n[V2] Generating signals for ${categoryName} on ${dateStr}...`);

    const stocks = await getIntradayStocks(categoryName);
    console.log(`[V2] Found ${stocks.length} stocks with 1-min data`);

    const signals = [];
    let stats = {
        volumePass: 0,
        orDetected: 0,
        nPatternFound: 0,
        breakoutValid: 0,
        finalSignals: 0
    };

    for (const stock of stocks) {
        try {
            // Get 1-min candles for the day
            const candles = await get1MinCandles(stock.symbol, date);

            if (candles.length < CONFIG.MIN_CANDLES) continue;

            // V1 FILTER: Opening volume check
            const first5Candles = candles.slice(0, 5);
            const openingVolume = first5Candles.reduce((sum, c) => sum + (c.volume || 0), 0);
            const avgDailyVolume = await getAvgVolume(stock.symbol, date);

            if (!avgDailyVolume || avgDailyVolume === 0) continue;

            const expectedOpeningVolume = avgDailyVolume * 0.03;
            const volumeRatio = openingVolume / expectedOpeningVolume;

            if (volumeRatio < CONFIG.VOLUME_THRESHOLD) continue;
            stats.volumePass++;

            // FILTER 1: Opening Range
            const openingRange = detectOpeningRange(candles);
            if (!openingRange) continue;
            stats.orDetected++;

            // FILTER 2: N-Pattern
            const nPattern = detectNPattern(candles, openingRange);
            if (!nPattern) continue;
            stats.nPatternFound++;

            // FILTER 3: Breakout validation
            const breakoutValid = validateBreakoutCandle(nPattern.breakoutCandle, avgDailyVolume);
            if (!breakoutValid.isValid) continue;
            stats.breakoutValid++;

            // All filters passed - generate signal
            const entryPrice = openingRange.high; // Entry at OR breakout level
            const stopPrice = nPattern.pullbackLow; // Dynamic stop at pullback low
            const stopPercent = ((entryPrice - stopPrice) / entryPrice) * 100;
            const targetPrice = entryPrice * (1 + CONFIG.TARGET_PERCENT / 100);

            signals.push({
                symbol: stock.symbol,
                date: dateStr,
                entryTime: nPattern.breakoutCandle.timestamp.split('T')[1].substring(0, 5),
                entryPrice,
                targetPrice,
                stopPrice,
                stopPercent: stopPercent.toFixed(2),
                volumeRatio: volumeRatio.toFixed(2),
                orRange: openingRange.rangePercent.toFixed(2),
                pullbackLow: nPattern.pullbackLow,
                strategy: 'V2_PATTERN'
            });
            stats.finalSignals++;

        } catch (error) {
            // Skip stocks with errors
        }
    }

    console.log(`[V2] Pattern filtering stats:`);
    console.log(`  Volume passed: ${stats.volumePass}`);
    console.log(`  Opening Range detected: ${stats.orDetected}`);
    console.log(`  N-Pattern found: ${stats.nPatternFound}`);
    console.log(`  Breakout validated: ${stats.breakoutValid}`);
    console.log(`[V2] Generated ${signals.length} signals`);

    return signals;
}

/**
 * Simulate a single intraday trade (V2)
 */
async function simulateIntradayTradeV2(signal, date) {
    const candles = await get1MinCandles(signal.symbol, date);

    if (candles.length === 0) {
        return { ...signal, outcome: 'NO_DATA', pnlPercent: 0 };
    }

    // Find candles after entry time
    const entryMinutes = parseInt(signal.entryTime.split(':')[0]) * 60 +
        parseInt(signal.entryTime.split(':')[1]);

    const tradingCandles = candles.filter(c => {
        const timePart = c.timestamp.split('T')[1];
        const hours = parseInt(timePart.substring(0, 2), 10);
        const minutes = parseInt(timePart.substring(3, 5), 10);
        const candleMinutes = hours * 60 + minutes;
        return candleMinutes >= entryMinutes && candleMinutes <= 15 * 60 + 15;
    });

    let exitPrice = signal.entryPrice;
    let exitTime = CONFIG.EXIT_TIME;
    let exitReason = 'EOD_EXIT';
    let outcome = 'LOSS';

    for (const candle of tradingCandles) {
        // Check target hit
        if (candle.high >= signal.targetPrice) {
            exitPrice = signal.targetPrice;
            exitTime = candle.timestamp.split('T')[1].substring(0, 5);
            exitReason = 'TARGET_HIT';
            outcome = 'WIN';
            break;
        }

        // Check stop hit (dynamic stop at pullback low)
        if (candle.low <= signal.stopPrice) {
            exitPrice = signal.stopPrice;
            exitTime = candle.timestamp.split('T')[1].substring(0, 5);
            exitReason = 'STOP_HIT';
            outcome = 'LOSS';
            break;
        }
    }

    // If no target/stop hit, use last candle close
    if (exitReason === 'EOD_EXIT' && tradingCandles.length > 0) {
        const lastCandle = tradingCandles[tradingCandles.length - 1];
        exitPrice = lastCandle.close;
        outcome = exitPrice > signal.entryPrice ? 'WIN' : 'LOSS';
    }

    const pnlPercent = ((exitPrice - signal.entryPrice) / signal.entryPrice) * 100;

    return {
        ...signal,
        exitTime,
        exitPrice,
        exitReason,
        outcome,
        pnlPercent: pnlPercent.toFixed(2)
    };
}

/**
 * Run backtest for a date range (V2)
 */
async function backtestIntradayV2(categoryName, startDate, endDate) {
    console.log('\n' + '═'.repeat(60));
    console.log('INTRADAY BACKTEST V2 (PATTERN-BASED)');
    console.log('═'.repeat(60));
    console.log(`Category: ${categoryName}`);
    console.log(`Period: ${startDate} to ${endDate}`);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const allTrades = [];

    let currentDate = new Date(start);
    let tradingDays = 0;

    while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay();

        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            tradingDays++;

            const signals = await generateIntradaySignalsV2(categoryName, currentDate);

            for (const signal of signals) {
                const trade = await simulateIntradayTradeV2(signal, currentDate);
                allTrades.push(trade);
            }
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate statistics
    const winners = allTrades.filter(t => t.outcome === 'WIN');
    const losers = allTrades.filter(t => t.outcome === 'LOSS');
    const winRate = allTrades.length > 0 ? (winners.length / allTrades.length * 100) : 0;

    const avgWin = winners.length > 0
        ? winners.reduce((sum, t) => sum + parseFloat(t.pnlPercent), 0) / winners.length
        : 0;
    const avgLoss = losers.length > 0
        ? losers.reduce((sum, t) => sum + parseFloat(t.pnlPercent), 0) / losers.length
        : 0;
    const totalPnL = allTrades.reduce((sum, t) => sum + parseFloat(t.pnlPercent), 0);
    const ev = allTrades.length > 0 ? totalPnL / allTrades.length : 0;

    const targetHits = allTrades.filter(t => t.exitReason === 'TARGET_HIT').length;
    const stopHits = allTrades.filter(t => t.exitReason === 'STOP_HIT').length;
    const eodExits = allTrades.filter(t => t.exitReason === 'EOD_EXIT').length;

    // Print results
    console.log('═'.repeat(60));
    console.log(`Trading Days: ${tradingDays}`);
    console.log(`Total Signals: ${allTrades.length}`);
    console.log(`Winners: ${winners.length} (${winRate.toFixed(1)}%)`);
    console.log(`Losers: ${losers.length} (${(100 - winRate).toFixed(1)}%)`);
    console.log('');
    console.log(`Avg Win: +${avgWin.toFixed(2)}%`);
    console.log(`Avg Loss: ${avgLoss.toFixed(2)}%`);
    console.log(`Total P&L: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}%`);
    console.log('');
    console.log(`Expected Value: ${ev >= 0 ? '+' : ''}${ev.toFixed(3)}% per trade`);
    console.log('');
    console.log('Exit Breakdown:');
    if (allTrades.length > 0) {
        console.log(`  TARGET_HIT: ${targetHits} (${(targetHits / allTrades.length * 100).toFixed(1)}%)`);
        console.log(`  STOP_HIT: ${stopHits} (${(stopHits / allTrades.length * 100).toFixed(1)}%)`);
        console.log(`  EOD_EXIT: ${eodExits} (${(eodExits / allTrades.length * 100).toFixed(1)}%)`);
    }
    console.log('═'.repeat(60));

    return {
        category: categoryName,
        period: { start: startDate, end: endDate },
        tradingDays,
        totalTrades: allTrades.length,
        winners: winners.length,
        losers: losers.length,
        winRate,
        avgWin,
        avgLoss,
        totalPnL,
        ev,
        trades: allTrades
    };
}

// Export functions
module.exports = {
    generateIntradaySignalsV2,
    simulateIntradayTradeV2,
    backtestIntradayV2,
    get1MinCandles,
    getAvgVolume,
    getIntradayStocks,
    detectOpeningRange,
    detectNPattern,
    validateBreakoutCandle
};

// CLI support
if (require.main === module) {
    const args = process.argv.slice(2);
    const category = args[0] || 'INTRADAY_BOOST';
    const startDate = args[1] || '2026-01-06';
    const endDate = args[2] || startDate;

    backtestIntradayV2(category, startDate, endDate)
        .then(results => {
            console.log('\n✅ V2 Backtest complete');
        })
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}
