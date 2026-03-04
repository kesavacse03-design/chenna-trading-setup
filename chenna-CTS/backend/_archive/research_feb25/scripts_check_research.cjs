const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const runs = await prisma.researchRun.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        console.log(`Found ${runs.length} Research runs:\n`);

        runs.forEach(r => {
            console.log('═'.repeat(50));
            console.log('Research Version:', r.researchVersion);
            console.log('Base TT Version:', r.baseTTVersion);
            console.log('Category:', r.categoryKey);
            console.log('Before Metrics:', JSON.stringify(r.beforeMetrics, null, 2).slice(0, 200));
            console.log('After Metrics:', JSON.stringify(r.afterMetrics, null, 2).slice(0, 200));
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

check();
