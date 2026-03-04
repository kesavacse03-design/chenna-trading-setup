/**
 * Debug script to trace V1 signal generation step by step
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    TARGET_PERCENT: 1.5,
    STOP_PERCENT: 1.0,
    VOLUME_THRESHOLD: 1.5,
    MIN_CANDLES: 100
};

async function get1MinCandles(symbol, date) {
    const targetDateStr = typeof date === 'string'
        ? date.split('T')[0]
        : new Date(date).toISOString().split('T')[0];

    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: '5m' }
    });

    if (!cached || !cached.data) return [];

    const candles = cached.data.filter(c => {
        if (!c.timestamp) return false;
        const candleDateStr = c.timestamp.split('T')[0];
        if (candleDateStr !== targetDateStr) return false;

        const timePart = c.timestamp.split('T')[1];
        if (!timePart) return false;

        const hours = parseInt(timePart.substring(0, 2), 10);
        const minutes = parseInt(timePart.substring(3, 5), 10);
        const timeNum = hours * 100 + minutes;

        return timeNum >= 915 && timeNum <= 1530;
    });

    return candles.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function getAvgVolume(symbol, date) {
    const targetDateStr = typeof date === 'string'
        ? date.split('T')[0]
        : new Date(date).toISOString().split('T')[0];

    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: 'day' }
    });

    if (!cached || !cached.data || cached.data.length < 10) return null;

    const priorCandles = cached.data
        .filter(c => {
            const candleDateStr = typeof c.timestamp === 'string'
                ? c.timestamp.split('T')[0]
                : new Date(c.timestamp).toISOString().split('T')[0];
            return candleDateStr < targetDateStr;
        })
        .slice(-20);

    if (priorCandles.length < 10) return null;

    const totalVolume = priorCandles.reduce((sum, c) => sum + (c.volume || 0), 0);
    return totalVolume / priorCandles.length;
}

async function debug() {
    const date = '2026-01-06';
    console.log('=== Debug V1 Signal Generation ===\n');
    console.log('Date:', date);
    console.log('Volume threshold:', CONFIG.VOLUME_THRESHOLD);
    console.log('Min candles:', CONFIG.MIN_CANDLES);

    // Get some stocks that have 5m data
    const dataRecords = await prisma.ohlcvCache.findMany({
        where: { interval: '5m' },
        take: 10,
        select: { symbol: true }
    });

    console.log('\n=== Testing first 10 stocks ===\n');

    for (const record of dataRecords) {
        const symbol = record.symbol;
        console.log(`\n--- ${symbol} ---`);

        const candles = await get1MinCandles(symbol, date);
        console.log(`  Candles for ${date}: ${candles.length}`);

        if (candles.length < CONFIG.MIN_CANDLES) {
            console.log(`  ❌ SKIP: Not enough candles (need ${CONFIG.MIN_CANDLES})`);
            continue;
        }

        const firstCandle = candles[0];
        console.log(`  First candle: ${firstCandle.timestamp}`);
        console.log(`  First candle volume: ${firstCandle.volume}`);

        const avgVolume = await getAvgVolume(symbol, date);
        console.log(`  20-day avg volume: ${avgVolume}`);

        if (!avgVolume || avgVolume === 0) {
            console.log(`  ❌ SKIP: No avg volume data`);
            continue;
        }

        const volumeRatio = firstCandle.volume / avgVolume;
        console.log(`  Volume ratio: ${volumeRatio.toFixed(2)}x (need >${CONFIG.VOLUME_THRESHOLD}x)`);

        if (volumeRatio < CONFIG.VOLUME_THRESHOLD) {
            console.log(`  ❌ SKIP: Volume too low`);
        } else {
            console.log(`  ✅ SIGNAL! Would generate trade`);
        }
    }
}

debug()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
