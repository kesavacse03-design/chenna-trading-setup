/**
 * Debug script to understand why V1 generates 0 signals
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
    const date = '2026-01-15';
    console.log('=== Debugging V1 Signal Generation ===\n');

    // 1. Get a sample stock with 5m data
    const sample = await prisma.ohlcvCache.findFirst({
        where: { interval: '5m' }
    });

    if (!sample) {
        console.log('NO 5m data found!');
        return;
    }

    console.log('Sample stock:', sample.symbol);
    console.log('From:', sample.fromDate);
    console.log('To:', sample.toDate);
    console.log('Candle count:', sample.data?.length || 0);

    // 2. Check candle structure
    if (sample.data && sample.data.length > 0) {
        console.log('\nFirst candle:', JSON.stringify(sample.data[0], null, 2));
        console.log('Last candle:', JSON.stringify(sample.data[sample.data.length - 1], null, 2));
    }

    // 3. Filter for target date
    const dateStr = date;
    const dateCandles = (sample.data || []).filter(c => {
        try {
            const candleDate = new Date(c.timestamp);
            const candleDateStr = candleDate.toISOString().split('T')[0];
            return candleDateStr === dateStr;
        } catch (e) {
            return false;
        }
    });

    console.log(`\nCandles for ${dateStr}:`, dateCandles.length);
    if (dateCandles.length > 0) {
        console.log('First on date:', JSON.stringify(dateCandles[0], null, 2));
    }

    // 4. Check daily data for volume average
    const dailyData = await prisma.ohlcvCache.findFirst({
        where: {
            symbol: sample.symbol,
            interval: 'day'
        }
    });

    if (dailyData) {
        console.log('\nDaily data:', dailyData.data?.length || 0, 'candles');
        const priorCandles = (dailyData.data || [])
            .filter(c => new Date(c.timestamp).toISOString().split('T')[0] < dateStr)
            .slice(-5);
        console.log('Last 5 prior daily candles:');
        priorCandles.forEach(c => {
            console.log(`  ${c.timestamp}: vol=${c.volume}`);
        });
    } else {
        console.log('\nNO daily data for', sample.symbol);
    }
}

debug()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
