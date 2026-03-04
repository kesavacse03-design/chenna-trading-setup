const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    const r = await p.backtestRun.findFirst({
        where: { categoryKey: 'MULTI_SUPPORT_BO', status: 'complete' },
        orderBy: { createdAt: 'desc' }
    });
    console.log('Run:', r.id.substring(0, 8));
    console.log('Period:', r.startDate.toISOString().split('T')[0], '->', r.endDate.toISOString().split('T')[0]);

    const t = await p.backtestTrade.findMany({
        where: { backtestRunId: r.id },
        orderBy: { signalDate: 'asc' }
    });
    console.log('Total trades:', t.length);

    const closed = t.filter(x => x.exitDate);
    const open = t.filter(x => !x.exitDate);
    const wins = closed.filter(x => x.pnlPercent > 0);
    console.log('Closed:', closed.length, '| Open:', open.length);
    console.log('Wins:', wins.length, 'WR:', closed.length > 0 ? (wins.length / closed.length * 100).toFixed(1) + '%' : 'N/A');
    console.log('');

    console.log('=== CLOSED TRADES ===');
    for (const x of closed) {
        const sig = x.signalDate.toISOString().split('T')[0];
        const exit = x.exitDate.toISOString().split('T')[0];
        console.log(`  ${x.symbol.padEnd(14)} ${sig} exit:${exit} ${x.exitReason.padEnd(12)} ${(x.pnlPercent >= 0 ? '+' : '') + x.pnlPercent.toFixed(2)}% held:${x.daysHeld}d`);
    }

    console.log('');
    console.log('=== OPEN TRADES ===');
    for (const x of open) {
        const sig = x.signalDate.toISOString().split('T')[0];
        console.log(`  ${x.symbol.padEnd(14)} ${sig} entry:${x.entryPrice.toFixed(0)} current PnL:${(x.pnlPercent >= 0 ? '+' : '') + x.pnlPercent.toFixed(2)}% held:${x.daysHeld}d`);
    }

    // Exit reason summary
    const reasons = {};
    for (const x of closed) {
        reasons[x.exitReason] = (reasons[x.exitReason] || 0) + 1;
    }
    console.log('');
    console.log('=== EXIT REASONS ===');
    for (const [r, c] of Object.entries(reasons)) console.log(`  ${r}: ${c}`);

    await p.$disconnect();
})();
