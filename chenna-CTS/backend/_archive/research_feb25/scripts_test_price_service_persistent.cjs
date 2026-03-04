const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

async function main() {
    console.log('--- Testing PriceService for PERSISTENT ---');
    const symbol = 'PERSISTENT';
    const key = 'NSE_EQ|INE262H01021';

    try {
        console.log(`Fetching 1min candles for ${symbol}...`);
        const candles = await priceService.fetchPrice(
            key, // keys first
            symbol, // symbol? wait check signature
            '2026-02-05',
            '2026-02-06',
            '1minute'
        );

        // PriceService signature check required.
        // In file content previously viewed:
        // fetchPrice(symbol, instrumentKey, fromDate, toDate, interval)
        // Correct order: symbol, key, from, to, interval

    } catch (e) {
        console.error('PriceService Error:', e.message);
    }
}

// Re-write main with correct signature awareness
async function mainCorrect() {
    console.log('--- Testing PriceService for PERSISTENT ---');
    const symbol = 'PERSISTENT';
    const key = 'NSE_EQ|INE262H01021';

    try {
        console.log(`Fetching 1min candles for ${symbol}...`);
        const candles = await priceService.fetchPrice(
            symbol,
            key,
            '2026-02-05',
            '2026-02-06',
            '1minute'
        );

        console.log(`Result: ${candles ? candles.length : 'null'} candles`);
        if (candles && candles.length > 0) {
            console.log('First candle:', candles[0]);
        }
    } catch (e) {
        console.error('PriceService Error:', e.message);
        console.error(e.stack);
    }
}

mainCorrect()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
