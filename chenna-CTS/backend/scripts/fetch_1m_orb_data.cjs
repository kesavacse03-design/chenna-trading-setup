const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs'); // path relative to script

const prisma = new PrismaClient();

const CACHE_DIR = path.join(__dirname, '../cache/1minute');

async function main() {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

    // 1. Get unique stocks that appeared in INTRADAY_BOOST in the last 30 days
    const THIRTY_DAYS_AGO = new Date();
    THIRTY_DAYS_AGO.setDate(THIRTY_DAYS_AGO.getDate() - 30);

    const entries = await prisma.stockCategory.findMany({
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: { gte: THIRTY_DAYS_AGO }
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
    console.log(`Found ${stocksArr.length} unique stocks in INTRADAY_BOOST over the last 30 days.`);

    const todayStr = new Date().toISOString().split('T')[0];
    const fromStr = THIRTY_DAYS_AGO.toISOString().split('T')[0];

    console.log(`Fetching 1-minute data from ${fromStr} to ${todayStr}...`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < stocksArr.length; i++) {
        const s = stocksArr[i];
        const cleanKey = s.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
        const masterPath = path.join(CACHE_DIR, `${cleanKey}_master.json`);

        if (fs.existsSync(masterPath)) {
            skipped++;
            process.stdout.write(`\rProgress: ${i + 1}/${stocksArr.length} | Success: ${success} | Skipped: ${skipped} | Failed: ${failed}`);
            continue;
        }

        try {
            // Because 'priceService.fetchFromUpstox' fetches day-bound ranges correctly.
            // But if we hit limits, it auto delays.
            // Note: Upstox historical API might not allow 30 days of 1-minute data in a single call.
            // If it fails, we will know.
            const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(s.instrumentKey)}/1minute/${todayStr}/${fromStr}`;
            const token = await priceService.getAccessToken();
            await priceService.rateLimiter.waitIfNeeded();

            const result = await priceService.makeHttpsRequest(url, token);
            if (result.status === 'success' && result.data && result.data.candles) {
                const candles = result.data.candles.map(c => ({
                    timestamp: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
                })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // ascending

                fs.writeFileSync(masterPath, JSON.stringify(candles));
                success++;
            } else {
                failed++;
            }
        } catch (e) {
            failed++;
            console.error(`\nFailed for ${s.symbol}: ${e.message}`);
        }

        process.stdout.write(`\rProgress: ${i + 1}/${stocksArr.length} | Success: ${success} | Skipped: ${skipped} | Failed: ${failed}`);
    }

    console.log("\n\nDone parsing. 1-minute data cached.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
