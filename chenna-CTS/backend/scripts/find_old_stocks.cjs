const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findOldStocks() {
    console.log('Searching for stocks added before October 2025...\n');

    const oldStocks = await prisma.stockCategory.findMany({
        where: {
            addedDate: {
                lt: new Date('2025-10-01')
            }
        },
        include: {
            stock: true,
            category: true
        },
        orderBy: {
            addedDate: 'asc'
        }
    });

    console.log(`Found ${oldStocks.length} stocks added before Oct 2025\n`);

    if (oldStocks.length > 0) {
        console.log('First 20 old stocks:');
        oldStocks.slice(0, 20).forEach(sc => {
            console.log(`  ${sc.stock.symbol} | ${sc.category.name} (${sc.category.key}) | ${sc.addedDate.toISOString().split('T')[0]}`);
        });

        console.log('\nCategory distribution:');
        const catCount = {};
        oldStocks.forEach(sc => {
            const key = sc.category.key || sc.category.name;
            catCount[key] = (catCount[key] || 0) + 1;
        });
        Object.entries(catCount).forEach(([cat, count]) => {
            console.log(`  ${cat}: ${count} stocks`);
        });
    } else {
        console.log('❌ No old stocks found in database!');
        console.log('\nThis means:');
        console.log('1. Those August stocks in Prisma Studio screenshot are from a different database');
        console.log('2. OR they were deleted');
        console.log('3. OR you\'re looking at a different environment');
    }

    await prisma.$disconnect();
}

findOldStocks();
