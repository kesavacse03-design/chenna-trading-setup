const { backtestIntradayV21 } = require('../services/labs/intradayStrategyV2_1.cjs');
const prisma = require('../lib/prisma.cjs');

async function compareModes() {
    const category = 'INTRADAY_BOOST';
    const startDate = '2026-02-05';
    const endDate = '2026-02-05';

    console.log('--- COMPARING STRATEGY MODES ---');
    console.log(`Date: ${startDate}`);

    console.log('\n\n>>>>> RUNNING STRICT MODE (Original) <<<<<');
    const strictResults = await backtestIntradayV21(category, startDate, endDate, 'STRICT');

    console.log('\n\n>>>>> RUNNING RELAXED MODE (Proposed) <<<<<');
    const relaxedResults = await backtestIntradayV21(category, startDate, endDate, 'RELAXED');

    console.log('\n\n========================================');
    console.log('COMPARISON SUMMARY');
    console.log('========================================');
    console.log(`STRICT:  ${strictResults.totalTrades} signals, Win Rate: ${strictResults.winRate.toFixed(1)}%, P&L: ${strictResults.totalPnL.toFixed(2)}%`);
    console.log(`RELAXED: ${relaxedResults.totalTrades} signals, Win Rate: ${relaxedResults.winRate.toFixed(1)}%, P&L: ${relaxedResults.totalPnL.toFixed(2)}%`);

    // Check specifically for TCS
    const tcsStrict = strictResults.trades.find(t => t.symbol === 'TCS');
    const tcsRelaxed = relaxedResults.trades.find(t => t.symbol === 'TCS');

    console.log('\nTCS Signal Check:');
    console.log(`  STRICT: ${tcsStrict ? 'FOUND' : 'MISSED'}`);
    console.log(`  RELAXED: ${tcsRelaxed ? 'FOUND' : 'MISSED'}`);
}

compareModes()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
