/**
 * Quick test: verify gates compile and NIFTY data exists
 */
const { getMarketRegime, shouldAllowEntry } = require('../services/regimeService.cjs');

(async () => {
    console.log('=== Testing Gate 1: Market Regime ===\n');

    // Test Feb 17 (normal day)
    const feb17 = await getMarketRegime(new Date('2026-02-17T00:00:00+05:30'), 'SHORT_TERM_SWING_BO_UP');
    console.log('Feb 17 Regime:', JSON.stringify(feb17, null, 2));
    console.log('Allow Entry (swing):', shouldAllowEntry(feb17, 'swing'));

    // Test Feb 23 (before crash)
    const feb23 = await getMarketRegime(new Date('2026-02-23T00:00:00+05:30'), 'SHORT_TERM_SWING_BO_UP');
    console.log('\nFeb 23 Regime:', JSON.stringify(feb23, null, 2));
    console.log('Allow Entry (swing):', shouldAllowEntry(feb23, 'swing'));

    console.log('\n=== Testing Gate 2: Minervini Classifier ===');
    // This is inline in signalGeneratorV2, just verify the require doesn't crash
    const { generateCategorySignals } = require('../services/labs/signalGeneratorV2.cjs');
    console.log('signalGeneratorV2 loaded successfully (Minervini classifier embedded)');

    process.exit(0);
})();
