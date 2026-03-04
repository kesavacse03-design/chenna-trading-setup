/**
 * PHASE 1: Truth Extraction
 * 
 * Purpose: Understand what ACTUALLY happened to stocks in this category
 * 
 * For each stock:
 * 1. Fetch OHLCV data: [added_date - 5 days, added_date + 15 days]
 * 2. Simulate trade: Entry = close on added_date, Target = +3%, Stop = -2%
 * 3. Mark outcome: SUCCESS, FAILURE_STOP, FAILURE_TIMEOUT
 * 4. Calculate statistics
 * 
 * CHECKPOINT: Must have >60% success rate to proceed to Phase 2
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const labsDataService = require('../labsDataService.cjs');

// Trade simulation parameters
const DEFAULT_PARAMS = {
    targetPercent: 3.0,    // +3% profit target
    stopPercent: -2.0,     // -2% stop loss  
    maxDays: 10,           // Max holding period
    lookbackDays: 5,       // Days before added_date for context
    lookforwardDays: 15    // Days after added_date for simulation
};

/**
 * Run Phase 1 analysis for a category
 */
async function runPhase1(categoryKey, params = {}) {
    const config = { ...DEFAULT_PARAMS, ...params };

    console.log('\n' + '═'.repeat(70));
    console.log('📊 PHASE 1: DATA TRUTH EXTRACTION');
    console.log('═'.repeat(70));
    console.log(`Category: ${categoryKey}`);
    console.log(`Parameters: Target +${config.targetPercent}%, Stop ${config.stopPercent}%, Max ${config.maxDays} days`);
    console.log('─'.repeat(70));

    // Step 1: Load stocks from category
    const stocks = await loadCategoryStocks(categoryKey);
    console.log(`\n📦 Loaded ${stocks.length} stocks from ${categoryKey}`);

    // Debug: Show sample stocks
    if (stocks.length > 0) {
        console.log(`   Sample stocks: ${stocks.slice(0, 5).map(s => s.symbol).join(', ')}`);
        console.log(`   Sample addedDate: ${stocks[0].addedDate}`);
    }

    if (stocks.length < 50) {
        console.log('❌ ERROR: Need minimum 50 stocks for analysis');
        return { error: 'INSUFFICIENT_DATA', stockCount: stocks.length };
    }

    // Step 2: Fetch price data for all stocks
    console.log('\n📈 Fetching historical price data...');
    const priceData = await fetchAllPriceData(stocks, config);
    const priceDataCount = Object.keys(priceData).length;

    // Step 3: Simulate trades
    console.log('\n🎯 Simulating trades...');
    const { trades, skipReasons } = await simulateTrades(stocks, priceData, config);

    // Step 4: Calculate statistics
    const stats = calculateStatistics(trades);

    // Step 5: Display results
    displayResults(categoryKey, stats, trades);

    // Step 6: Save to database
    await savePhase1Results(categoryKey, stats, trades, config);

    // Step 7: Checkpoint validation
    const checkpoint = validateCheckpoint(stats);

    return {
        success: true,
        categoryKey,
        stats,
        trades,
        checkpoint,
        params: config,
        debug: {
            stocksLoaded: stocks.length,
            priceDataFetched: priceDataCount,
            skipReasons,
            sampleStock: stocks[0] || null
        }
    };
}

/**
 * Load stocks from a category with their added dates
 */
async function loadCategoryStocks(categoryKey) {
    // First find the category
    const category = await prisma.category.findFirst({
        where: { key: categoryKey }
    });

    if (!category) {
        throw new Error(`Category not found: ${categoryKey}`);
    }

    // Load stocks with their added dates
    const categoryStocks = await prisma.stockCategory.findMany({
        where: { categoryId: category.id },
        include: { stock: true }
    });

    return categoryStocks.map(cs => ({
        symbol: cs.stock?.symbol,
        addedDate: cs.addedDate || cs.createdAt,
        stockId: cs.stockId
    })).filter(s => s.symbol);
}

/**
 * Fetch price data for all stocks
 */
async function fetchAllPriceData(stocks, config) {
    // Use labsDataService which handles CSV cache, Upstox API, and fallback
    // Fetch 400 days to ensure we have data for all addedDates (some from July 2025)
    const days = 400;

    // labsDataService expects array of {symbol, listedDate}
    const stocksWithDates = stocks.map(s => ({
        symbol: s.symbol,
        listedDate: s.addedDate
    }));

    const priceData = await labsDataService.getHistoricalData(stocksWithDates, { days });

    const fetched = Object.keys(priceData).length;
    const failed = stocks.length - fetched;

    console.log(`   ✅ Fetched data for ${fetched} stocks (${failed} failed)`);

    // Debug: Show sample price data
    const symbols = Object.keys(priceData);
    if (symbols.length > 0) {
        const sample = priceData[symbols[0]];
        console.log(`   Sample candles for ${symbols[0]}: ${sample?.length || 0} candles`);
        if (sample && sample.length > 0) {
            console.log(`   Date range: ${sample[0].timestamp} to ${sample[sample.length - 1].timestamp}`);
        }
    }

    return priceData;
}

/**
 * Simulate trades for all stocks
 */
async function simulateTrades(stocks, priceData, config) {
    const trades = [];
    let skipped = { noCandles: 0, shortCandles: 0, dateNotFound: 0, dateOutOfRange: 0 };

    for (const stock of stocks) {
        const candles = priceData[stock.symbol];
        if (!candles) {
            skipped.noCandles++;
            continue;
        }
        if (candles.length < 20) {
            skipped.shortCandles++;
            continue;
        }
        // Debug first few stocks
        if (trades.length === 0 && skipped.noCandles + skipped.shortCandles + skipped.dateNotFound === 0) {
            console.log(`   [DEBUG] First stock: ${stock.symbol}`);
            console.log(`   [DEBUG] addedDate: ${stock.addedDate}`);
            console.log(`   [DEBUG] Candles: ${candles.length}, range: ${candles[0]?.timestamp} to ${candles[candles.length - 1]?.timestamp}`);
        }

        // Find the index of added_date in candles
        const addedIdx = findDateIndex(candles, stock.addedDate);
        if (addedIdx < 0) {
            skipped.dateNotFound++;
            continue;
        }
        if (addedIdx >= candles.length - config.maxDays) {
            skipped.dateOutOfRange++;
            continue;
        }

        // Entry price = close on added_date
        const entryCandle = candles[addedIdx];
        const entryPrice = entryCandle.close;
        const entryDate = entryCandle.timestamp || entryCandle.date;

        // Calculate target and stop prices
        const targetPrice = entryPrice * (1 + config.targetPercent / 100);
        const stopPrice = entryPrice * (1 + config.stopPercent / 100);

        // Simulate day by day
        let outcome = 'FAILURE_TIMEOUT';
        let exitPrice = entryPrice;
        let exitDate = entryDate;
        let daysHeld = config.maxDays;
        let exitReason = 'TIMEOUT';

        for (let day = 1; day <= config.maxDays; day++) {
            const idx = addedIdx + day;
            if (idx >= candles.length) break;

            const dayCandle = candles[idx];

            // Check if HIGH touched target
            if (dayCandle.high >= targetPrice) {
                outcome = 'SUCCESS';
                exitPrice = targetPrice;
                exitDate = dayCandle.timestamp || dayCandle.date;
                daysHeld = day;
                exitReason = 'TARGET_HIT';
                break;
            }

            // Check if LOW touched stop
            if (dayCandle.low <= stopPrice) {
                outcome = 'FAILURE_STOP';
                exitPrice = stopPrice;
                exitDate = dayCandle.timestamp || dayCandle.date;
                daysHeld = day;
                exitReason = 'STOP_HIT';
                break;
            }

            // If last day and no exit, use close price
            if (day === config.maxDays) {
                exitPrice = dayCandle.close;
                exitDate = dayCandle.timestamp || dayCandle.date;
            }
        }

        // Calculate return
        const returnPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

        trades.push({
            symbol: stock.symbol,
            addedDate: stock.addedDate,
            entryDate,
            entryPrice,
            exitDate,
            exitPrice,
            outcome,
            exitReason,
            daysHeld,
            returnPercent: Math.round(returnPercent * 100) / 100
        });
    }

    // Debug: Show skip reasons
    console.log(`   Skipped: noCandles=${skipped.noCandles}, shortCandles=${skipped.shortCandles}, dateNotFound=${skipped.dateNotFound}, dateOutOfRange=${skipped.dateOutOfRange}`);
    console.log(`   ✅ Simulated ${trades.length} trades`);

    return { trades, skipReasons: skipped };
}

/**
 * Find index of a date in candles array
 * If addedDate is before the candle data, use early data point for testing
 */
function findDateIndex(candles, targetDate, config = {}) {
    const target = new Date(targetDate).toDateString();
    const targetTime = new Date(targetDate).getTime();

    // Helper to get date from candle (handles both 'timestamp' and 'date' properties)
    const getCandleTime = (candle) => {
        const dateStr = candle.timestamp || candle.date;
        return new Date(dateStr).getTime();
    };

    // Get candle date range
    const firstCandleTime = getCandleTime(candles[0]);
    const lastCandleTime = getCandleTime(candles[candles.length - 1]);

    // Check if target date is within candle range
    const isBeforeData = targetTime < firstCandleTime;
    const isAfterData = targetTime > lastCandleTime;

    // CRITICAL FIX: If addedDate is BEFORE our data, return -1 to SKIP this stock
    // Do NOT use fallback - we MUST analyze on actual addedDate only
    if (isBeforeData) {
        // addedDate is before our available data - SKIP this stock
        return -1;
    }

    // If addedDate is after the candle data ends (too recent), return -1
    if (isAfterData) {
        return -1;
    }

    // Try exact match first
    for (let i = 0; i < candles.length; i++) {
        const candleDate = candles[i].timestamp || candles[i].date;
        if (new Date(candleDate).toDateString() === target) {
            return i;
        }
    }

    // If exact date not found (weekend/holiday), find closest within 5 days
    let closestIdx = -1;
    let closestDiff = Infinity;
    const maxDiffMs = 5 * 24 * 60 * 60 * 1000; // 5 days in ms

    for (let i = 0; i < candles.length; i++) {
        const diff = Math.abs(getCandleTime(candles[i]) - targetTime);
        if (diff < closestDiff && diff < maxDiffMs) {
            closestDiff = diff;
            closestIdx = i;
        }
    }

    return closestIdx;
}

/**
 * Calculate statistics from trades
 */
function calculateStatistics(trades) {
    const total = trades.length;
    const success = trades.filter(t => t.outcome === 'SUCCESS');
    const failureStop = trades.filter(t => t.outcome === 'FAILURE_STOP');
    const failureTimeout = trades.filter(t => t.outcome === 'FAILURE_TIMEOUT');

    const successRate = total > 0 ? (success.length / total) * 100 : 0;

    const avgWinnerReturn = success.length > 0
        ? success.reduce((sum, t) => sum + t.returnPercent, 0) / success.length
        : 0;

    const allFailures = [...failureStop, ...failureTimeout];
    const avgLoserReturn = allFailures.length > 0
        ? allFailures.reduce((sum, t) => sum + t.returnPercent, 0) / allFailures.length
        : 0;

    const avgDaysWinner = success.length > 0
        ? success.reduce((sum, t) => sum + t.daysHeld, 0) / success.length
        : 0;

    const avgDaysLoser = allFailures.length > 0
        ? allFailures.reduce((sum, t) => sum + t.daysHeld, 0) / allFailures.length
        : 0;

    // Return distribution
    const distribution = {
        below_minus5: trades.filter(t => t.returnPercent < -5).length,
        minus5_to_minus2: trades.filter(t => t.returnPercent >= -5 && t.returnPercent < -2).length,
        minus2_to_0: trades.filter(t => t.returnPercent >= -2 && t.returnPercent < 0).length,
        zero_to_plus2: trades.filter(t => t.returnPercent >= 0 && t.returnPercent < 2).length,
        plus2_to_plus5: trades.filter(t => t.returnPercent >= 2 && t.returnPercent < 5).length,
        plus5_to_plus10: trades.filter(t => t.returnPercent >= 5 && t.returnPercent < 10).length,
        above_plus10: trades.filter(t => t.returnPercent >= 10).length
    };

    // Overall average return
    const overallAvgReturn = total > 0
        ? trades.reduce((sum, t) => sum + t.returnPercent, 0) / total
        : 0;

    return {
        totalTrades: total,
        successCount: success.length,
        failureStopCount: failureStop.length,
        failureTimeoutCount: failureTimeout.length,
        successRate: Math.round(successRate * 10) / 10,
        avgWinnerReturn: Math.round(avgWinnerReturn * 100) / 100,
        avgLoserReturn: Math.round(avgLoserReturn * 100) / 100,
        avgDaysWinner: Math.round(avgDaysWinner * 10) / 10,
        avgDaysLoser: Math.round(avgDaysLoser * 10) / 10,
        overallAvgReturn: Math.round(overallAvgReturn * 100) / 100,
        distribution
    };
}

/**
 * Display results in console
 */
function displayResults(categoryKey, stats, trades) {
    console.log('\n' + '═'.repeat(70));
    console.log(`📊 PHASE 1 RESULTS: ${categoryKey}`);
    console.log('═'.repeat(70));

    console.log('\n📈 ANALYSIS SUMMARY');
    console.log('─'.repeat(40));
    console.log(`Total Stocks Analyzed: ${stats.totalTrades}`);

    console.log('\nOUTCOMES:');
    console.log(`   ✅ Success: ${stats.successCount} (${stats.successRate}%)`);
    console.log(`   ❌ Hit Stop Loss: ${stats.failureStopCount} (${Math.round(stats.failureStopCount / stats.totalTrades * 100)}%)`);
    console.log(`   ⏱️  Timeout: ${stats.failureTimeoutCount} (${Math.round(stats.failureTimeoutCount / stats.totalTrades * 100)}%)`);

    console.log('\nRETURNS:');
    console.log(`   Average Winner: +${stats.avgWinnerReturn}%`);
    console.log(`   Average Loser: ${stats.avgLoserReturn}%`);
    console.log(`   Overall Average: ${stats.overallAvgReturn > 0 ? '+' : ''}${stats.overallAvgReturn}%`);

    console.log('\nTIMING:');
    console.log(`   Avg Days (Winners): ${stats.avgDaysWinner} days`);
    console.log(`   Avg Days (Losers): ${stats.avgDaysLoser} days`);

    console.log('\nRETURN DISTRIBUTION:');
    const d = stats.distribution;
    console.log(`   < -5%:      ${'█'.repeat(Math.min(d.below_minus5, 20))} ${d.below_minus5}`);
    console.log(`   -5% to -2%: ${'█'.repeat(Math.min(d.minus5_to_minus2, 20))} ${d.minus5_to_minus2}`);
    console.log(`   -2% to 0%:  ${'█'.repeat(Math.min(d.minus2_to_0, 20))} ${d.minus2_to_0}`);
    console.log(`   0% to +2%:  ${'█'.repeat(Math.min(d.zero_to_plus2, 20))} ${d.zero_to_plus2}`);
    console.log(`   +2% to +5%: ${'█'.repeat(Math.min(d.plus2_to_plus5, 20))} ${d.plus2_to_plus5}`);
    console.log(`   +5% to +10%:${'█'.repeat(Math.min(d.plus5_to_plus10, 20))} ${d.plus5_to_plus10}`);
    console.log(`   > +10%:     ${'█'.repeat(Math.min(d.above_plus10, 20))} ${d.above_plus10}`);

    // Show sample trades
    console.log('\n📋 SAMPLE TRADES (First 10):');
    console.log('─'.repeat(90));
    console.log('Symbol'.padEnd(12) + 'Entry'.padEnd(12) + 'Exit'.padEnd(12) + 'Outcome'.padEnd(18) + 'Days'.padEnd(6) + 'Return');
    console.log('─'.repeat(90));

    trades.slice(0, 10).forEach(t => {
        const outcome = t.outcome === 'SUCCESS' ? '✅ SUCCESS' :
            t.outcome === 'FAILURE_STOP' ? '❌ STOP_HIT' : '⏱️  TIMEOUT';
        const ret = t.returnPercent >= 0 ? `+${t.returnPercent}%` : `${t.returnPercent}%`;
        console.log(
            t.symbol.padEnd(12) +
            `₹${t.entryPrice.toFixed(0)}`.padEnd(12) +
            `₹${t.exitPrice.toFixed(0)}`.padEnd(12) +
            outcome.padEnd(18) +
            `${t.daysHeld}`.padEnd(6) +
            ret
        );
    });

    console.log('─'.repeat(90));
}

/**
 * Validate checkpoint - must have >60% success rate
 */
function validateCheckpoint(stats) {
    const passed = stats.successRate >= 60;

    console.log('\n' + '═'.repeat(70));
    console.log('🚦 PHASE 1 CHECKPOINT');
    console.log('═'.repeat(70));

    if (passed) {
        console.log(`\n✅ CHECKPOINT PASSED: ${stats.successRate}% success rate (≥60% required)`);
        console.log('   → Ready to proceed to Phase 2: Category Signature Discovery');
    } else if (stats.successRate >= 50) {
        console.log(`\n⚠️  CHECKPOINT WARNING: ${stats.successRate}% success rate`);
        console.log('   → Consider adjusting parameters (target/stop) or proceed with caution');
    } else {
        console.log(`\n❌ CHECKPOINT FAILED: ${stats.successRate}% success rate`);
        console.log('   → Data quality issue or wrong category. Do NOT proceed to Phase 2.');
        console.log('   → Try adjusting target/stop parameters or check data source.');
    }

    console.log('═'.repeat(70));

    return {
        passed,
        successRate: stats.successRate,
        recommendation: passed ? 'PROCEED' : (stats.successRate >= 50 ? 'PROCEED_WITH_CAUTION' : 'DO_NOT_PROCEED')
    };
}

/**
 * Save Phase 1 results to database
 */
async function savePhase1Results(categoryKey, stats, trades, config) {
    // Save to labs_results table or a new phase_results table
    // For now, log that we would save
    console.log('\n💾 Saving Phase 1 results...');
    console.log(`   Category: ${categoryKey}`);
    console.log(`   Trades: ${trades.length}`);
    console.log(`   Success Rate: ${stats.successRate}%`);

    // TODO: Create labs_phase_results table and save
    // For now, return the data for frontend

    return {
        savedAt: new Date().toISOString(),
        categoryKey,
        phase: 1,
        stats,
        tradeCount: trades.length
    };
}

module.exports = {
    runPhase1,
    DEFAULT_PARAMS
};
