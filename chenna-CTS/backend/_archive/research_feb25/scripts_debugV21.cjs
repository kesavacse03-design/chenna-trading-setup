const { generateIntradaySignalsV21, debugSingleStock, get1MinCandles, detectNPatternV21, applyV21Filters } = require('../services/labs/intradayStrategyV2_1.cjs'); // UPDATED IMPORT
const { generateMockCandles } = require('./mockData.cjs');
const prisma = require('../lib/prisma.cjs');

// Monkey-patch get1MinCandles to fallback to mock
const originalGet1Min = require('../services/labs/intradayStrategyV2_1.cjs').get1MinCandles;

// We can't easily monkeypatch specific export if we destructured, 
// so we'll just run debugSingleStock and let it define its internal usage.
// Actually, debugSingleStock calls get1MinCandles internally. 
// Best way is to modify debugSingleStock behaviour in the storage, OR just passing mock data if we were calling strategy directly.
// Since debugSingleStock is "black box" invoke, we can't inject data easily without changing strategy file.

// ALTERNATIVE: Rewrite this script to call strategy functions directly with mock data
// ALREADY IMPORTED ABOVE
// const { detectOpeningRange, detectNPatternV21, calculateEMA, generateIntradaySignalsV21, applyV21Filters } = require('../services/labs/intradayStrategyV2_1.cjs');

async function runDebug() {
    const symbol = process.argv[2] || 'LUPIN';
    const date = process.argv[3] || '2026-02-04';

    console.log(`\n🔍 DEEP INSPECTION for ${symbol}...`);

    // 1. Check what intervals exist for this stock
    const cacheEntries = await prisma.ohlcvCache.findMany({
        where: { symbol },
        select: { interval: true, createdAt: true, data: true }
    });

    console.log(`\nFound ${cacheEntries.length} cache entries for ${symbol}:`);

    // Group by interval
    const intervalCounts = {};
    const intervalSamples = {};

    cacheEntries.forEach(e => {
        if (!intervalCounts[e.interval]) {
            intervalCounts[e.interval] = 0;
            intervalSamples[e.interval] = e;
        }
        intervalCounts[e.interval]++;

        // DEBUG: Print details of non-day intervals
        if (e.interval !== 'day' && intervalCounts[e.interval] <= 1) {
            console.log(`[Non-Day Sample] interval=${e.interval}, items=${Array.isArray(e.data) ? e.data.length : 0}`);
        }
    });

    console.log('\n--- INTERVAL SUMMARY ---');
    Object.keys(intervalCounts).forEach(int => {
        console.log(`Interval: [${int}] -> Count: ${intervalCounts[int]}`);

        // Show sample for this interval
        const e = intervalSamples[int];
        const dataLength = Array.isArray(e.data) ? e.data.length : 0;
        let firstTs = 'N/A';
        if (dataLength > 0 && e.data[0]) {
            firstTs = e.data[0].timestamp || e.data[0].date || e.data[0].time || 'UnknownKey';
        }
        console.log(`   Sample Created: ${e.createdAt} | Items: ${dataLength} | FirstTS: ${firstTs}`);
    });
    console.log('------------------------\n');

    // 2. Run the strategy debug
    console.log(`\nrunning strategy debug...`);
    try {
        await debugSingleStock(symbol, date);
    } catch (e) {
        console.error('Debug Execution Failed:', e.message);
        console.error(e.stack);
    }

    // --- MOCK DATA VERIFICATION ---
    console.log('\n' + '═'.repeat(60));
    console.log('🧪 MOCK DATA VERIFICATION (Bypassing Network)');
    console.log('═'.repeat(60));

    const mockCandles = generateMockCandles(date);
    console.log(`Generated ${mockCandles.length} mock candles for logic test.`);

    const strategy = require('../services/labs/intradayStrategyV2_1.cjs');

    // 1. OR
    const or = strategy.detectOpeningRange(mockCandles);
    if (or) {
        console.log(`✅ [Mock] OR Detected: ${or.high} - ${or.low} (${or.rangePercent.toFixed(2)}%)`);

        const nPattern = strategy.detectNPatternV21(mockCandles, or);
        if (nPattern) {
            console.log(`✅ [Mock] N-Pattern Found at ${mockCandles[nPattern.breakoutIndex].timestamp}`);

            const filters = strategy.applyV21Filters(mockCandles, or, nPattern, 250000); // 250k daily vol
            console.log(`✅ [Mock] Filter Results:`, filters);
            if (filters.passed) {
                console.log(`🎉 STRATEGY LOGIC VERIFIED: Mock Signal Generated!`);
            } else {
                console.log(`⚠️ Mock Signal Filtered Out: ${filters.reasons.join(', ')}`);
            }
        } else {
            console.log(`❌ [Mock] N-Pattern NOT found`);
        }
    } else {
        console.log(`❌ [Mock] OR NOT detected`);
    }

    await prisma.$disconnect();
}

runDebug();
