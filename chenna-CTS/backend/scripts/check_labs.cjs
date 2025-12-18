const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const runs = await prisma.labsRun.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        console.log(`Found ${runs.length} Labs runs:\n`);

        runs.forEach(r => {
            console.log('═'.repeat(50));
            console.log('Version:', r.ttVersion);
            console.log('Category:', r.categoryKey);
            console.log('Accuracy:', (r.accuracy * 100).toFixed(1) + '%');
            console.log('Trades:', r.tradesTested);
            console.log('Entry Conditions:', JSON.stringify(r.entryConditions, null, 2).slice(0, 400));
            console.log('Exit Conditions:', JSON.stringify(r.exitConditions, null, 2).slice(0, 300));
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

check();
