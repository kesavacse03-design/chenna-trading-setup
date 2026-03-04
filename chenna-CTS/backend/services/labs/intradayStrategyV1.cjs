/**
 * Intraday Strategy V1 - Basic Volume-Based Signals
 * 
 * BASELINE STRATEGY (no patterns, just volume filter)
 * Expected: ~50% win rate
 * 
 * Signal Logic:
 * 1. Check first candle (9:15) volume
 * 2. If volume > 1.5x 20-day average → Signal
 * 3. Entry: 9:20 candle close
 * 4. Target: +1.5%
 * 5. Stop: -1%
 * 6. Force exit: 3:15 PM
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Configuration
const CONFIG = {
    TARGET_PERCENT: 1.5,    // +1.5% profit target
    STOP_PERCENT: 1.0,      // -1% stop loss
    VOLUME_THRESHOLD: 1.5,  // 1.5x average volume
    ENTRY_TIME: '09:20',    // Entry at second candle
    EXIT_TIME: '15:15',     // Force exit at 3:15 PM
    MIN_CANDLES: 100        // Minimum candles required
};

/**
 * Get 1-minute candles for a stock on a specific date
 */
async function get1MinCandles(symbol, date) {
    const targetDateStr = typeof date === 'string'
        ? date.split('T')[0]
        : new Date(date).toISOString().split('T')[0];

    const cached = await prisma.ohlcvCache.findFirst({
        where: {
            symbol,
            interval: '5m'
        }
    });

    if (!cached || !cached.data) return [];

    // Filter candles for the specific date and market hours
    // Timestamps are stored with IST offset like "2026-01-15T09:15:00+05:30"
    const candles = cached.data.filter(c => {
        if (!c.timestamp) return false;

        // Extract date from the IST timestamp (before the T)
        const candleDateStr = c.timestamp.split('T')[0];
        if (candleDateStr !== targetDateStr) return false;

        // Extract time - handles both "HH:MM:SS" and "HH:MM:SS+05:30" formats
        const timePart = c.timestamp.split('T')[1];
        if (!timePart) return false;

        const hours = parseInt(timePart.substring(0, 2), 10);
        const minutes = parseInt(timePart.substring(3, 5), 10);
        const timeNum = hours * 100 + minutes;

        // Market hours: 9:15 AM to 3:30 PM IST
        return timeNum >= 915 && timeNum <= 1530;
    });

    return candles.sort((a, b) => {
        // Sort by timestamp string (works for ISO format)
        return a.timestamp.localeCompare(b.timestamp);
    });
}

/**
 * Get 20-day average volume for a stock
 */
async function getAvgVolume(symbol, date) {
    const endDate = new Date(date);
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 30); // Go back 30 days to ensure 20 trading days

    const cached = await prisma.ohlcvCache.findFirst({
        where: {
            symbol,
            interval: 'day',
            fromDate: { lte: startDate },
            toDate: { gte: endDate }
        }
    });

    if (!cached || !cached.data || cached.data.length < 10) {
        return null;
    }

    // Get last 20 candles before the target date
    const targetDateStr = date.toISOString().split('T')[0];
    const priorCandles = cached.data
        .filter(c => new Date(c.timestamp).toISOString().split('T')[0] < targetDateStr)
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
            stocks: {
                include: { stock: true }
            }
        }
    });

    if (!category) {
        console.log(`Category ${categoryName} not found`);
        return [];
    }

    // Get symbols that have 1-min data
    const symbolsWithData = await prisma.$queryRaw`
        SELECT DISTINCT symbol FROM ohlcv_cache WHERE interval = '5m'
    `;
    const validSymbols = new Set(symbolsWithData.map(r => r.symbol));

    const stocks = category.stocks
        .filter(sc => sc.stock && validSymbols.has(sc.stock.symbol))
        .map(sc => ({
            symbol: sc.stock.symbol,
            instrumentKey: sc.stock.instrumentKey
        }));

    return stocks;
}

/**
 * Generate intraday signals for a day (V1 - Volume filter only)
 */
async function generateIntradaySignalsV1(categoryName, date) {
    const dateStr = new Date(date).toISOString().split('T')[0];
    console.log(`\n[V1] Generating signals for ${categoryName} on ${dateStr}...`);

    const stocks = await getIntradayStocks(categoryName);
    console.log(`[V1] Found ${stocks.length} stocks with 1-min data`);

    const signals = [];

    for (const stock of stocks) {
        try {
            // Get 1-min candles for the day
            const candles = await get1MinCandles(stock.symbol, date);

            if (candles.length < CONFIG.MIN_CANDLES) {
                continue; // Skip incomplete data
            }

            // Get first 5 candles volume (first 5 minutes of trading)
            const first5Candles = candles.slice(0, 5);
            const openingVolume = first5Candles.reduce((sum, c) => sum + (c.volume || 0), 0);

            // Get 20-day average volume (daily)
            const avgDailyVolume = await getAvgVolume(stock.symbol, date);

            if (!avgDailyVolume || avgDailyVolume === 0) {
                continue; // Skip if no volume data
            }

            // Expected opening 5-min volume is ~3% of daily volume
            const expectedOpeningVolume = avgDailyVolume * 0.03;
            const volumeRatio = openingVolume / expectedOpeningVolume;

            if (volumeRatio < CONFIG.VOLUME_THRESHOLD) {
                continue; // Volume too low
            }

            // Find entry candle (9:20 AM - second candle)
            const entryCandle = candles.find(c => {
                const time = new Date(c.timestamp);
                return time.getHours() === 9 && time.getMinutes() === 20;
            });

            if (!entryCandle) {
                continue; // No entry candle
            }

            const entryPrice = entryCandle.close;
            const targetPrice = entryPrice * (1 + CONFIG.TARGET_PERCENT / 100);
            const stopPrice = entryPrice * (1 - CONFIG.STOP_PERCENT / 100);

            signals.push({
                symbol: stock.symbol,
                date: dateStr,
                entryTime: '09:20',
                entryPrice,
                targetPrice,
                stopPrice,
                volumeRatio: volumeRatio.toFixed(2),
                strategy: 'V1_BASIC'
            });

        } catch (error) {
            // Skip stocks with errors
        }
    }

    console.log(`[V1] Generated ${signals.length} signals`);
    return signals;
}

/**
 * Simulate a single intraday trade
 */
async function simulateIntradayTradeV1(signal, date) {
    const candles = await get1MinCandles(signal.symbol, date);

    if (candles.length === 0) {
        return { ...signal, outcome: 'NO_DATA', pnlPercent: 0 };
    }

    // Filter candles from entry time to exit time
    const tradingCandles = candles.filter(c => {
        const time = new Date(c.timestamp);
        const hours = time.getHours();
        const minutes = time.getMinutes();
        const timeNum = hours * 100 + minutes;
        return timeNum >= 920 && timeNum <= 1515;
    });

    let exitPrice = signal.entryPrice;
    let exitTime = CONFIG.EXIT_TIME;
    let exitReason = 'EOD_EXIT';
    let outcome = 'LOSS';

    for (const candle of tradingCandles) {
        // Check target hit
        if (candle.high >= signal.targetPrice) {
            exitPrice = signal.targetPrice;
            exitTime = new Date(candle.timestamp).toTimeString().slice(0, 5);
            exitReason = 'TARGET_HIT';
            outcome = 'WIN';
            break;
        }

        // Check stop hit
        if (candle.low <= signal.stopPrice) {
            exitPrice = signal.stopPrice;
            exitTime = new Date(candle.timestamp).toTimeString().slice(0, 5);
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
 * Run backtest for a date range
 */
async function backtestIntradayV1(categoryName, startDate, endDate) {
    console.log('\n' + '═'.repeat(60));
    console.log('INTRADAY BACKTEST V1 (BASIC)');
    console.log('═'.repeat(60));
    console.log(`Category: ${categoryName}`);
    console.log(`Period: ${startDate} to ${endDate}`);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const allTrades = [];

    // Iterate through each trading day
    let currentDate = new Date(start);
    let tradingDays = 0;

    while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay();

        // Skip weekends
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            tradingDays++;

            // Generate signals for this day
            const signals = await generateIntradaySignalsV1(categoryName, currentDate);

            // Simulate each trade
            for (const signal of signals) {
                const trade = await simulateIntradayTradeV1(signal, currentDate);
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

    // Exit breakdown
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
    console.log(`  TARGET_HIT: ${targetHits} (${(targetHits / allTrades.length * 100).toFixed(1)}%)`);
    console.log(`  STOP_HIT: ${stopHits} (${(stopHits / allTrades.length * 100).toFixed(1)}%)`);
    console.log(`  EOD_EXIT: ${eodExits} (${(eodExits / allTrades.length * 100).toFixed(1)}%)`);
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
    generateIntradaySignalsV1,
    simulateIntradayTradeV1,
    backtestIntradayV1,
    get1MinCandles,
    getAvgVolume,
    getIntradayStocks
};

// CLI support
if (require.main === module) {
    const args = process.argv.slice(2);
    const category = args[0] || 'INTRADAY_BOOST';
    const startDate = args[1] || '2026-01-15';
    const endDate = args[2] || startDate;

    backtestIntradayV1(category, startDate, endDate)
        .then(results => {
            console.log('\n✅ Backtest complete');
        })
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}
