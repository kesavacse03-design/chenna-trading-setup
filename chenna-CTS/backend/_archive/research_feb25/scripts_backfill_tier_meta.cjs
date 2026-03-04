const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const prisma = new PrismaClient();

async function run() {
    console.log('=== Backfilling Tier Meta Data ===');

    // 1. Get Category
    const category = await prisma.category.findUnique({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' },
        include: { stocks: { include: { stock: true } } }
    });

    if (!category) {
        console.log('Category not found');
        return;
    }

    console.log(`Found ${category.stocks.length} stocks in SHORT_TERM_SWING_BO_DOWN`);

    let updated = 0;

    for (const item of category.stocks) {
        const sym = item.stock.symbol;
        const dateStr = item.addedDate.toISOString().split('T')[0];

        console.log(`Processing ${sym} on ${dateStr}...`);

        // Fetch 15 days back
        const fromDate = new Date(item.addedDate);
        fromDate.setDate(fromDate.getDate() - 20);
        const toDate = new Date(item.addedDate); // Only need up to signal day

        let candles = [];
        try {
            candles = await priceService.fetchPrice(sym, item.stock.instrumentKey,
                fromDate.toISOString().split('T')[0],
                toDate.toISOString().split('T')[0], '30minute');
        } catch (e) {
            console.log(`Failed to fetch price for ${sym}: ${e.message}`);
            continue;
        }

        if (!candles || candles.length < 50) continue;

        // Sort
        candles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        // Find Signal Candle (last one on date)
        const signalCandles = candles.filter(c => (c.timestamp || c.date).startsWith(dateStr));
        if (signalCandles.length === 0) continue;

        const signalIdx = candles.indexOf(signalCandles[0]);
        // 10-Day Pre Trend
        const trendStartIdx = Math.max(0, signalIdx - 150); // Approx
        if (trendStartIdx >= signalIdx) continue;

        const price10d = candles[trendStartIdx].close;
        const price0d = signalCandles[0].open;
        const trendPct = ((price0d - price10d) / price10d) * 100;

        // Tier Logic
        let tier = 'TIER 3 (UPTREND)';
        let target = 4.0;
        let stop = 2.0;

        if (trendPct < -5.0) {
            tier = 'TIER 1 (OVERSOLD)';
            target = 6.0; // Reduced from original plan? No, sticking to Backtest Plan
            stop = 5.0;   // WIDENED as per Optimization
        } else if (trendPct <= 0) {
            tier = 'TIER 2 (FRESH)';
            target = 4.0;
            stop = 2.0;
        }

        const meta = {
            tier: tier,
            trend10d: parseFloat(trendPct.toFixed(2)),
            targetPct: target,
            stopPct: stop,
            strategy: 'LONG_MEAN_REVERSION'
        };

        // Update DB
        try {
            // Try standard update first
            await prisma.stockCategory.update({
                where: { id: item.id },
                data: { meta: meta }
            });
            updated++;
        } catch (e) {
            console.log(`Prisma update failed (schema mismatch?), trying raw SQL...`);
            // Raw SQL fallback
            const metaJson = JSON.stringify(meta);
            await prisma.$executeRaw`UPDATE stock_categories SET meta = ${metaJson}::jsonb WHERE id = ${item.id}`;
            updated++;
        }
    }

    console.log(`✅ Updated ${updated} records with Tier Meta.`);
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
