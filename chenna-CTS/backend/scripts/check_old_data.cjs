const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOldData() {
    console.log("Checking 1minute OhlcvCache near 2025-02-02...");
    const sample = await prisma.ohlcvCache.findFirst({
        where: {
            interval: '1minute',
            fromDate: { gte: new Date('2025-01-25T00:00:00.000Z'), lte: new Date('2025-02-15T00:00:00.000Z') }
        },
        orderBy: { fromDate: 'asc' },
        select: { symbol: true, interval: true, fromDate: true, toDate: true }
    });

    console.log('Sample 1minute cache around Feb 2 2025:', sample);
    await prisma.$disconnect();
}

checkOldData().catch(console.error);
