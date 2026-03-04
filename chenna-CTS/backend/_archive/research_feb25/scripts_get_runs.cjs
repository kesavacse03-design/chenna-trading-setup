const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    try {
        const runs = await p.backtestRun.findMany({
            where: { categoryKey: 'MULTI_SUPPORT_BO' },
            orderBy: { createdAt: 'desc' },
            take: 3
        });

        console.log('--- RECENT RUNS ---');
        runs.forEach(r => console.log(`${r.id.substring(0, 8)} | ${r.status} | Trades: ${r.totalTrades} | WR: ${r.winRate}% | Ret: ${r.returnPercent}%`));

        const latestComplete = runs.find(r => r.status === 'complete');
        if (latestComplete) {
            console.log(`\n--- TRADES FOR ${latestComplete.id.substring(0, 8)} ---`);
            const trades = await p.backtestTrade.findMany({
                where: { backtestRunId: latestComplete.id },
                orderBy: { signalDate: 'asc' }
            });
            trades.forEach(t => {
                const sig = t.signalDate.toISOString().split('T')[0];
                const ext = t.exitDate ? t.exitDate.toISOString().split('T')[0] : 'OPEN';
                console.log(`${t.symbol.padEnd(12)} | In: ${sig} | Out: ${ext.padEnd(10)} | ${t.exitReason.padEnd(15)} | ${(t.pnlPercent > 0 ? '+' : '')}${t.pnlPercent.toFixed(2)}%`);
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        await p.$disconnect();
    }
})();
