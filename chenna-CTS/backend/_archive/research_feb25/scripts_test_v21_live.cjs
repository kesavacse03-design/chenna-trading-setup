// backend/scripts/test_v21_live.cjs

const { generateIntradaySignalsV21, debugSingleStock } = require('../services/labs/intradayStrategyV2_1.cjs');
const prisma = require('../lib/prisma.cjs');

async function testLive() {
    const args = process.argv.slice(2);
    // Default to today if no arg provided
    const today = args[0] || new Date().toISOString().split('T')[0];

    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    console.log('═'.repeat(60));
    console.log(`V2.1 LIVE TEST - ${now}`);
    console.log(`Testing date: ${today}`);
    console.log('═'.repeat(60));

    // Test single stock first (for debugging)
    // Test single stock first (for debugging)
    console.log('\n--- SINGLE STOCK DEBUG (MOTHERSON) ---');
    await debugSingleStock('MOTHERSON', '2026-01-06');

    // Then test full category
    console.log('\n--- FULL CATEGORY SCAN (INTRADAY_BOOST) ---');
    try {
        const { signals, stats } = await generateIntradaySignalsV21('INTRADAY_BOOST', today);

        console.log('\n--- SCAN STATISTICS ---');
        console.log(`Stocks Scanned: ${stats.totalStocks}`);
        console.log(`Volume Passed: ${stats.volumePass}`);
        console.log(`OR Detected: ${stats.orDetected}`);
        console.log(`Patterns Found: ${stats.nPatternFound}`);
        console.log(`Fresh & Filtered Signals: ${stats.finalSignals}`);

        if (signals.length > 0) {
            console.log(`\n🎉 SUCCESS! Generated ${signals.length} signals:`);
            signals.forEach((s, i) => {
                console.log(`  ${i + 1}. ${s.symbol} @ ${s.entryTime} [${s.freshness}]`);
                console.log(`     Entry: ${s.entryPrice}, Target: ${s.targetPrice}, Stop: ${s.stopPrice}`);
                console.log(`     Confidence: ${s.confidence} (${s.enhancedChecks}/3 checks)`);
            });
        } else {
            console.log('\n⚠️ No signals generated.');
            console.log('Possible reasons:');
            console.log('  - No stocks passed volume filter');
            console.log('  - No valid Opening Range (<2%)');
            console.log('  - No N-Pattern formed');
            console.log('  - All breakouts were old (anti-chase filter)');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

testLive();
