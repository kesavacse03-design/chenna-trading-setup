/**
 * Quick Backtest - Uses UNIFIED Signal Generator
 * 
 * CRITICAL: This uses the SAME signal generator as live trading!
 * Backtest results are trustworthy because both use signalGeneratorV2.
 * 
 * Usage: node scripts/quick_backtest.cjs SHORT_TERM_SWING_BO_DOWN 2025-12-01 2025-12-31
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import UNIFIED signal generator (same as live trading!)
const { generateCategorySignals } = require('../services/labs/signalGeneratorV2.cjs');

// Get cached OHLC data from database
async function getCachedOHLC(symbol, targetDate) {
    const dateStr = targetDate.toISOString().split('T')[0];

    const cached = await prisma.ohlcvCache.findFirst({
        where: {
            symbol,
            interval: 'day',
            fromDate: { lte: targetDate },
            toDate: { gte: targetDate }
        }
    });

    if (!cached || !cached.data) return null;

    const candles = cached.data;
    const candle = candles.find(c => {
        const candleDate = new Date(c.timestamp).toISOString().split('T')[0];
        return candleDate === dateStr;
    });

    return candle;
}

// Get trading days (weekdays only)
function getTradingDays(startDate, endDate) {
    const days = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            days.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
}

async function runQuickBacktest(categoryKey, startDateStr, endDateStr) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`QUICK BACKTEST - UNIFIED SIGNAL GENERATOR`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Category: ${categoryKey}`);
    console.log(`Period: ${startDateStr} to ${endDateStr}`);
    console.log(`Using: signalGeneratorV2.generateCategorySignals(backtestMode=true)`);
    console.log(`${'='.repeat(70)}\n`);

    // Get category config for exit rules
    const config = await prisma.categoryConfig.findUnique({
        where: { categoryKey }
    });

    if (!config) {
        console.error(`❌ Category config not found: ${categoryKey}`);
        return;
    }

    const targetPercent = config.targetPercent || 2;
    const stopPercent = config.stopPercent || -1.5;

    console.log(`Exit Rules: Target +${targetPercent}%, Stop ${stopPercent}%\n`);

    // Get trading days
    const tradingDays = getTradingDays(new Date(startDateStr), new Date(endDateStr));
    console.log(`Trading days in range: ${tradingDays.length}\n`);

    // Track trades and active positions
    const allTrades = [];
    const activePositions = new Map(); // symbol -> exitDate
    let tradeNumber = 0;

    // Process each trading day
    for (const currentDate of tradingDays) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][currentDate.getDay()];

        // Clean up active positions that have exited
        for (const [symbol, exitDate] of activePositions.entries()) {
            if (new Date(dateStr) > new Date(exitDate)) {
                activePositions.delete(symbol);
            }
        }

        console.log(`\n📅 ${dateStr} (${dayName}) - Calling UNIFIED Signal Generator...`);
        console.log(`   Active Positions: ${activePositions.size} (${Array.from(activePositions.keys()).join(', ')})`);

        try {
            // ✅ USE UNIFIED SIGNAL GENERATOR (same as live trading!)
            const result = await generateCategorySignals(
                categoryKey,
                currentDate,
                100000,  // portfolio size
                true     // backtestMode = true (uses ALL stocks in category)
            );

            const rawSignals = result.signals || [];

            // Filter out signals for stocks we already hold
            const signals = rawSignals.filter(s => !activePositions.has(s.symbol));

            console.log(`   Status: ${result.status}`);
            if (result.reason) console.log(`   Reason: ${result.reason}`);
            console.log(`   Signals generated: ${rawSignals.length} (New: ${signals.length}, Skipped: ${rawSignals.length - signals.length})`);

            // Execute trades for each signal
            for (const signal of signals) {
                tradeNumber++;

                const target = signal.targetPrice || signal.entryPrice * (1 + targetPercent / 100);
                const stop = signal.stopPrice || signal.entryPrice * (1 + stopPercent / 100);

                let exitPrice = signal.entryPrice;
                let exitReason = 'NO_DATA';
                let outcome = 'UNKNOWN';
                let pnlPercent = 0;
                let daysHeld = 0;
                let finalExitDate = null;

                // CRITICAL: Check ALL 3 trading days for target/stop (like Phase 2 analysis)
                // Day 1: 39% hit target
                // Day 2: 33% hit target
                // Day 3: Force exit
                for (let day = 1; day <= 3; day++) {
                    // Find next trading day (skip weekends)
                    let checkDate = new Date(currentDate);
                    let daysAdded = 0;
                    while (daysAdded < day) {
                        checkDate.setDate(checkDate.getDate() + 1);
                        const dayOfWeek = checkDate.getDay();
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                            daysAdded++;
                        }
                    }

                    const candle = await getCachedOHLC(signal.symbol, checkDate);

                    if (!candle) {
                        console.log(`[Exit] ${signal.symbol} Day ${day}: No data available`);
                        continue; // Skip this day if no data
                    }

                    // Check if TARGET hit (high >= target)
                    if (candle.high >= target) {
                        exitPrice = target;
                        exitReason = `TARGET_D${day}`;
                        outcome = 'WIN';
                        pnlPercent = targetPercent;
                        daysHeld = day;
                        daysHeld = day;
                        finalExitDate = checkDate;
                        break; // Exit loop - trade completed
                    }

                    // Check if STOP hit (low <= stop)
                    if (candle.low <= stop) {
                        exitPrice = stop;
                        exitReason = `STOP_D${day}`;
                        outcome = 'LOSS';
                        pnlPercent = stopPercent;
                        daysHeld = day;
                        finalExitDate = checkDate;
                        break; // Exit loop - trade completed
                    }

                    // Day 3: Force exit at close (neither target nor stop hit)
                    if (day === 3) {
                        exitPrice = candle.close;
                        exitReason = 'DAY3_CLOSE';
                        pnlPercent = ((exitPrice - signal.entryPrice) / signal.entryPrice) * 100;
                        outcome = pnlPercent > 0 ? 'WIN' : 'LOSS';
                        daysHeld = 3;
                        daysHeld = 3;
                        finalExitDate = checkDate;
                        break;
                    }
                }

                // Add to active positions if trade executed
                if (finalExitDate) {
                    const exitDateStr = finalExitDate.toISOString().split('T')[0];
                    activePositions.set(signal.symbol, exitDateStr);
                }

                allTrades.push({
                    tradeNumber,
                    symbol: signal.symbol,
                    tier: signal.tier,
                    tierName: signal.tierName,
                    entryDate: dateStr,
                    entryPrice: signal.entryPrice,
                    targetPrice: signal.targetPrice,
                    stopPrice: signal.stopPrice,
                    exitPrice,
                    exitReason,
                    pnlPercent,
                    outcome,
                    confidenceScore: signal.confidenceScore
                });
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
    }

    // Calculate results
    const wins = allTrades.filter(t => t.outcome === 'WIN').length;
    const losses = allTrades.filter(t => t.outcome === 'LOSS').length;
    const winRate = allTrades.length > 0 ? (wins / allTrades.length * 100) : 0;
    const totalPnL = allTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
    const avgPnL = allTrades.length > 0 ? totalPnL / allTrades.length : 0;

    // Results by tier
    const tier1Trades = allTrades.filter(t => t.tier === 1);
    const tier2Trades = allTrades.filter(t => t.tier === 2);
    const tier3Trades = allTrades.filter(t => t.tier === 3);

    const tier1WinRate = tier1Trades.length > 0 ? (tier1Trades.filter(t => t.outcome === 'WIN').length / tier1Trades.length * 100) : 0;
    const tier2WinRate = tier2Trades.length > 0 ? (tier2Trades.filter(t => t.outcome === 'WIN').length / tier2Trades.length * 100) : 0;
    const tier3WinRate = tier3Trades.length > 0 ? (tier3Trades.filter(t => t.outcome === 'WIN').length / tier3Trades.length * 100) : 0;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`BACKTEST RESULTS`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Total Signals: ${allTrades.length}`);
    console.log(`Total Trades: ${allTrades.length}`);
    console.log(`Winners: ${wins}`);
    console.log(`Losers: ${losses}`);
    console.log(`Win Rate: ${winRate.toFixed(1)}% ${winRate >= 70 ? '✅' : '❌'}`);
    console.log(`Total P&L: ${totalPnL.toFixed(2)}%`);
    console.log(`Avg P&L per Trade: ${avgPnL.toFixed(2)}%`);
    console.log(`${'='.repeat(70)}`);

    console.log(`\n📊 RESULTS BY TIER:`);
    console.log(`  Tier 1 (<₹200): ${tier1Trades.length} trades, ${tier1WinRate.toFixed(1)}% win rate (expected 92.9%)`);
    console.log(`  Tier 2 (₹200-1000): ${tier2Trades.length} trades, ${tier2WinRate.toFixed(1)}% win rate (expected 68.9%)`);
    console.log(`  Tier 3 (>₹1000): ${tier3Trades.length} trades, ${tier3WinRate.toFixed(1)}% win rate (expected 65%)`);

    // Show first 20 trades
    console.log(`\n📋 TRADE LOG (first 20):`);
    console.log(`${'─'.repeat(100)}`);
    console.log(`#   Symbol         Tier  Entry       Exit       Reason    P&L     Result`);
    console.log(`${'─'.repeat(100)}`);

    for (const t of allTrades.slice(0, 20)) {
        const outcome = t.outcome === 'WIN' ? '✅' : (t.outcome === 'LOSS' ? '❌' : '⚪');
        console.log(
            `${String(t.tradeNumber).padStart(3)}  ` +
            `${t.symbol.padEnd(12)}  ` +
            `T${t.tier}    ` +
            `₹${t.entryPrice.toFixed(2).padStart(8)}  ` +
            `₹${t.exitPrice.toFixed(2).padStart(8)}  ` +
            `${(t.exitReason || 'N/A').padEnd(8)}  ` +
            `${(t.pnlPercent >= 0 ? '+' : '') + t.pnlPercent.toFixed(2).padStart(6)}%  ` +
            `${outcome}`
        );
    }

    if (allTrades.length > 20) {
        console.log(`... and ${allTrades.length - 20} more trades`);
    }
    console.log(`${'─'.repeat(100)}\n`);

    // Export to CSV
    const fs = require('fs');
    const csvHeader = 'TradeNo,Symbol,Tier,TierName,EntryDate,EntryPrice,TargetPrice,StopPrice,ExitPrice,ExitReason,PnL%,Outcome,ConfidenceScore\n';
    const csvRows = allTrades.map(t => [
        t.tradeNumber,
        t.symbol,
        t.tier,
        t.tierName || '',
        t.entryDate,
        t.entryPrice.toFixed(2),
        (t.targetPrice || 0).toFixed(2),
        (t.stopPrice || 0).toFixed(2),
        t.exitPrice.toFixed(2),
        t.exitReason,
        t.pnlPercent.toFixed(2),
        t.outcome,
        (t.confidenceScore || 0).toFixed(3)
    ].join(',')).join('\n');

    const csvFilename = `backtest_${categoryKey}_${startDateStr}_${endDateStr}.csv`;
    fs.writeFileSync(csvFilename, csvHeader + csvRows);
    console.log(`📥 Trade log exported: ${csvFilename}`);

    return { trades: allTrades, winRate, totalPnL };
}

// CLI
const args = process.argv.slice(2);
if (args.length < 3) {
    console.log('Usage: node quick_backtest.cjs <categoryKey> <startDate> <endDate>');
    console.log('Example: node quick_backtest.cjs SHORT_TERM_SWING_BO_DOWN 2025-12-01 2025-12-31');
    process.exit(1);
}

runQuickBacktest(args[0], args[1], args[2])
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
