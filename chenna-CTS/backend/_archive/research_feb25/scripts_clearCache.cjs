const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearCache() {
    console.log('Clearing LUPIN 1minute cache...');
    const result = await prisma.ohlcvCache.deleteMany({
        where: {
            symbol: 'LUPIN',
            interval: '1minute'
        }
    });
    console.log(`Deleted ${result.count} entries.`);
    await prisma.$disconnect();
}

clearCache();
