const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
    try {
        // Check V1 strategy
        const strategy = await prisma.strategy.findFirst({
            where: {
                version: 'V1',
                category: { key: 'DOWNSIDE_LOM_SWING' }
            },
            include: { category: true }
        });

        console.log('=== V1 Strategy in Database ===');
        if (strategy) {
            console.log('Description:', strategy.description);
            console.log('Params:', JSON.stringify(strategy.params, null, 2));
            console.log('Rules:', JSON.stringify(strategy.rules, null, 2));
            console.log('Metrics:', JSON.stringify(strategy.metrics, null, 2));
        } else {
            console.log('No V1 strategy found');
        }

        // Check latest Labs run
        console.log('\n=== Latest Labs Run ===');
        const labsRun = await prisma.labsRun.findFirst({
            where: { categoryKey: 'DOWNSIDE_LOM_SWING' },
            orderBy: { createdAt: 'desc' }
        });

        if (labsRun) {
            console.log('TT Version:', labsRun.ttVersion);
            console.log('Accuracy:', labsRun.accuracy);
            console.log('Strategy Params:', JSON.stringify(labsRun.strategyParams, null, 2));
            console.log('Promoted to V1?:', labsRun.promotedToVersionId ? 'YES' : 'NO');
        } else {
            console.log('No Labs run found');
        }

        await prisma.$disconnect();
    } catch (error) {
        console.error('Error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
})();
