/**
 * FIXED CSV Report Generator - V2.1 Strategy
 * 
 * Fixes:
 * 1. Added Timeframe column (1-minute data)
 * 2. Prevents duplicate entries for same stock+date
 * 3. Cleaner column ordering
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

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
    console.log('GENERATING FIXED V2.1 TRADE REPORT');
    console.log('═'.repeat(70));

    const allTrades = [];
    const seenTrades = new Set(); // Track unique trades to prevent duplicates

    const dates = [
        '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
        '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-16', '2026-01-19'
    ];

    for (const dateStr of dates) {
        console.log(`\nProcessing ${dateStr}...`);

        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const signals = await generateIntradaySignalsV21('INTRADAY_BOOST', date);
        console.log(`  Found ${signals.length} signals`);

        for (const signal of signals) {
            // Create unique key to prevent duplicates
            const tradeKey = `${dateStr}-${signal.symbol}-${signal.entryTime}`;

            if (seenTrades.has(tradeKey)) {
                console.log(`  DUPLICATE SKIPPED: ${tradeKey}`);
                continue;
            }
            seenTrades.add(tradeKey);

            const trade = await simulateIntradayTradeV21(signal, date);

            // Get candle data for verification
            const candles = await getRawCandles(signal.symbol, dateStr);
            const entryCandle = candles.find(c => c.timestamp.split('T')[1].substring(0, 5) === signal.entryTime);
            const exitCandle = candles.find(c => c.timestamp.split('T')[1].substring(0, 5) === trade.exitTime);

            // Calculate trade duration
            const entryMins = parseInt(signal.entryTime.split(':')[0]) * 60 + parseInt(signal.entryTime.split(':')[1]);
            const exitMins = parseInt(trade.exitTime.split(':')[0]) * 60 + parseInt(trade.exitTime.split(':')[1]);
            const durationMins = exitMins - entryMins;

            allTrades.push({
                date: dateStr,
                symbol: signal.symbol,
                timeframe: '1-minute', // The candle timeframe we're using
                category: 'INTRADAY_BOOST',

                // Entry Details with full timestamp
                entryTime: signal.entryTime,
                entryTimestamp: entryCandle?.timestamp || `${dateStr}T${signal.entryTime}:00+05:30`,
                entryPrice: Number(signal.entryPrice).toFixed(2),
                entryCandleOHLC: entryCandle
                    ? `O:${entryCandle.open} H:${entryCandle.high} L:${entryCandle.low} C:${entryCandle.close}`
                    : 'N/A',
                entryVolume: entryCandle?.volume || 'N/A',

                // Target & Stop
                targetPrice: Number(signal.targetPrice).toFixed(2),
                stopPrice: Number(signal.stopPrice).toFixed(2),
                stopPercent: signal.stopPercent,
                targetPercent: '1.50',

                // Exit Details
                exitTime: trade.exitTime,
                exitTimestamp: exitCandle?.timestamp || `${dateStr}T${trade.exitTime}:00+05:30`,
                exitPrice: Number(trade.exitPrice).toFixed(2),
                exitReason: trade.exitReason,
                exitCandleOHLC: exitCandle
                    ? `O:${exitCandle.open} H:${exitCandle.high} L:${exitCandle.low} C:${exitCandle.close}`
                    : 'N/A',

                // Trade Duration
                durationMins: durationMins > 0 ? durationMins : 'Same Candle',

                // Result
                outcome: trade.outcome,
                pnlPercent: trade.pnlPercent,

                // Pattern Details
                orRange: signal.orRange,
                volumeRatio: signal.volumeRatio,
                filtersPassedCount: signal.enhancedChecks
            });
        }
    }

    // Sort by date and time
    allTrades.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.entryTime.localeCompare(b.entryTime);
    });

    console.log(`\n✅ Total unique trades: ${allTrades.length}`);

    // Generate CSV with proper headers
    const headers = [
        'Date',
        'Symbol',
        'Timeframe',
        'Category',
        'Entry_Time',
        'Entry_Timestamp',
        'Entry_Price',
        'Entry_Candle_OHLC',
        'Entry_Volume',
        'Target_Price',
        'Target_Pct',
        'Stop_Price',
        'Stop_Pct',
        'Exit_Time',
        'Exit_Timestamp',
        'Exit_Price',
        'Exit_Reason',
        'Exit_Candle_OHLC',
        'Duration_Mins',
        'Outcome',
        'PnL_Pct',
        'OR_Range_Pct',
        'Volume_Ratio',
        'Filters_Passed'
    ];

    let csv = headers.join(',') + '\n';

    for (const t of allTrades) {
        const row = [
            t.date,
            t.symbol,
            t.timeframe,
            t.category,
            t.entryTime,
            `"${t.entryTimestamp}"`,
            t.entryPrice,
            `"${t.entryCandleOHLC}"`,
            t.entryVolume,
            t.targetPrice,
            t.targetPercent,
            t.stopPrice,
            t.stopPercent,
            t.exitTime,
            `"${t.exitTimestamp}"`,
            t.exitPrice,
            t.exitReason,
            `"${t.exitCandleOHLC}"`,
            t.durationMins,
            t.outcome,
            t.pnlPercent,
            t.orRange,
            t.volumeRatio,
            t.filtersPassedCount
        ];
        csv += row.join(',') + '\n';
    }

    // Save to accessible location
    const outputPath = path.join(__dirname, '..', '..', '..', 'V2_1_Trade_Report_FIXED.csv');
    fs.writeFileSync(outputPath, csv);
    console.log(`\n✅ Report saved to: ${outputPath}`);

    // Summary
    const winners = allTrades.filter(t => t.outcome === 'WIN');
    const losers = allTrades.filter(t => t.outcome === 'LOSS');
    const winRate = (winners.length / allTrades.length * 100).toFixed(1);
    const totalPnL = allTrades.reduce((sum, t) => sum + parseFloat(t.pnlPercent), 0).toFixed(2);

    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Timeframe: 1-minute candles`);
    console.log(`Total Unique Trades: ${allTrades.length}`);
    console.log(`Winners: ${winners.length} (${winRate}%)`);
    console.log(`Losers: ${losers.length}`);
    console.log(`Total P&L: ${totalPnL}%`);

    // Check for any remaining duplicates (shouldn't be any)
    const uniqueCheck = new Set(allTrades.map(t => `${t.date}-${t.symbol}-${t.entryTime}`));
    if (uniqueCheck.size !== allTrades.length) {
        console.log(`\n⚠️ WARNING: Still found ${allTrades.length - uniqueCheck.size} duplicates!`);
    } else {
        console.log(`\n✅ No duplicates - each trade is unique`);
    }

    console.log('\n' + '═'.repeat(70));
}

generateReport()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
