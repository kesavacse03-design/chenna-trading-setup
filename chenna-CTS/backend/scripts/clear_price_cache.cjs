const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log('Clearing OhlcvCache table...');
    try {
        // Use raw query or deleteMany. 
        // OhlcvCache might be large, truncate is faster if supported, or deleteMany.
        // Prisma doesn't support TRUNCATE directly usually.
        const { count } = await prisma.ohlcvCache.deleteMany({});
        console.log(`Deleted ${count} cache entries.`);
    } catch (e) {
        console.error('Error clearing cache:', e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
