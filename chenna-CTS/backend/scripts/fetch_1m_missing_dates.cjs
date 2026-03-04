/**
 * Fetch 1-minute historical data for MISSING dates (Feb 27, Mar 02)
 * and merge into existing _master.json files.
 * Uses the Upstox HISTORICAL candle endpoint (not intraday).
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');

const prisma = new PrismaClient();
const CACHE_DIR = path.join(__dirname, '../cache/1minute');

// Dates we need to backfill
const MISSING_DATES = [
    { from: '2026-02-26', to: '2026-02-27' },  // Feb 26 only
];

async function main() {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

    // Get IB stocks from the last 14 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    const entries = await prisma.stockCategory.findMany({
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: { gte: cutoff }
        },
        include: { stock: true }
    });

    const uniqueStocks = new Map();
    for (const e of entries) {
        if (e.stock && e.stock.instrumentKey) {
            uniqueStocks.set(e.stock.symbol, e.stock);
        }
    }

    const stocksArr = Array.from(uniqueStocks.values());
    console.log(`Found ${stocksArr.length} unique IB stocks to backfill 1-min data for.`);

    let success = 0, failed = 0, totalCandles = 0;

    for (let i = 0; i < stocksArr.length; i++) {
        const s = stocksArr[i];
        const cleanKey = s.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
        const masterPath = path.join(CACHE_DIR, `${cleanKey}_master.json`);

        // Load existing master data
        let existing = [];
        if (fs.existsSync(masterPath)) {
            try { existing = JSON.parse(fs.readFileSync(masterPath, 'utf8')); } catch (e) { }
        }

        let newCandles = [];

        for (const dateRange of MISSING_DATES) {
            // Check if we already have data for this date
            const existingDates = new Set(existing.map(c => String(c.timestamp).split('T')[0]));
            if (existingDates.has(dateRange.from)) {
                continue; // Already have this date
            }

            try {
                const instKey = encodeURIComponent(s.instrumentKey);
                const url = `https://api.upstox.com/v2/historical-candle/${instKey}/1minute/${dateRange.to}/${dateRange.from}`;
                const token = await priceService.getAccessToken();
                await priceService.rateLimiter.waitIfNeeded();

                const result = await priceService.makeHttpsRequest(url, token);
                if (result.status === 'success' && result.data && result.data.candles) {
                    const candles = result.data.candles.map(c => ({
                        timestamp: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
                    }));
                    newCandles.push(...candles);
                }
            } catch (e) {
                // Silently continue on individual date failures
            }

            // Small delay between API calls
            await new Promise(r => setTimeout(r, 300));
        }

        if (newCandles.length > 0) {
            // Merge and deduplicate
            const allData = [...existing, ...newCandles];
            const unique = {};
            for (const c of allData) {
                unique[String(c.timestamp)] = c;
            }
            const merged = Object.values(unique).sort(
                (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
            );
            fs.writeFileSync(masterPath, JSON.stringify(merged));
            totalCandles += newCandles.length;
            success++;
        }

        process.stdout.write(`\r[${i + 1}/${stocksArr.length}] ${s.symbol.padEnd(20)} +${newCandles.length} candles | Total: ${totalCandles} | OK: ${success} | Fail: ${failed}`);
    }

    console.log(`\n\nDone! Added ${totalCandles} candles across ${success} stocks.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
