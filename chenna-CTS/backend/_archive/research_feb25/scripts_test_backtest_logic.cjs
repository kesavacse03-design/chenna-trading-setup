const { backtestIntradayV21 } = require('../services/labs/intradayStrategyV2_1.cjs');
const prisma = require('../lib/prisma.cjs');

async function testBacktest() {
    console.log('--- TESTING BACKTEST LOGIC (Mixed Dates) ---');
    // 1. Recent Date (Should run detailed 1-min backtest)
    // 2. Old Date (Should skip or warn)

    // Recent: 2026-02-04 (Yesterday)
    // Old: 2026-01-09 (Date with 5 stocks found in audit)

    await backtestIntradayV21('INTRADAY_BOOST', '2026-01-09', '2026-01-10');
    console.log('\n-----------------------------------\n');
    await backtestIntradayV21('INTRADAY_BOOST', '2026-02-04', '2026-02-04');
}

testBacktest()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
