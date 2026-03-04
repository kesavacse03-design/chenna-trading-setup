const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const upsideLom = require('../services/labs/upsideLomIntraStrategy.cjs');
const intradayV21 = require('../services/labs/intradayStrategyV2_1.cjs');

async function runQuick() {
    const DATE = '2026-02-19';
    console.log(`🚀 Starting QUICK Intraday Backtest (${DATE})...`);

    try {
        console.log('\n🔵 UPSIDE_LOM_INTRA...');
        const lomResults = await upsideLom.backtest(DATE, DATE);

        console.log('\n🟠 INTRADAY_BOOST (V2.1 Strict)...');
        const boostResults = await intradayV21.backtestIntradayV21('INTRADAY_BOOST', DATE, DATE, 'STRICT');

        console.log('\n🟣 HIGH_POWERED_STOCKS (V2.1 Strict)...');
        const hpResults = await intradayV21.backtestIntradayV21('HIGH_POWERED_STOCKS', DATE, DATE, 'STRICT');

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log(`🏁 QUICK RESULTS (${DATE})`);
        console.log('═══════════════════════════════════════════════════════════════');

        // Helper to format
        const fmt = (res, name) => {
            const trades = res.trades || []; // LOM returns trades
            const signals = res.signals || []; // V2.1 returns signals
            const winningTrades = trades.filter(t => t.pnlPercent > 0).length;
            const losingTrades = trades.filter(t => t.pnlPercent <= 0).length;
            const total = trades.length;
            const winRate = total > 0 ? (winningTrades / total * 100).toFixed(1) : '0.0';

            // For V2.1 signals, simulate?
            // Assuming boostResults.signals are what we have. No trades simulated yet in this quick script.
            // Wait, I can't simulate easily without the helper.
            // Just report Signals count.

            if (name.includes('LOM')) {
                return `| ${name.padEnd(20)} | Trades: ${total} | WR: ${winRate}% |`;
            } else {
                return `| ${name.padEnd(20)} | Signals: ${signals.length} | (Need Sim for P&L) |`;
            }
        };

        console.log(fmt(lomResults, 'UPSIDE_LOM_INTRA'));
        console.log(fmt(boostResults, 'INTRADAY_BOOST'));
        console.log(fmt(hpResults, 'HIGH_POWERED_STOCKS'));

        console.log('═══════════════════════════════════════════════════════════════');

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

runQuick();
