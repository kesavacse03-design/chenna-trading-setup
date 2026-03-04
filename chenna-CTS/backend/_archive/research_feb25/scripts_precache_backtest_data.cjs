/**
 * Pre-Cache Historical Data for Backtesting
 * 
 * Run this script ONCE to cache all historical data for stocks in a category.
 * Then backtest runs instantly using cached data.
 * 
 * Usage: node scripts/precache_backtest_data.cjs SHORT_TERM_SWING_BO_DOWN 2025-12-01 2026-01-09
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');

const prisma = new PrismaClient();

async function precacheCategory(categoryKey, startDate, endDate, interval = 'day') {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PRE-CACHING HISTORICAL DATA FOR BACKTEST (` + interval + `)`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Category: ${categoryKey}`);
    console.log(`Period: ${startDate} to ${endDate}`);
    console.log(`${'='.repeat(60)}\n`);

    // Get all stocks in category
    const category = await prisma.category.findFirst({
        where: { key: categoryKey }
    });

    if (!category) {
        console.error(`❌ Category not found: ${categoryKey}`);
        return;
    }

    const stocks = await prisma.stockCategory.findMany({
        where: { categoryId: category.id },
        include: { stock: true }
    });

    console.log(`Found ${stocks.length} stocks in category\n`);

    let cached = 0;
    let failed = 0;

    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i].stock;
        if (!stock || !stock.instrumentKey) {
            console.log(`⚠️ ${i + 1}/${stocks.length} Skipping ${stock?.symbol || 'unknown'}: No instrument key`);
            continue;
        }

        const symbol = stock.symbol;
        const instrumentKey = stock.instrumentKey;

        try {
            console.log(`📊 ${i + 1}/${stocks.length} Fetching ${symbol}...`);

            // Fetch and cache the data
            const data = await priceService.fetchPrice(
                symbol,
                instrumentKey,
                startDate,
                endDate,
                interval
            );

            if (data && data.length > 0) {
                console.log(`   ✅ Cached ${data.length} candles`);
                cached++;
            } else {
                console.log(`   ⚠️ No data available`);
                failed++;
            }

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));

        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            failed++;
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`PRE-CACHE COMPLETE`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Cached: ${cached} stocks`);
    console.log(`❌ Failed: ${failed} stocks`);
    console.log(`${'='.repeat(60)}\n`);
}

// CLI
const args = process.argv.slice(2);
if (args.length < 3) {
    console.log('Usage: node precache_backtest_data.cjs <categoryKey> <startDate> <endDate> [interval]');
    console.log('Example: node precache_backtest_data.cjs SHORT_TERM_SWING_BO_DOWN 2025-12-01 2026-01-09 day');
    process.exit(1);
}

precacheCategory(args[0], args[1], args[2], args[3] || 'day')
    .then(() => {
        console.log('Done!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
