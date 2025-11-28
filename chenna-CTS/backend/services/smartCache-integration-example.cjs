/**
 * Integration Example: Smart Cache in Time-Travel Backtest
 * 
 * Shows how to add auto-caching to time-travel backtest
 */

// Add to timeTravelBacktesterV2.cjs at the start of run() method:

const SmartOHLCVCacheManager = require('../services/smartOHLCVCacheManager.cjs');

// In the run() method, before getting stocks:
async run(categoryKey, options = {}) {
    console.log(`\n🚀 Starting Time-Travel Backtest V2 for ${categoryKey}`);

    // AUTO-CACHE: Ensure data is available
    if (options.autoCache !== false) {
        const cacheManager = new SmartOHLCVCacheManager();
        const cacheResult = await cacheManager.ensureDataForCategory(categoryKey);

        if (!cacheResult.sufficient) {
            console.warn(`⚠️ Warning: Only ${cacheResult.ready}/${cacheResult.total} stocks have data`);
            console.warn(`   Recommendation: Add more stocks or fetch more data`);
        } else {
            console.log(`✅ Data check passed: ${cacheResult.ready} stocks ready`);
        }
    }

    // Continue with normal backtest...
    console.log(`📊 Testing ${this.strategyVariants.length} strategy variants\n`);

    const stocks = await this.getStocksForCategory(categoryKey);
    // ... rest of method
}
