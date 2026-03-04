const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const count = await prisma.ohlcvCache.count({
            where: { interval: '1minute' }
        });

        console.log(`Checking 1-minute data in DB...`);
        console.log(`Total 1-minute cache entries: ${count}`);

        if (count > 0) {
            const sample = await prisma.ohlcvCache.findFirst({
                where: { interval: '1minute' }
            });
            console.log(`Sample Symbol: ${sample.symbol}, From: ${sample.fromDate.toISOString()}, To: ${sample.toDate.toISOString()}`);
        } else {
            console.log('No 1-minute data found.');
        }

        await prisma.$disconnect();
    } catch (e) {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    }
}

check();
