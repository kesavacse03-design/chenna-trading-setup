const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLabsStrategy() {
    try {
        // Get latest Labs run
        const latestRun = await prisma.labsRun.findFirst({
            where: { categoryKey: 'DOWNSIDE_LOM_SWING' },
            orderBy: { createdAt: 'desc' }
        });

        if (!latestRun) {
            console.log('❌ No Labs run found for DOWNSIDE_LOM_SWING');
            return;
        }

        console.log('\n=== LATEST LABS RUN ===');
        console.log('TT Version:', latestRun.ttVersion);
        console.log('Accuracy:', latestRun.accuracy);
        console.log('Created:', latestRun.createdAt);
        console.log('\n=== STRATEGY PARAMS ===');
        console.log('Has strategyParams:', !!latestRun.strategyParams);

        if (latestRun.strategyParams) {
            console.log('Strategy Params:', JSON.stringify(latestRun.strategyParams, null, 2));
        } else {
            console.log('⚠️  strategyParams is NULL or missing!');
        }

        console.log('\n=== RECOMMENDED LOGIC ===');
        if (latestRun.recommendedLogic) {
            console.log('Entry:', JSON.stringify(latestRun.recommendedLogic.entry, null, 2));
        }

        // Check V1 strategy
        const category = await prisma.category.findUnique({
            where: { key: 'DOWNSIDE_LOM_SWING' }
        });

        if (category) {
            const v1Strategy = await prisma.strategy.findFirst({
                where: {
                    categoryId: category.id,
                    version: 'V1'
                }
            });

            console.log('\n=== V1 STRATEGY ===');
            if (v1Strategy) {
                console.log('Description:', v1Strategy.description);
                console.log('Has params:', !!v1Strategy.params);
                if (v1Strategy.params) {
                    console.log('Params:', JSON.stringify(v1Strategy.params, null, 2));
                }
            } else {
                console.log('❌ No V1 strategy found');
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkLabsStrategy();
