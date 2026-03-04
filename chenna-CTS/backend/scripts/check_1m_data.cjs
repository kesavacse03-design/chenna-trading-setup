const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check1MinData() {
    console.log("Checking 1minute OhlcvCache for INTRADAY_BOOST stocks on March 2...");
    const sample = await prisma.ohlcvCache.findFirst({
        where: {
            interval: '1minute'
        },
        orderBy: { fromDate: 'desc' },
        select: { symbol: true, interval: true, fromDate: true, toDate: true }
    });

    console.log('Sample 1minute cache:', sample);
    await prisma.$disconnect();
}

check1MinData().catch(console.error);
