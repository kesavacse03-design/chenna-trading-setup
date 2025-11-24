// Debug script to test live price fetching
const livePriceService = require('../services/livePriceService.cjs');

(async () => {
    console.log('Testing live price service...\n');

    // Trigger update
    await livePriceService.updateAllPrices();

    // Get results
    const data = livePriceService.getAllPrices();

    console.log('\n=== RESULTS ===');
    console.log('Total stocks cached:', data.totalStocks);
    console.log('Last update:', data.lastUpdate);

    if (data.totalStocks > 0) {
        const samplePrices = Object.entries(data.prices).slice(0, 5);
        console.log('\nSample prices:');
        for (const [symbol, info] of samplePrices) {
            console.log(`  ${symbol}: ₹${info.ltp}`);
        }
    } else {
        console.log('\n❌ NO PRICES CACHED!');
        console.log('This suggests the fetching or mapping is failing.');
    }

    process.exit(0);
})();
