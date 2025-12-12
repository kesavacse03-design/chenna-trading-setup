const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixV1() {
    console.log('=== GUNSHOT FIX: DELETE OLD V1 & FORCE FRESH PROMOTE ===\n');

    const categoryKey = 'DOWNSIDE_LOM_SWING';

    // 1. Get category
    const category = await prisma.category.findUnique({
        where: { key: categoryKey }
    });

    if (!category) {
        console.log('❌ Category not found');
        await prisma.$disconnect();
        return;
    }

    console.log(`✅ Category found: ${category.name} (id: ${category.id})`);

    // 2. Delete ALL old V1 strategies for this category
    console.log('\n🗑️  Deleting old V1 strategies...');
    const deleted = await prisma.strategy.deleteMany({
        where: {
            categoryId: category.id,
            version: 'V1'
        }
    });

    console.log(`✅ Deleted ${deleted.count} old V1 strategy(ies)`);

    // 3. Get latest Labs run
    console.log('\n📊 Getting latest Labs run...');
    const latestLabsRun = await prisma.labsRun.findFirst({
        where: { categoryKey: categoryKey },
        orderBy: { createdAt: 'desc' }
    });

    if (!latestLabsRun) {
        console.log('❌ No Labs run found! Run Time-Travel Labs first.');
        await prisma.$disconnect();
        return;
    }

    console.log(`✅ Found Labs run: ${latestLabsRun.ttVersion}`);
    console.log(`   Accuracy: ${(latestLabsRun.accuracy * 100).toFixed(1)}%`);
    console.log(`   Strategy Params:`, JSON.stringify(latestLabsRun.strategyParams, null, 2));

    // 4. Create fresh V1 with Labs data
    console.log('\n✨ Creating fresh V1 strategy from Labs...');
    const newV1 = await prisma.strategy.create({
        data: {
            categoryId: category.id,
            version: 'V1',
            promoted: true,
            description: `Promoted from ${latestLabsRun.ttVersion} - ${(latestLabsRun.accuracy * 100).toFixed(1)}% accuracy`,
            rules: latestLabsRun.entryConditions,
            params: {
                ...latestLabsRun.exitConditions,
                strategyParams: latestLabsRun.strategyParams  // ✅ CRITICAL: Labs parameters
            },
            metrics: latestLabsRun.performanceMetrics
        }
    });

    console.log('✅ V1 Strategy Created!');
    console.log('   ID:', newV1.id);
    console.log('   Version:', newV1.version);
    console.log('   Description:', newV1.description);
    console.log('   Params:', JSON.stringify(newV1.params, null, 2));
    console.log('   Metrics:', JSON.stringify(newV1.metrics, null, 2));

    // 5. Mark Labs run as promoted
    await prisma.labsRun.update({
        where: { id: latestLabsRun.id },
        data: { promotedToVersionId: newV1.id }
    });

    console.log('\n🎯 GUNSHOT FIX COMPLETE!');
    console.log('   Now refresh browser and open Strategy Workbench');
    console.log('   Trading Rules should show Labs strategy!');

    await prisma.$disconnect();
}

fixV1().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
