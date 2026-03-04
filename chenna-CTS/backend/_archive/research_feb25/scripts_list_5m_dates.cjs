const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listDates() {
    const sample = await prisma.ohlcvCache.findFirst({
        where: { interval: '5m' }
    });

    if (!sample || !sample.data) {
        console.log('No 5m data found');
        return;
    }

    console.log('Stock:', sample.symbol);
    console.log('Total candles:', sample.data.length);

    const dates = new Set();
    sample.data.forEach(c => {
        if (c.timestamp) {
            dates.add(c.timestamp.split('T')[0]);
        }
    });

    const sortedDates = [...dates].sort();
    console.log('\nUnique dates in data:', sortedDates.length);
    console.log('\nDates available:');
    sortedDates.forEach(d => console.log('  ', d));
}

listDates().finally(() => prisma.$disconnect());
