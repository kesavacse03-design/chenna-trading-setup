const prisma = require('../lib/prisma.cjs');

async function checkCache() {
    try {
        console.log('Checking OHLCV Cache for 1-minute data in Dec 2025...');

        // Count 1minute entries where date is in Dec 2025
        // Note: OhlcvCache uses fromDate/toDate
        const entries = await prisma.ohlcvCache.findMany({
            where: {
                interval: '1minute',
                fromDate: {
                    gte: new Date('2025-12-01'),
                    lte: new Date('2025-12-31')
                }
            },
            take: 10,
            select: {
                symbol: true,
                fromDate: true,
                data: true // Just to check length
            }
        });

        const count = await prisma.ohlcvCache.count({
            where: {
                interval: '1minute',
                fromDate: {
                    gte: new Date('2025-12-01'),
                    lte: new Date('2025-12-31')
                }
            }
        });

        console.log(`Total Cached Days found: ${count}`);

        if (entries.length > 0) {
            console.log('Sample Entries:');
            entries.forEach(e => {
                const dataPoints = Array.isArray(e.data) ? e.data.length : 'Unknown';
                console.log(`- ${e.symbol} on ${e.fromDate.toISOString().split('T')[0]}: ${dataPoints} candles`);
            });
        } else {
            console.log('No 1-minute data found for Dec 2025.');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkCache();
