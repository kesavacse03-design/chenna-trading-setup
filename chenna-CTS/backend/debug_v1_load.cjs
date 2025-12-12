const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugV1() {
    console.log('=== DEBUGGING V1 STRATEGY LOAD ===\n');

    const categoryKey = 'DOWNSIDE_LOM_SWING';

    // 1. Check if category exists
    console.log('1. Checking category...');
    const category = await prisma.category.findUnique({
        where: { key: categoryKey }
    });
    console.log('Category:', category ? `✅ Found (id: ${category.id})` : '❌ Not found');

    if (!category) {
        await prisma.$disconnect();
        return;
    }

    // 2. Check for V1 strategy using the EXACT query from server.cjs
    console.log('\n2. Checking V1 strategy (query from server.cjs)...');
    const v1Strategy = await prisma.strategy.findFirst({
        where: {
            category: { key: categoryKey },
            promoted: true,
            version: 'V1'
        },
        include: {
            category: true
        }
    });

    console.log('V1 Strategy:', v1Strategy ? '✅ FOUND!' : '❌ NOT FOUND');

    if (v1Strategy) {
        console.log('\nV1 Strategy Details:');
        console.log('  ID:', v1Strategy.id);
        console.log('  Version:', v1Strategy.version);
        console.log('  Description:', v1Strategy.description);
        console.log('  Promoted:', v1Strategy.promoted);
        console.log('  Params:', JSON.stringify(v1Strategy.params, null, 2));
        console.log('  Metrics:', JSON.stringify(v1Strategy.metrics, null, 2));
    } else {
        // 3. Check ALL strategies for this category
        console.log('\n3. Checking ALL strategies for this category...');
        const allStrategies = await prisma.strategy.findMany({
            where: {
                categoryId: category.id
            }
        });

        console.log(`Found ${allStrategies.length} total strategies:`);
        allStrategies.forEach(s => {
            console.log(`  - ID: ${s.id}, Version: ${s.version}, Promoted: ${s.promoted}`);
        });
    }

    await prisma.$disconnect();
}

debugV1().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
