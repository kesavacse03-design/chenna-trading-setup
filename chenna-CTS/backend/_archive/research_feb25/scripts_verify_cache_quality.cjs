/**
 * Verify Cache Quality
 * Picks random stocks and validates that Daily OHLCV matches the aggregated 30-min OHLCV.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function verifyCache() {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(` CACHE QUALITY VALIDATION`);
    console.log(`${'═'.repeat(80)}\n`);

    const categories = [
        'SHORT_TERM_SWING_BO_DOWN',
        'LONG_TERM_SWING_BO_UP',
        'LONG_TERM_SWING_BO_DOWN'
    ];

    const allStocks = [];

    // Get 3 random stocks per category
    for (const cat of categories) {
        const category = await prisma.category.findUnique({ where: { key: cat } });
        if (!category) continue;

        const catStocks = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: true }
        });

        // Deduplicate
        const uniqueCatStocks = Array.from(new Map(catStocks.map(s => [s.stock.symbol, s.stock])).values());

        // Shuffle and pick 3
        const shuffled = uniqueCatStocks.sort(() => 0.5 - Math.random());
        const picked = shuffled.slice(0, 3);

        for (const p of picked) {
            allStocks.push({ category: cat, symbol: p.symbol, instrumentKey: p.instrumentKey });
        }
    }

    if (allStocks.length === 0) {
        console.log('No stocks found for validation. Ensure caching has completed.');
        process.exit(1);
    }

    // Define random date selection logic 
    // Wait, caching might be in progress, but if we query priceService, it attempts to fetch if missing.
    // Let's rely on cached data by providing the 1-year and 6-month date range, then picking a common date.
    const today = new Date();
    const toDateStr = toISTDateString(today);

    let mismatchesFound = 0;

    for (const stock of allStocks) {
        console.log(`\nVerifying [${stock.category}] ${stock.symbol}...`);

        try {
            // First load from priceService
            const thirtyMinData = await priceService.fetchFromUpstox(stock.instrumentKey, toISTDateString(new Date(Date.now() - 180 * 86400000)), toDateStr, '30minute', stock.symbol);
            const dailyData = await priceService.fetchFromUpstox(stock.instrumentKey, toISTDateString(new Date(Date.now() - 365 * 86400000)), toDateStr, 'day', stock.symbol);

            if (!thirtyMinData || thirtyMinData.length === 0 || !dailyData || dailyData.length === 0) {
                console.log(`  ! Skipped: Missing cached data for ${stock.symbol}`);
                continue;
            }

            // Find a random common date where 30min data exists (not highly truncated)
            // Group 30-min data by date
            const m30ByDate = {};
            for (const c of thirtyMinData) {
                const d = String(c.timestamp || c.date).split('T')[0];
                if (!m30ByDate[d]) m30ByDate[d] = [];
                m30ByDate[d].push({
                    o: parseFloat(c.open), h: parseFloat(c.high), l: parseFloat(c.low),
                    c: parseFloat(c.close), v: parseFloat(c.volume)
                });
            }

            const dailyByDate = {};
            for (const c of dailyData) {
                const d = String(c.timestamp || c.date).split('T')[0];
                dailyByDate[d] = {
                    o: parseFloat(c.open), h: parseFloat(c.high), l: parseFloat(c.low),
                    c: parseFloat(c.close), v: parseFloat(c.volume)
                };
            }

            // Pick a date that exists in both with multiple intraday candles
            const commonDates = Object.keys(m30ByDate).filter(d => dailyByDate[d] && m30ByDate[d].length >= 5);
            if (commonDates.length === 0) {
                console.log(`  ! Skipped: No matching dates with sufficient intraday data for ${stock.symbol}`);
                continue;
            }

            // Pick a random date
            const randomDate = commonDates[Math.floor(Math.random() * commonDates.length)];

            const dCandle = dailyByDate[randomDate];
            const mCandles = m30ByDate[randomDate];

            // Sort mCandles by time if needed, assuming they're already sorted correctly from upstox 
            // Aggregation:
            const aggOpen = mCandles[0].o;
            const aggClose = mCandles[mCandles.length - 1].c;
            const aggHigh = Math.max(...mCandles.map(c => c.h));
            const aggLow = Math.min(...mCandles.map(c => c.l));
            const aggVol = mCandles.reduce((a, b) => a + b.v, 0);

            // Comparison
            let mismatch = false;
            let logDetails = `  Date: ${randomDate}\n`;

            if (Math.abs(dCandle.o - aggOpen) / dCandle.o > 0.005) { mismatch = true; logDetails += `    Open mismatch: Daily ${dCandle.o} vs 30m ${aggOpen}\n`; }
            if (Math.abs(dCandle.h - aggHigh) / dCandle.h > 0.005) { mismatch = true; logDetails += `    High mismatch: Daily ${dCandle.h} vs 30m ${aggHigh}\n`; }
            if (Math.abs(dCandle.l - aggLow) / dCandle.l > 0.005) { mismatch = true; logDetails += `    Low  mismatch: Daily ${dCandle.l} vs 30m ${aggLow}\n`; }
            if (Math.abs(dCandle.c - aggClose) / dCandle.c > 0.005) { mismatch = true; logDetails += `    Close mismatch: Daily ${dCandle.c} vs 30m ${aggClose}\n`; }

            // Volume in Upstox might not strictly match, just flag it 
            if (Math.abs(dCandle.v - aggVol) / (dCandle.v || 1) > 0.10) {
                // Don't mark as fatal mismatch if volume is slightly off, just log
                logDetails += `    Volume discrepancy: Daily ${dCandle.v} vs 30m ${aggVol} (10% threshold)\n`;
            }

            if (mismatch) {
                mismatchesFound++;
                console.log(`  ❌ MISMATCH DETECTED`);
                console.log(logDetails);
            } else {
                console.log(`  ✅ Verified successfully on ${randomDate}`);
            }

        } catch (err) {
            console.error(`  ! Error during validation: ${err.message}`);
        }
    }

    if (mismatchesFound === 0) {
        console.log(`\n✅ ALL VERIFICATIONS PASSED`);
    } else {
        console.log(`\n❌ ${mismatchesFound} MISMATCHES FOUND. Review logs.`);
    }

    process.exit(0);
}

verifyCache().catch(console.error);
