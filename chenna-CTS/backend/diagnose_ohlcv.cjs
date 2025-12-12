const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    try {
        // Get sample entry with full data
        const sample = await prisma.ohlcvCache.findFirst({
            where: { interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!sample) {
            console.log('No OHLCV cache found!');
            return;
        }

        console.log('=== DETAILED CANDLE STRUCTURE ===');
        console.log('Symbol:', sample.symbol);

        let candles = sample.data;
        if (typeof candles === 'string') {
            candles = JSON.parse(candles);
        }

        if (Array.isArray(candles) && candles.length > 0) {
            console.log('Total candles:', candles.length);
            console.log('\nFirst candle (raw):');
            console.log(JSON.stringify(candles[0], null, 2));

            console.log('\nLast candle (raw):');
            console.log(JSON.stringify(candles[candles.length - 1], null, 2));

            // Check field names
            const c = candles[0];
            console.log('\n=== FIELD CHECK ===');
            console.log('Has open:', 'open' in c, '| value:', c.open);
            console.log('Has high:', 'high' in c, '| value:', c.high);
            console.log('Has low:', 'low' in c, '| value:', c.low);
            console.log('Has close:', 'close' in c, '| value:', c.close);
            console.log('Has volume:', 'volume' in c, '| value:', c.volume);
            console.log('Has timestamp:', 'timestamp' in c, '| value:', c.timestamp);

            // Check types
            console.log('\n=== TYPE CHECK ===');
            console.log('typeof open:', typeof c.open);
            console.log('typeof close:', typeof c.close);
            console.log('typeof volume:', typeof c.volume);
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
