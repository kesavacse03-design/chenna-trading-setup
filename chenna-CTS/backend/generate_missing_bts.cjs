const { runBacktest } = require('./services/labs/backtestEngine.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function go() {
    try {
        console.log('Starting Backtest Engine for LT_SWING_BO_UP...');
        const run = await prisma.backtestRun.create({
            data: {
                categoryKey: 'LONG_TERM_SWING_BO_UP',
                strategyVersion: 'V5',
                startDate: new Date('2025-06-01'),
                endDate: new Date('2026-02-23'),
                startingCapital: 100000,
                positionSizing: { type: "percent_risk", amount: 4 },
                executionMode: 'perfect',
                status: 'pending'
            }
        });
        await runBacktest(run.id);

        console.log('Starting Backtest Engine for SHORT_TERM_SWING_BO_DOWN...');
        const run2 = await prisma.backtestRun.create({
            data: {
                categoryKey: 'SHORT_TERM_SWING_BO_DOWN',
                strategyVersion: 'V5',
                startDate: new Date('2025-06-01'),
                endDate: new Date('2026-02-23'),
                startingCapital: 100000,
                positionSizing: { type: "percent_risk", amount: 4 },
                executionMode: 'perfect',
                status: 'pending'
            }
        });
        await runBacktest(run2.id);

        console.log('Finished. Data populated to DB.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
go();
