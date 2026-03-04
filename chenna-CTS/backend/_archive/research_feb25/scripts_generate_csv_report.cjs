/**
 * Generate Detailed CSV Report for V2.1 Strategy
 * Includes all trades from both periods with full details
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Import V2.1 functions
const {
    generateIntradaySignalsV21,
    simulateIntradayTradeV21
} = require('../services/labs/intradayStrategyV2_1.cjs');

async function getRawCandles(symbol, date) {
    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: '5m' }
    });
    if (!cached || !cached.data) return [];

    return cached.data
        .filter(c => c.timestamp && c.timestamp.split('T')[0] === date)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function generateReport() {
    console.log('═'.repeat(70));
    console.log('GENERATING DETAILED V2.1 TRADE REPORT');
    console.log('═'.repeat(70));

    const allTrades = [];

    // All available trading dates
    const dates = [
        '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
        '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-16', '2026-01-19'
    ];

    for (const dateStr of dates) {
        console.log(`\nProcessing ${dateStr}...`);

        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const signals = await generateIntradaySignalsV21('INTRADAY_BOOST', date);
        console.log(`  Found ${signals.length} signals`);

        for (const signal of signals) {
            const trade = await simulateIntradayTradeV21(signal, date);

            // Get candle data for verification
            const candles = await getRawCandles(signal.symbol, dateStr);
            const entryCandle = candles.find(c => c.timestamp.split('T')[1].substring(0, 5) === signal.entryTime);
            const exitCandle = candles.find(c => c.timestamp.split('T')[1].substring(0, 5) === trade.exitTime);

            allTrades.push({
                date: dateStr,
                symbol: signal.symbol,
                category: 'INTRADAY_BOOST',
                strategy: 'V2.1_ENHANCED',

                // Entry Details
                entryTime: signal.entryTime,
                entryPrice: signal.entryPrice,
                entryCandle_O: entryCandle?.open || '',
                entryCandle_H: entryCandle?.high || '',
                entryCandle_L: entryCandle?.low || '',
                entryCandle_C: entryCandle?.close || '',
                entryCandle_V: entryCandle?.volume || '',

                // Target & Stop
                targetPrice: signal.targetPrice,
                stopPrice: signal.stopPrice,
                stopPercent: signal.stopPercent,

                // Exit Details
                exitTime: trade.exitTime,
                exitPrice: trade.exitPrice,
                exitReason: trade.exitReason,
                exitCandle_O: exitCandle?.open || '',
                exitCandle_H: exitCandle?.high || '',
                exitCandle_L: exitCandle?.low || '',
                exitCandle_C: exitCandle?.close || '',
                exitCandle_V: exitCandle?.volume || '',

                // Result
                outcome: trade.outcome,
                pnlPercent: trade.pnlPercent,

                // Pattern Details
                orRange: signal.orRange,
                volumeRatio: signal.volumeRatio,
                enhancedChecks: signal.enhancedChecks,

                // Verification
                priceInRange: entryCandle ? (signal.entryPrice >= entryCandle.low && signal.entryPrice <= entryCandle.high) : false
            });
        }
    }

    // Sort by date and time
    allTrades.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.entryTime.localeCompare(b.entryTime);
    });

    // Generate CSV
    const headers = [
        'Date', 'Symbol', 'Category', 'Strategy',
        'Entry_Time', 'Entry_Price', 'Entry_O', 'Entry_H', 'Entry_L', 'Entry_C', 'Entry_Vol',
        'Target_Price', 'Stop_Price', 'Stop_Pct',
        'Exit_Time', 'Exit_Price', 'Exit_Reason', 'Exit_O', 'Exit_H', 'Exit_L', 'Exit_C', 'Exit_Vol',
        'Outcome', 'PnL_Pct',
        'OR_Range', 'Volume_Ratio', 'Enhanced_Checks',
        'Price_In_Range'
    ];

    let csv = headers.join(',') + '\n';

    for (const t of allTrades) {
        const row = [
            t.date, t.symbol, t.category, t.strategy,
            t.entryTime, t.entryPrice, t.entryCandle_O, t.entryCandle_H, t.entryCandle_L, t.entryCandle_C, t.entryCandle_V,
            t.targetPrice, t.stopPrice, t.stopPercent,
            t.exitTime, t.exitPrice, t.exitReason, t.exitCandle_O, t.exitCandle_H, t.exitCandle_L, t.exitCandle_C, t.exitCandle_V,
            t.outcome, t.pnlPercent,
            t.orRange, t.volumeRatio, t.enhancedChecks,
            t.priceInRange
        ];
        csv += row.join(',') + '\n';
    }

    // Save to accessible location
    const outputPath = path.join(__dirname, '..', '..', '..', 'V2_1_Complete_Trade_Report.csv');
    fs.writeFileSync(outputPath, csv);
    console.log(`\n✅ Report saved to: ${outputPath}`);

    // Also save summary
    const winners = allTrades.filter(t => t.outcome === 'WIN');
    const losers = allTrades.filter(t => t.outcome === 'LOSS');
    const winRate = (winners.length / allTrades.length * 100).toFixed(1);
    const totalPnL = allTrades.reduce((sum, t) => sum + parseFloat(t.pnlPercent), 0).toFixed(2);
    const avgPnL = (totalPnL / allTrades.length).toFixed(3);

    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total Trades: ${allTrades.length}`);
    console.log(`Winners: ${winners.length} (${winRate}%)`);
    console.log(`Losers: ${losers.length}`);
    console.log(`Total P&L: ${totalPnL}%`);
    console.log(`Avg P&L per trade: ${avgPnL}%`);

    // By date breakdown
    console.log('\nBy Date:');
    const byDate = {};
    allTrades.forEach(t => {
        if (!byDate[t.date]) byDate[t.date] = { trades: 0, wins: 0, pnl: 0 };
        byDate[t.date].trades++;
        if (t.outcome === 'WIN') byDate[t.date].wins++;
        byDate[t.date].pnl += parseFloat(t.pnlPercent);
    });

    Object.keys(byDate).sort().forEach(date => {
        const d = byDate[date];
        console.log(`  ${date}: ${d.trades} trades, ${(d.wins / d.trades * 100).toFixed(0)}% WR, ${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}% P&L`);
    });

    console.log('\n' + '═'.repeat(70));
}

generateReport()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
