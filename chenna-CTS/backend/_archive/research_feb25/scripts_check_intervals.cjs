// Check available data intervals in cache
const { PrismaClient } = require('@prisma/client');

async function checkIntervals() {
    const prisma = new PrismaClient();

    try {
        // Check distinct intervals
        const intervals = await prisma.ohlcvCache.groupBy({
            by: ['interval'],
            _count: { _all: true }
        });

        console.log('Available intervals in OhlcvCache:');
        intervals.forEach(i => {
            console.log(`  ${i.interval}: ${i._count._all} entries`);
        });

        // Check for 1-minute data
        const minuteData = await prisma.ohlcvCache.findFirst({
            where: { interval: '1minute' }
        });

        console.log('\n1-minute data available:', minuteData ? 'YES' : 'NO');

        if (minuteData) {
            console.log('Sample 1-min symbol:', minuteData.symbol);
        }

        // Check what interval most PRE_MARKET stocks have
        const sample = await prisma.ohlcvCache.findMany({
            where: {
                symbol: { in: ['NTPC', 'ITC', 'TATASTEEL', 'NESTLEIND'] }
            },
            select: { symbol: true, interval: true }
        });

        console.log('\nSample PRE_MARKET stocks intervals:');
        sample.forEach(s => {
            console.log(`  ${s.symbol}: ${s.interval}`);
        });

    } finally {
        await prisma.$disconnect();
    }
}

checkIntervals().catch(console.error);
