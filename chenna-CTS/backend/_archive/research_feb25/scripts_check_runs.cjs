const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
    // Get all MULTI_SUPPORT_BO backtest runs
    const runs = await p.backtestRun.findMany({
        where: { categoryKey: 'MULTI_SUPPORT_BO' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
            id: true,
            createdAt: true,
            status: true,
            executionMode: true,
            startDate: true,
            endDate: true,
            _count: { select: { trades: true } }
        }
    });

    console.log('=== MULTI_SUPPORT_BO BACKTEST RUNS ===');
    console.log('');
    for (const r of runs) {
        const created = r.createdAt ? new Date(r.createdAt).toISOString() : 'null';
        console.log('Run: ' + r.id.substring(0, 8) + '...');
        console.log('  Created: ' + created);
        console.log('  Status: ' + r.status);
        console.log('  Mode: ' + r.executionMode);
        console.log('  Period: ' + (r.startDate ? new Date(r.startDate).toISOString().split('T')[0] : '?') + ' to ' + (r.endDate ? new Date(r.endDate).toISOString().split('T')[0] : '?'));
        console.log('  Trades: ' + r._count.trades);
        console.log('');
    }

    // Check a specific TITAN trade from the LATEST run
    const latestRun = runs[0];
    if (latestRun) {
        const titanTrade = await p.backtestTrade.findFirst({
            where: { backtestRunId: latestRun.id, symbol: 'TITAN' }
        });
        if (titanTrade) {
            console.log('=== TITAN FROM LATEST RUN (' + latestRun.id.substring(0, 8) + ') ===');
            console.log('  signalDate: ' + titanTrade.signalDate);
            console.log('  entryDate:  ' + titanTrade.entryDate);
            console.log('  entryPrice: ' + titanTrade.entryPrice);
            console.log('  exitPrice:  ' + titanTrade.exitPrice);
            console.log('  exitReason: ' + titanTrade.exitReason);
            console.log('  pnlPercent: ' + titanTrade.pnlPercent);
            console.log('  outcome:    ' + titanTrade.outcome);
            console.log('  targetPrice:' + titanTrade.targetPrice);
            console.log('  stopPrice:  ' + titanTrade.stopPrice);
        } else {
            console.log('No TITAN trade in latest run');
        }
    }

    await p.$disconnect();
}

check().catch(e => { console.error(e); p.$disconnect(); });
