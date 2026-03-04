const prisma = require('../lib/prisma.cjs');

async function clearCache() {
    console.log('Clearing OHLCV Cache...');
    const result = await prisma.ohlcvCache.deleteMany({});
    console.log(`Deleted ${result.count} cache entries.`);
}

clearCache()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
