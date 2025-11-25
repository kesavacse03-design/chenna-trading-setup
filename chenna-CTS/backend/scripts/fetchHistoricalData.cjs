/**
 * Historical Data Fetcher
 * Fetches 200 days of OHLC data for all stocks in a category
 * Caches in ohlcv_cache table for pattern analysis
 */

const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

// Load environment variables
try {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (_) { }

const prisma = new PrismaClient();

// Token management
const TOKENS_FILE = path.join(__dirname, '../auth/tokens.json');

function readTokens() {
    try {
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch {
        return { access_token: null, refresh_token: null, expires_at: 0 };
    }
}

async function ensureAccessToken() {
    const t = readTokens();
    if (t.access_token && Date.now() < t.expires_at - 30000) {
        return t.access_token;
    }
    console.log('⚠️  Access token expired or missing');
    return null;
}

/**
 * Fetch historical candles from Upstox
 */
async function fetchCandles(symbol, instrumentKey, fromDate, toDate, token) {
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${toDate}/${fromDate}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'success' && data.data && data.data.candles) {
            return data.data.candles;
        }

        return [];
    } catch (error) {
        console.error(`  ❌ ${symbol}: ${error.message}`);
        return [];
    }
}

/**
 * Main function
 */
async function main() {
    const categoryKey = process.argv[2];

    if (!categoryKey) {
        console.error('Usage: node fetchHistoricalData.cjs <CATEGORY_KEY>');
        console.error('Example: node fetchHistoricalData.cjs DOWNSIDE_LOM_SWING');
        process.exit(1);
    }

    console.log(`\n🚀 Fetching historical data for category: ${categoryKey}\n`);

    // Get access token
    const token = await ensureAccessToken();
    if (!token) {
        console.error('❌ Not authenticated with Upstox. Run auth flow first.');
        process.exit(1);
    }

    // Get stocks for category
    const categoryStocks = await prisma.stockCategory.findMany({
        where: {
            category: { key: categoryKey }
        },
        include: {
            stock: true
        }
    });

    if (categoryStocks.length === 0) {
        console.error(`❌ No stocks found for category: ${categoryKey}`);
        process.exit(1);
    }

    console.log(`📊 Found ${categoryStocks.length} stocks in ${categoryKey}\n`);

    // Calculate date range (200 days back from today)
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - 200);

    const toDateStr = toDate.toISOString().split('T')[0];
    const fromDateStr = fromDate.toISOString().split('T')[0];

    console.log(`📅 Date range: ${fromDateStr} to ${toDateStr}\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Fetch candles for each stock
    for (let i = 0; i < categoryStocks.length; i++) {
        const sc = categoryStocks[i];
        const stock = sc.stock;
        const symbol = stock.symbol;

        console.log(`[${i + 1}/${categoryStocks.length}] Processing ${symbol}...`);

        // Check if already cached
        const existing = await prisma.ohlcvCache.findFirst({
            where: {
                symbol,
                interval: 'day',
                fromDate: new Date(fromDateStr),
                toDate: new Date(toDateStr)
            }
        });

        if (existing) {
            console.log(`  ✓ Already cached (${JSON.parse(existing.data).length} candles)`);
            skipCount++;
            continue;
        }

        // Get instrument key
        const instrumentKey = stock.instrumentKey;
        if (!instrumentKey) {
            console.log(`  ⚠️  No instrument key, skipping`);
            skipCount++;
            continue;
        }

        // Fetch candles
        const candles = await fetchCandles(symbol, instrumentKey, fromDateStr, toDateStr, token);

        if (candles.length === 0) {
            console.log(`  ❌ No data received`);
            errorCount++;
            continue;
        }

        // Transform candles to expected format
        const transformedCandles = candles.map(c => ({
            timestamp: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5] || 0
        }));

        // Cache in database
        await prisma.ohlcvCache.create({
            data: {
                symbol,
                interval: 'day',
                fromDate: new Date(fromDateStr),
                toDate: new Date(toDateStr),
                data: JSON.stringify(transformedCandles),
                source: 'upstox',
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            }
        });

        console.log(`  ✅ Cached ${transformedCandles.length} candles`);
        successCount++;

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n📊 Summary:`);
    console.log(`  ✅ Fetched: ${successCount}`);
    console.log(`  ⏭️  Skipped: ${skipCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`\n✨ Done!`);

    await prisma.$disconnect();
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
