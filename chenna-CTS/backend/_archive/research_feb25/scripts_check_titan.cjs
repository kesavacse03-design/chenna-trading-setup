const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
    // 1. Check TITAN stock table lastPrice
    const titan = await p.stock.findUnique({ where: { symbol: 'TITAN' } });
    console.log('=== TITAN STOCK TABLE ===');
    console.log('lastPrice:', titan?.lastPrice);
    console.log('close:', titan?.close);
    console.log('updatedAt:', titan?.updatedAt);
    console.log('');

    // 2. Check what the backtestTrade table has for TITAN in recent runs
    const trades = await p.backtestTrade.findMany({
        where: { symbol: 'TITAN' },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log('=== RECENT TITAN BACKTEST TRADES ===');
    for (const t of trades) {
        console.log('Trade #' + t.tradeNumber + ':');
        console.log('  signalDate: ' + t.signalDate);
        console.log('  entryDate:  ' + t.entryDate);
        console.log('  entryPrice: ' + t.entryPrice);
        console.log('  exitPrice:  ' + t.exitPrice);
        console.log('  exitReason: ' + t.exitReason);
        console.log('  pnlPercent: ' + t.pnlPercent);
        console.log('  outcome:    ' + t.outcome);
        console.log('  runId:      ' + t.backtestRunId);
        console.log('');
    }

    // 3. Check OHLCV cache date ranges for TITAN
    const caches = await p.ohlcvCache.findMany({
        where: { symbol: 'TITAN', interval: 'day' },
        select: { fromDate: true, toDate: true, source: true }
    });
    console.log('=== TITAN OHLCV CACHE RANGES ===');
    console.log('Total caches:', caches.length);
    for (const c of caches) {
        const from = c.fromDate ? new Date(c.fromDate).toISOString().split('T')[0] : 'null';
        const to = c.toDate ? new Date(c.toDate).toISOString().split('T')[0] : 'null';
        console.log('  ' + from + ' to ' + to + ' (source: ' + (c.source || 'unknown') + ')');
    }

    await p.$disconnect();
}

check().catch(e => { console.error(e); p.$disconnect(); });
