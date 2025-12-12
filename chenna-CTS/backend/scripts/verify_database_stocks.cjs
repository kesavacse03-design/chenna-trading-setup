const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabaseStocks() {
    try {
        console.log('\n=== CHECKING POSTGRESQL DATABASE ===\n');

        // Total stocks
        const totalStocks = await prisma.stock.count();
        console.log(`Total Stocks in Database: ${totalStocks}`);

        // Stocks by category
        console.log('\n=== STOCKS BY CATEGORY ===');
        const stocksByCategory = await prisma.stock.groupBy({
            by: ['categoryKey'],
            _count: {
                id: true
            },
            orderBy: {
                categoryKey: 'asc'
            }
        });

        stocksByCategory.forEach(cat => {
            console.log(`${cat.categoryKey}: ${cat._count.id} stocks`);
        });

        // Sample stocks
        console.log('\n=== SAMPLE STOCKS (First 5) ===');
        const sampleStocks = await prisma.stock.findMany({
            take: 5,
            select: {
                symbol: true,
                categoryKey: true,
                categoryRaw: true
            }
        });
        sampleStocks.forEach(s => {
            console.log(`${s.symbol} - ${s.categoryKey} (${s.categoryRaw})`);
        });

    } catch (error) {
        console.error('Database Error:', error.message);
        console.error('Full Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDatabaseStocks();
