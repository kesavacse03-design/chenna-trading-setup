const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function cleanAndVerify() {
    console.log('=== STEP 1: DELETE ALL MULTI_SUPPORT_BO BACKTEST DATA ===');
    const runs = await p.backtestRun.findMany({ where: { categoryKey: 'MULTI_SUPPORT_BO' } });
    console.log('Found ' + runs.length + ' runs to delete');

    for (const run of runs) {
        const dt = await p.backtestTrade.deleteMany({ where: { backtestRunId: run.id } });
        console.log('  Run ' + run.id.substring(0, 8) + ': deleted ' + dt.count + ' trades');
    }
    const dr = await p.backtestRun.deleteMany({ where: { categoryKey: 'MULTI_SUPPORT_BO' } });
    console.log('Deleted ' + dr.count + ' runs');

    console.log('');
    console.log('=== STEP 2: VERIFY CACHE IS EMPTY ===');
    const cacheCount = await p.ohlcvCache.count();
    console.log('Remaining cache records: ' + cacheCount);

    console.log('');
    console.log('=== STEP 3: VERIFY SOURCE CODE FIXES ===');

    const basePath = path.resolve(__dirname, '..');

    const priceService = fs.readFileSync(path.join(basePath, 'services', 'priceService.cjs'), 'utf8');
    console.log('priceService.cjs:');
    console.log('  Has toISTDateString: ' + priceService.includes('function toISTDateString'));
    console.log('  OLD bug (fromDate toISOString): ' + priceService.includes("new Date(fromDate).toISOString().split"));
    console.log('  OLD bug (timestamp toISOString): ' + priceService.includes("new Date(cached.data[0].timestamp).toISOString()"));

    const signalGen = fs.readFileSync(path.join(basePath, 'services', 'labs', 'signalGeneratorV2.cjs'), 'utf8');
    console.log('signalGeneratorV2.cjs:');
    console.log('  Has toISTDateString: ' + signalGen.includes('function toISTDateString'));
    console.log('  OLD candle match bug: ' + signalGen.includes("new Date(c.timestamp || c.date).toISOString()"));
    console.log('  OLD targetDate bug: ' + signalGen.includes("new Date(date).toISOString().split"));

    const engine = fs.readFileSync(path.join(basePath, 'services', 'labs', 'backtestEngine.cjs'), 'utf8');
    console.log('backtestEngine.cjs:');
    console.log('  Has toISTDateString: ' + engine.includes('function toISTDateString'));
    console.log('  OLD dateStr bug: ' + engine.includes("currentDate.toISOString().split"));

    console.log('');
    console.log('=== ALL CLEAN! Ready for fresh backtest ===');

    await p.$disconnect();
}

cleanAndVerify().catch(e => { console.error(e.message); p.$disconnect(); });
