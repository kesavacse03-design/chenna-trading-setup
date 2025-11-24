const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDataAvailability() {
    console.log('Checking historical data availability by category...\n');

    const categories = await prisma.category.findMany({
        include: {
            stocks: {
                include: { stock: true },
                orderBy: { addedDate: 'asc' }
            }
        }
    });

    for (const cat of categories) {
        if (cat.stocks.length === 0) continue;

        const oldest = cat.stocks[0].addedDate;
        const days = Math.floor((new Date() - oldest) / (1000 * 60 * 60 * 24));

        const ready = days >= 50 ? '✅' : '❌';

        console.log(`${ready} ${cat.name}:`);
        console.log(`   Stocks: ${cat.stocks.length}`);
        console.log(`   Oldest: ${oldest.toISOString().split('T')[0]} (${days} days ago)`);
        console.log(`   Status: ${days >= 50 ? 'READY for backtest' : `Need ${50 - days} more days`}\n`);
    }

    await prisma.$disconnect();
}

checkDataAvailability();
