const { runBacktest } = require('../services/labs/backtestEngine.cjs');
const prisma = require('../lib/prisma.cjs');

(async () => {
    try {
        const run = await prisma.backtestRun.create({
            data: {
                categoryKey: 'SHORT_TERM_SWING_BO_DOWN',
                strategyVersion: 'V2',
                startDate: new Date('2025-10-01'),
                endDate: new Date('2026-02-19'),
                startingCapital: 100000,
                positionSizing: {},
                executionMode: 'perfect',
                status: 'pending'
            }
        });
        console.log('Created run:', run.id);
        const res = await runBacktest(run.id);
        console.log('Result:', res);
    } catch (e) {
        console.error('ERROR OCCURRED:', e);
    } finally {
        process.exit();
    }
})();
