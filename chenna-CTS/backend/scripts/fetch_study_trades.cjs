const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const p = new PrismaClient();

async function run() {
    console.log("Fetching V5 Positions...");
    const pos = await p.v5Position.findMany({
        where: { outcome: { not: null } },
        include: { signal: true }
    });
    console.log(`Found ${pos.length} closed V5 positions directly from DB.`);

    console.log("Fetching Trades...");
    const tr = await p.trade.findMany({
        where: { status: { in: ['TARGET_HIT', 'SL_HIT', 'TIME_EXPIRED', 'EXPIRED'] } }
    });
    console.log(`Found ${tr.length} closed legacy Trades.`);

    console.log("Fetching Backtest Runs...");
    const runs = await p.backtestRun.findMany({
        include: { trades: true }
    });
    for (const r of runs) {
        console.log(`BacktestRun ${r.id} (${r.categoryKey}): ${r.trades.length} trades`);
    }

    fs.writeFileSync('db_trades_dump.json', JSON.stringify({
        positions: pos,
        legacyTrades: tr,
        runs: runs
    }, null, 2));

    process.exit(0);
}

run().catch(console.error).finally(() => p.$disconnect());
