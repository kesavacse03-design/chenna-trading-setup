const priceService = require('../services/priceService.cjs');

async function test() {
    // KOTAKBANK Token = 1922
    const key = 'NSE_EQ|INE237A01036';
    console.log(`Testing fetch with key: ${key}`);

    try {
        const data = await priceService.fetchPrice('KOTAKBANK', key, '2024-01-01', '2024-01-10');
        console.log(`Fetched ${data ? data.length : 0} candles.`);
        if (data && data.length > 0) {
            console.log('First candle:', data[0]);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
