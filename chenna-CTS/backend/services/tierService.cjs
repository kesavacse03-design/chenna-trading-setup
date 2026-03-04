const { PrismaClient } = require('@prisma/client');
const priceService = require('./priceService.cjs');
const prisma = new PrismaClient(); // Or reuse existing instance if possible, but new is safer for service

/**
 * Calculates Tier and Trend for a stock and updates StockCategory meta.
 * @param {number} stockCategoryId
 * @param {string} symbol
 * @param {Date} date
 */
async function calculateAndSaveTier(stockCategoryId, symbol, date) {
    try {
        console.log(`[TierService] Calculating Tier for ${symbol} on ${date.toISOString().split('T')[0]}...`);

        // Fetch 15 days back
        const fromDate = new Date(date);
        fromDate.setDate(fromDate.getDate() - 20); // 20 days buffer
        const toDate = new Date(date);

        const candles = await priceService.fetchPrice(symbol, null, // instrumentKey might be needed, try fetching from DB if null
            fromDate.toISOString().split('T')[0],
            toDate.toISOString().split('T')[0], '30minute');

        if (!candles || candles.length < 50) {
            console.log(`[TierService] Insufficient data for ${symbol}`);
            return;
        }

        // Sort
        candles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        // Find Signal Candle
        const dateStr = date.toISOString().split('T')[0];
        const signalCandles = candles.filter(c => (c.timestamp || c.date).startsWith(dateStr));
        if (signalCandles.length === 0) {
            console.log(`[TierService] No candles found on signal date for ${symbol}`);
            return;
        }

        const signalIdx = candles.indexOf(signalCandles[0]);
        const trendStartIdx = Math.max(0, signalIdx - 150); // Approx 10 days

        if (trendStartIdx >= signalIdx) return;

        const price10d = candles[trendStartIdx].close;
        const price0d = signalCandles[0].open;
        const trendPct = ((price0d - price10d) / price10d) * 100;

        // Tier Logic
        let tier = 'TIER 3 (UPTREND)';
        let target = 4.0;
        let stop = 2.0;

        if (trendPct < -5.0) {
            tier = 'TIER 1 (OVERSOLD)';
            target = 6.0;
            stop = 5.0;
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
            strategy: 'LONG_MEAN_REVERSION',
            calculatedAt: new Date().toISOString()
        };

        // Update DB
        // Use raw query to be safe against schema mismatch in running process
        const metaJson = JSON.stringify(meta);
        await prisma.$executeRaw`UPDATE stock_categories SET meta = ${metaJson}::jsonb WHERE id = ${stockCategoryId}`;

        console.log(`[TierService] ✅ Saved ${tier} for ${symbol} (Trend: ${trendPct.toFixed(2)}%)`);

    } catch (e) {
        console.error(`[TierService] Error for ${symbol}:`, e.message);
    }
}

module.exports = { calculateAndSaveTier };
