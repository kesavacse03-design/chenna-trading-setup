const priceService = require('./services/priceService.cjs');

async function testInterval(interval) {
    try {
        console.log(`Testing interval: ${interval} for recent 10 days`);
        const data = await priceService.fetchFromUpstox('NSE_EQ|INE062A01020', '2026-02-15', '2026-02-27', interval, 'SBIN');
        console.log(`Result for ${interval}: ${data.length} candles`);
    } catch (e) {
        console.error(`Error for ${interval}:`, e.message);
    }
}

async function run() {
    await testInterval('15minute');
    await testInterval('5minute');
}
run();
