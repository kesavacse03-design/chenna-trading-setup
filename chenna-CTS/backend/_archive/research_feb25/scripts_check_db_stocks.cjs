const prisma = require('../lib/prisma.cjs');

async function checkStocks() {
    try {
        console.log('Prisma loaded:', !!prisma);
        if (!prisma) {
            console.error('Prisma client is null');
            return;
        }

        console.log('Checking INTRADAY_BOOST stocks...');
        // Verify model names if needed
        // console.log('Models:', Object.keys(prisma));

        const entries = await prisma.stockCategory.findMany({
            where: { category: { key: 'INTRADAY_BOOST' } },
            select: {
                createdAt: true,
                stock: { select: { symbol: true } }
            }
        });

        console.log(`Total entries: ${entries.length}`);

        const byDate = {};
        entries.forEach(e => {
            const date = e.createdAt.toISOString().split('T')[0];
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(e.stock.symbol);
        });

        console.log('\nStocks by Date:');
        Object.keys(byDate).sort().forEach(date => {
            console.log(`${date}: ${byDate[date].length} stocks`);
            console.log(`   Sample: ${byDate[date].slice(0, 5).join(', ')}`);
        });

    } catch (e) {
        console.error('Error in checkStocks:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkStocks();
