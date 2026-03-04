const { get1MinCandles, detectOpeningRange, detectNPatternV21, applyV21Filters, calculateEMA } = require('../services/labs/intradayStrategyV2_1.cjs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

async function debugDeepDive() {
    const today = '2026-02-05';
    // The 4 stocks identified by the user/previous debug run
    const targets = ['TCS', 'INFY', 'ADANIGREEN', 'JIOFIN'];

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`DEEP DIVE FILTER ANALYSIS - ${today}`);
    console.log(`Targets: ${targets.join(', ')}`);
    console.log(`${'═'.repeat(80)}\n`);

    for (const symbol of targets) {
        console.log(`\n--- ${symbol} ---`);

        // 1. Fetch Data
        // We use get1MinCandles from strategy which handles the key lookup and fetching
        const candles = await get1MinCandles(symbol, today);

        if (candles.length === 0) {
            console.log(`❌ NO DATA`);
            continue;
        }
        console.log(`✓ Data: ${candles.length} candles`);

        // 2. OR Detection
        const or = detectOpeningRange(candles);
        if (!or) {
            console.log(`❌ OR Detection Failed (Width > 2% or pattern undefined)`);
            // Manually calc for debug
            const first15 = candles.slice(0, 15);
            const high = Math.max(...first15.map(c => c.high));
            const low = Math.min(...first15.map(c => c.low));
            const width = ((high - low) / low) * 100;
            console.log(`   Manual Check: Width=${width.toFixed(2)}% (Limit 2.0%)`);
            continue;
        }
        console.log(`✓ OR Detected: Width=${or.rangePercent.toFixed(2)}%`);

        // 3. Pattern Detection
        const nPattern = detectNPatternV21(candles, or);
        if (!nPattern) {
            console.log(`❌ No N-Pattern Found (Breakout + Pullback)`);
            continue;
        }
        console.log(`✓ N-Pattern Found at Index ${nPattern.breakoutIndex} (${candles[nPattern.breakoutIndex]?.timestamp})`);

        // 4. Enhanced Filters (Use Mock avg volume if needed, or fetch it)
        // Strategy calculates avg volume. Let's try to get it.
        // Quick fetch of daily for volume
        const nextDay = '2026-02-06';
        // We can't easily get daily avg without full fetch. 
        // Let's rely on the strategy's assumption or just use current day avg for rough check.
        const dayVolAvg = candles.reduce((s, c) => s + (c.volume || 0), 0) / candles.length;
        // Strategy uses Daily Avg Volume (~375 candles equivalent)
        // avgDailyVol approx = dayVolAvg * 375
        const approxDailyVol = dayVolAvg * 375;

        for (const mode of ['STRICT', 'RELAXED']) {
            console.log(`\n   --- MODE: ${mode} ---`);

            // 2. Detect N-Pattern (Mode Dependent now!)
            const nPattern = detectNPatternV21(candles, or, mode);

            if (!nPattern) {
                console.log(`   ❌ No N-Pattern found (Breakout > 0.5% above OR)`);
                continue;
            }
            console.log(`   ✅ N-Pattern Found at Index ${nPattern.breakoutIndex} (${nPattern.breakoutCandle.timestamp})`);
            console.log(`      Breakout Price: ${nPattern.breakoutCandle.high}, OR High: ${or.high}`);
            const strength = ((nPattern.breakoutCandle.high - or.high) / or.high) * 100;
            console.log(`      Strength: ${strength.toFixed(2)}%`);

            const filters = applyV21Filters(candles, or, nPattern, approxDailyVol, mode);

            console.log(`   Filters Passed: ${filters.passed}`);
            if (!filters.passed) {
                console.log(`   Reasons:`);
                filters.reasons.forEach(r => console.log(`      ❌ ${r}`));
            }

            // Detailed Dump
            console.log(`      EMA Check: ${filters.emaCheck ? 'PASS' : 'FAIL'}`);
            console.log(`      Breakout Strength: ${filters.breakoutStrength ? 'PASS' : 'FAIL'}`);
            console.log(`      Volume Check: ${filters.volumeCheck ? 'PASS' : 'FAIL'}`);
            console.log(`      Healthy Candle: ${filters.healthyCandle ? 'PASS' : 'FAIL'}`);
            console.log(`      EMA Proximity: ${filters.emaProximity ? 'PASS' : 'FAIL'}`);
            console.log(`      EMA Trend: ${filters.emaTrend ? 'PASS' : 'FAIL'}`);
        }
    }
}

debugDeepDive()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
