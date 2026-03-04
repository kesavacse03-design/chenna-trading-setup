/**
 * Sync OHLCV cache from database to CSV files
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    console.log('Syncing OHLCV cache to CSV files...\n');

    const caches = await prisma.ohlcvCache.findMany({
        where: { interval: 'day' },
        orderBy: { createdAt: 'desc' }
    });

    // Group by symbol, keep latest
    const symbolMap = new Map();
    for (const cache of caches) {
        if (!symbolMap.has(cache.symbol)) {
            symbolMap.set(cache.symbol, cache);
        }
    }

    console.log(`Found ${symbolMap.size} unique symbols in cache\n`);

    const cacheDir = path.join(__dirname, '../cache/historical');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    let synced = 0;
    for (const [symbol, cache] of symbolMap) {
        try {
            const data = JSON.parse(cache.data);
            const csvPath = path.join(cacheDir, `${symbol}.csv`);

            const lines = ['date,open,high,low,close,volume'];
            for (const candle of data) {
                const date = new Date(candle.timestamp).toISOString().split('T')[0];
                lines.push([date, candle.open, candle.high, candle.low, candle.close, candle.volume || 0].join(','));
            }

            fs.writeFileSync(csvPath, lines.join('\n'));
            synced++;
        } catch (err) {
            console.error(`Error syncing ${symbol}:`, err.message);
        }
    }

    console.log(`\n✅ Synced ${synced} CSV files`);

    // Check latest date
    const testFile = path.join(cacheDir, 'RELIANCE.csv');
    if (fs.existsSync(testFile)) {
        const content = fs.readFileSync(testFile, 'utf8');
        const lines = content.split('\n').slice(1, 4);
        console.log('\n📅 Latest dates in RELIANCE:');
        lines.forEach(l => console.log('  ' + l.split(',')[0]));
    }

    await prisma.$disconnect();
}

main().catch(console.error);
