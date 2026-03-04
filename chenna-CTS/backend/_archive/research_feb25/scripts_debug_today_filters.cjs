const { getIntradayStocks, detectOpeningRange, detectNPatternV21, applyV21Filters } = require('../services/labs/intradayStrategyV2_1.cjs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

async function debugTodayFilters() {
    const today = '2026-02-05';

    // Fetch stocks added strictly today
    const stocks = await getIntradayStocks('INTRADAY_BOOST', today);

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`FILTER ANALYSIS FOR ${today} - INTRADAY_BOOST`);
    console.log(`Total Stocks: ${stocks.length}`);
    console.log(`${'═'.repeat(80)}\n`);

    const results = {
        noData: [],
        orTooWide: [],
        volumeFailed: [],
        noPattern: [],
        signalGenerated: []
    };

    // Get average daily volume for each stock to use in filters
    // We can use the helper from the strategy file via get1MinCandles... wait.
    // The strategy file calculates avg Vol internally in `generateIntradaySignalsV21`.
    // We'll calculate it manually or mock it if needed, but correct way is to fetch daily candles.
    // For simplicity, let's just use priceService to fetch daily data for avg volume.

    for (const stock of stocks) {
        // console.log(`\n--- ${stock.symbol} ---`);
        process.stdout.write(`Checking ${stock.symbol}... `);
        await new Promise(r => setTimeout(r, 1000)); // Throttle requests manually

        // Fetch 1-min candles for TODAY
        let candles;
        try {
            // We use the same logic as get1MinCandles implicitly via priceService
            // But priceService.fetchPrice needs next day for "intraday" endpoint logic on "today"
            const nextDay = '2026-02-06';
            candles = await priceService.fetchPrice(
                stock.symbol,
                stock.instrumentKey,
                today,
                nextDay,
                '1minute'
            );
        } catch (e) {
            console.log(`❌ Error fetching: ${e.message}`);
            results.noData.push(stock.symbol);
            continue;
        }

        if (!candles || candles.length === 0) {
            console.log(`❌ NO DATA`);
            results.noData.push(stock.symbol);
            continue;
        }

        // Filter for market hours (9:15-15:30)
        // Assuming candles are already processed by PriceService or raw logic needed
        // The PriceService returns raw Upstox candles. We need to filter time.
        // Simplifying: just take first 375 if exists

        // Calculate Opening Range (first 15 min 9:15-9:30)
        // We assume data starts at 9:15.
        const orCandles = candles.slice(0, 15);
        if (orCandles.length < 15) {
            console.log(`❌ Not enough data (${candles.length} candles)`);
            results.noData.push(stock.symbol);
            continue;
        }

        const orHigh = Math.max(...orCandles.map(c => c.high));
        const orLow = Math.min(...orCandles.map(c => c.low));
        const orWidth = ((orHigh - orLow) / orLow) * 100;

        // console.log(`  OR: High=${orHigh.toFixed(2)}, Low=${orLow.toFixed(2)}, Width=${orWidth.toFixed(2)}%`);

        if (orWidth > 2.0) {
            console.log(`❌ OR TOO WIDE (${orWidth.toFixed(2)}% > 2%)`);
            results.orTooWide.push({ symbol: stock.symbol, orWidth });
            continue;
        }

        // console.log(`  ✓ OR Width OK`);

        // Check volume
        // We need Average Daily Volume. Let's approximate or just check relative volume of first candle vs today's avg
        // The user prompt checks: firstCandleVol / avgVolume (of the day so far?)
        // "Avg=80000" in example implies daily average.
        // Let's use the day's average for now as proxy if we don't have historical.
        // Or better, fetch 10 days of daily candles.

        // Quick Hack: just check if first candle volume is substantial compared to rest of day
        const firstCandleVol = candles[0]?.volume || 0;
        const avgVolumeIntraday = candles.reduce((sum, c) => sum + (c.volume || 0), 0) / candles.length;

        // The strategy uses "Avg Daily Volume" (20 days). We don't have that easily here without more calls.
        // But let's use the Ratio user suggested: FirstCandle / AvgIntraday (which is usually lower than daily avg).
        // Actually, user prompts: "Volume: First=..., Avg=..., Ratio=..."
        // Let's stick to user's logic: First Candle vs Average of fetched candles.

        const volRatio = avgVolumeIntraday > 0 ? firstCandleVol / avgVolumeIntraday : 0;

        // console.log(`  Volume: First=${firstCandleVol}, Avg=${avgVolumeIntraday.toFixed(0)}, Ratio=${volRatio.toFixed(2)}x`);

        // User threshold: 2.0x (though Strategy checks vs Daily Avg * 0.03, this is different but let's see)
        // Strategy V2.1: openingVolume / (avgDailyVolume * 0.03) >= 1.5
        // User Debug Script: volRatio < 2.0
        // I will use user's explicit logic for this report 

        if (volRatio < 2.0) {
            console.log(`❌ VOLUME FAILED (${volRatio.toFixed(2)}x < 2x)`);
            results.volumeFailed.push({ symbol: stock.symbol, volRatio });
            continue;
        }

        console.log(`✓ OK (OR=${orWidth.toFixed(2)}%, Vol=${volRatio.toFixed(2)}x) -> Checking Pattern...`);

        // Check Pattern
        // We need "openingRange" object for detection function
        const orObj = { high: orHigh, low: orLow, endIndex: 14, rangePercent: orWidth };
        const nPattern = detectNPatternV21(candles, orObj);

        if (!nPattern) {
            console.log(`  ❌ NO PATTERN`);
            results.noPattern.push(stock.symbol);
        } else {
            console.log(`  ✅ SIGNAL GENERATED!`);
            results.signalGenerated.push(stock.symbol);
        }
    }

    // Summary
    console.log(`\n${'═'.repeat(80)}`);
    console.log('SUMMARY');
    console.log(`${'═'.repeat(80)}`);
    console.log(`Total Stocks: ${stocks.length}`);
    console.log(`No Data: ${results.noData.length}`);

    console.log(`OR Too Wide (>2%): ${results.orTooWide.length}`);
    results.orTooWide.sort((a, b) => b.orWidth - a.orWidth).slice(0, 10).forEach(r => {
        console.log(`  - ${r.symbol}: ${r.orWidth.toFixed(2)}%`);
    });

    console.log(`Volume Failed (<2x avg): ${results.volumeFailed.length}`);
    results.volumeFailed.slice(0, 5).forEach(r => {
        console.log(`  - ${r.symbol}: ${r.volRatio.toFixed(2)}x`);
    });

    console.log(`No Pattern: ${results.noPattern.length} (Passed OR & Vol but no N-Pattern)`);
    if (results.noPattern.length > 0) {
        console.log(`  - ${results.noPattern.join(', ')}`);
    }

    console.log(`Signals: ${results.signalGenerated.length}`);
    if (results.signalGenerated.length > 0) {
        console.log(`  - ${results.signalGenerated.join(', ')}`);
    }
}

debugTodayFilters()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
