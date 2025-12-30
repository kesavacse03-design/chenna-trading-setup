// Full System Audit Script
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ALL_CATEGORIES = [
    'DOWNSIDE_LOM_INTRA', 'UPSIDE_LOM_INTRA', 'DAILY_CONTRACTION', 'PRE_MARKET',
    'DOWNSIDE_LOM_SWING', 'UPSIDE_LOM_SWING', 'MULTI_RESISTANCE_BO', 'MULTI_SUPPORT_BO',
    'SHORT_TERM_SWING_BO_UP', 'SHORT_TERM_SWING_BO_DOWN', 'LONG_TERM_SWING_BO_UP', 'LONG_TERM_SWING_BO_DOWN',
    'HIGH_POWERED_STOCKS', 'INTRADAY_BOOST'
];

async function auditSystem() {
    console.log('\n========================================');
    console.log('    TRADING SYSTEM FULL AUDIT');
    console.log('========================================\n');

    const results = {};

    // 1. Check stocks per category
    console.log('📊 STOCKS PER CATEGORY:');
    const stockCounts = await prisma.stockCategory.groupBy({
        by: ['categoryId'],
        _count: true
    });
    const categories = await prisma.category.findMany();
    const catMap = {};
    categories.forEach(c => catMap[c.id] = c.key);

    const stocksByCat = {};
    stockCounts.forEach(sc => {
        const key = catMap[sc.categoryId];
        if (key) stocksByCat[key] = sc._count;
    });

    ALL_CATEGORIES.forEach(cat => {
        const count = stocksByCat[cat] || 0;
        console.log(`  ${count > 0 ? '✅' : '❌'} ${cat}: ${count}`);
        results[cat] = { stocks: count };
    });

    // 2. Check Labs runs
    console.log('\n🔬 LABS (TIME TRAVEL) RUNS:');
    const labsRuns = await prisma.labsRun.groupBy({
        by: ['categoryKey'],
        _count: true
    });
    const labsByCat = {};
    labsRuns.forEach(lr => labsByCat[lr.categoryKey] = lr._count);

    ALL_CATEGORIES.forEach(cat => {
        const count = labsByCat[cat] || 0;
        console.log(`  ${count > 0 ? '✅' : '❌'} ${cat}: ${count} runs`);
        results[cat].labsRuns = count;
    });

    // 3. Check Strategy Versions
    console.log('\n📈 STRATEGY VERSIONS:');
    const strategies = await prisma.strategyVersion.groupBy({
        by: ['categoryKey'],
        _count: true
    });
    const stratByCat = {};
    strategies.forEach(s => stratByCat[s.categoryKey] = s._count);

    ALL_CATEGORIES.forEach(cat => {
        const count = stratByCat[cat] || 0;
        console.log(`  ${count > 0 ? '✅' : '❌'} ${cat}: ${count} versions`);
        results[cat].strategies = count;
    });

    // 4. Check Signals
    console.log('\n🎯 LIVE SIGNALS:');
    const signals = await prisma.signal.groupBy({
        by: ['categoryKey'],
        _count: true
    });
    const sigByCat = {};
    signals.forEach(s => sigByCat[s.categoryKey] = s._count);

    ALL_CATEGORIES.forEach(cat => {
        const count = sigByCat[cat] || 0;
        console.log(`  ${count > 0 ? '✅' : '❌'} ${cat}: ${count} signals`);
        results[cat].signals = count;
    });

    // 5. Check Backtest Results
    console.log('\n🧪 BACKTEST RESULTS:');
    const backtests = await prisma.backtestResult.groupBy({
        by: ['categoryId'],
        _count: true
    });
    const btByCat = {};
    backtests.forEach(bt => {
        const key = catMap[bt.categoryId];
        if (key) btByCat[key] = bt._count;
    });

    ALL_CATEGORIES.forEach(cat => {
        const count = btByCat[cat] || 0;
        console.log(`  ${count > 0 ? '✅' : '❌'} ${cat}: ${count} results`);
        results[cat].backtests = count;
    });

    // 6. Summary
    console.log('\n========================================');
    console.log('    SUMMARY');
    console.log('========================================');

    let missingLabs = [];
    let missingStrategies = [];
    let missingSignals = [];

    ALL_CATEGORIES.forEach(cat => {
        if (results[cat].labsRuns === 0) missingLabs.push(cat);
        if (results[cat].strategies === 0) missingStrategies.push(cat);
        if (results[cat].signals === 0) missingSignals.push(cat);
    });

    console.log(`\n⚠️  Categories MISSING Labs runs (${missingLabs.length}/14):`);
    missingLabs.forEach(c => console.log(`    - ${c}`));

    console.log(`\n⚠️  Categories MISSING Strategy versions (${missingStrategies.length}/14):`);
    missingStrategies.forEach(c => console.log(`    - ${c}`));

    console.log(`\n⚠️  Categories MISSING Signals (${missingSignals.length}/14):`);
    missingSignals.forEach(c => console.log(`    - ${c}`));

    // 7. Check latest Labs run details for DOWNSIDE_LOM_SWING
    console.log('\n📋 LATEST LABS RUN (DOWNSIDE_LOM_SWING):');
    const latestLabs = await prisma.labsRun.findFirst({
        where: { categoryKey: 'DOWNSIDE_LOM_SWING' },
        orderBy: { createdAt: 'desc' }
    });
    if (latestLabs) {
        console.log(`  Version: ${latestLabs.ttVersion}`);
        console.log(`  Accuracy: ${latestLabs.accuracy}%`);
        console.log(`  Trades Tested: ${latestLabs.tradesTested}`);
        console.log(`  Has Entry Conditions: ${!!latestLabs.entryConditions}`);
        console.log(`  Has Exit Conditions: ${!!latestLabs.exitConditions}`);
    } else {
        console.log('  No Labs runs found!');
    }

    await prisma.$disconnect();
    console.log('\n✅ Audit complete!\n');
}

auditSystem().catch(e => {
    console.error('Audit failed:', e);
    process.exit(1);
});
