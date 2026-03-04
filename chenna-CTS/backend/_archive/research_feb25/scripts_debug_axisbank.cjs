const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    console.log('--- Checking DB Trades for AXISBANK & TATATECH & PETRONET ---');

    // Get the most recent backtest runs for SHORT_TERM_SWING_BO_UP
    const recentRuns = await p.backtestRun.findMany({
        where: { categoryKey: 'SHORT_TERM_SWING_BO_UP' },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    if (!recentRuns || recentRuns.length === 0) {
        console.log('No recent backtest runs found for SHORT_TERM_SWING_BO_UP');
        return process.exit(0);
    }

    // We'll check the latest run where it failed
    const latestRunId = recentRuns[0].id;
    console.log(`Checking latest run: ${latestRunId} (Created: ${recentRuns[0].createdAt})`);

    const trades = await p.backtestTrade.findMany({
        where: {
            backtestRunId: latestRunId,
            symbol: { in: ['AXISBANK', 'TATATECH', 'PETRONET'] }
        },
        orderBy: { tradeNumber: 'asc' }
    });

    if (trades.length === 0) {
        console.log('No trades found for these symbols in the latest run.');
    } else {
        trades.forEach(t => {
            console.log(`\nTrade #${t.tradeNumber} | ${t.symbol}`);
            console.log(`  SignalDate: ${t.signalDate ? t.signalDate.toISOString() : 'NULL'} (DB native)`);
            console.log(`  EntryDate:  ${t.entryDate ? t.entryDate.toISOString() : 'NULL'} (DB native)`);
            console.log(`  EntryPrice: ${t.entryPrice}`);
            console.log(`  ExitReason: ${t.exitReason}`);
        });
    }

    await p.$disconnect();
})();
