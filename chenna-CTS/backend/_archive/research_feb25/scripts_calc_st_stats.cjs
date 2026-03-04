const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const runs = await prisma.backtestRun.findMany({
        where: { strategyVersion: 'V5_Institutional', categoryKey: 'SHORT_TERM_SWING_BO_UP' },
        orderBy: { createdAt: 'desc' },
        take: 1
    });
    if (!runs.length) return;
    const runId = runs[0].id;

    const trades = await prisma.backtestTrade.findMany({
        where: { backtestRunId: runId }
    });

    let w = 0; let l = 0;
    let pnl = 0;
    for (const t of trades) {
        if (t.pnl > 0) w++; else l++;
        pnl += (t.pnl || 0);
    }
    console.log("=== ST_SWING_BO_UP (Institutional Upgrade) ===");
    console.log("Total Trades:", trades.length);
    console.log("Win Rate:", trades.length ? ((w / trades.length) * 100).toFixed(1) : 0, '%');
    console.log("PnL: ₹", pnl.toFixed(0));

    // Also get LT_SWING
    const runsLT = await prisma.backtestRun.findMany({
        where: { strategyVersion: 'V5_Institutional', categoryKey: 'LONG_TERM_SWING_BO_UP' },
        orderBy: { createdAt: 'desc' },
        take: 1
    });
    if (runsLT.length) {
        const tradesLT = await prisma.backtestTrade.findMany({
            where: { backtestRunId: runsLT[0].id }
        });
        w = 0; l = 0; pnl = 0;
        for (const t of tradesLT) { if (t.pnl > 0) w++; else l++; pnl += (t.pnl || 0); }
        console.log("\n=== LT_SWING_BO_UP (Institutional Upgrade) ===");
        console.log("Total Trades:", tradesLT.length);
        console.log("Win Rate:", tradesLT.length ? ((w / tradesLT.length) * 100).toFixed(1) : 0, '%');
        console.log("PnL: ₹", pnl.toFixed(0));
    }
}
run().catch(console.error).finally(() => prisma.$disconnect());
