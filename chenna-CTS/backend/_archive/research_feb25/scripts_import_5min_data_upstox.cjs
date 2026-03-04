/**
 * Import 5-Minute Data from Upstox API
 * 
 * Fetches 5-minute candle data for INTRADAY_BOOST and HIGH_POWERED_STOCKS categories
 * Period: Jan 2-20, 2026 (13 trading days)
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');
const prisma = new PrismaClient();

// Rate limiter - 1 request per second
class RateLimiter {
    constructor(intervalMs = 1000) {
        this.intervalMs = intervalMs;
        this.lastCall = 0;
    }

    async wait() {
        const now = Date.now();
        const elapsed = now - this.lastCall;
        if (elapsed < this.intervalMs) {
            await new Promise(r => setTimeout(r, this.intervalMs - elapsed));
        }
        this.lastCall = Date.now();
    }
}

const rateLimiter = new RateLimiter(1000);

// Get access token
async function getAccessToken() {
    const tokenPath = path.join(__dirname, '../auth/tokens.json');
    const data = await fs.readFile(tokenPath, 'utf8');
    const tokens = JSON.parse(data);
    if (!tokens.access_token) {
        throw new Error('No access token found. Please authenticate with Upstox first.');
    }
    return tokens.access_token;
}

// Fetch 1-minute data from Upstox
async function fetch1MinData(instrumentKey, fromDate, toDate, token) {
    await rateLimiter.wait();

    const from = fromDate;
    const to = toDate;
    const interval = '1minute'; // Upstox uses '1minute' for 1-min candles

    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${to}/${from}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upstox API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        if (result.status !== 'success' || !result.data || !result.data.candles) {
            if (result.status === 'error' && result.errors) {
                throw new Error(`Upstox error: ${JSON.stringify(result.errors)}`);
            }
            return [];
        }

        // Transform to our format
        const candles = result.data.candles.map(c => ({
            timestamp: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5],
            oi: c[6] || 0
        }));

        return candles;

    } catch (error) {
        console.error(`Error fetching ${instrumentKey}:`, error.message);
        throw error;
    }
}

// Save to cache
async function saveToCache(symbol, fromDate, toDate, data, interval = '1m') {
    try {
        await prisma.ohlcvCache.upsert({
            where: {
                symbol_interval_fromDate_toDate: {
                    symbol,
                    interval,
                    fromDate: new Date(fromDate),
                    toDate: new Date(toDate)
                }
            },
            create: {
                symbol,
                interval,
                fromDate: new Date(fromDate),
                toDate: new Date(toDate),
                data,
                source: 'upstox',
                expiresAt: null // Historical data never expires
            },
            update: {
                data,
                source: 'upstox',
                expiresAt: null
            }
        });
        return true;
    } catch (error) {
        console.error(`Error saving ${symbol} to cache:`, error.message);
        return false;
    }
}

// Get unique stocks from both categories
async function getIntradayStocks() {
    const categories = await prisma.category.findMany({
        where: {
            key: { in: ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'] }
        },
        include: {
            stocks: {
                include: { stock: true }
            }
        }
    });

    const stockMap = new Map();
    for (const cat of categories) {
        for (const sc of cat.stocks) {
            if (sc.stock && sc.stock.instrumentKey) {
                stockMap.set(sc.stock.symbol, {
                    symbol: sc.stock.symbol,
                    instrumentKey: sc.stock.instrumentKey
                });
            }
        }
    }

    return Array.from(stockMap.values());
}

// Main import function
async function importData(testMode = false) {
    console.log('='.repeat(60));
    console.log('TASK 2: Import 5-Minute Data from Upstox');
    console.log('='.repeat(60));

    const fromDate = '2026-01-02';
    const toDate = '2026-01-20';

    // Get access token
    let token;
    try {
        token = await getAccessToken();
        console.log('✓ Upstox token loaded');
    } catch (error) {
        console.error('❌ Failed to load token:', error.message);
        return;
    }

    // Get stocks
    const stocks = await getIntradayStocks();
    console.log(`✓ Found ${stocks.length} unique stocks`);

    if (testMode) {
        // Test with first 5 stocks only
        console.log('\n📋 TEST MODE: Processing first 5 stocks only\n');
    }

    const stocksToProcess = testMode ? stocks.slice(0, 5) : stocks;

    let successCount = 0;
    let errorCount = 0;
    let totalCandles = 0;

    console.log(`\n🚀 Starting import for ${stocksToProcess.length} stocks...`);
    console.log(`   Period: ${fromDate} to ${toDate}`);
    console.log(`   Interval: 5 minutes\n`);

    for (let i = 0; i < stocksToProcess.length; i++) {
        const stock = stocksToProcess[i];

        try {
            // Fetch 5-minute data
            const candles = await fetch1MinData(stock.instrumentKey, fromDate, toDate, token);

            if (candles.length > 0) {
                // Save to cache
                const saved = await saveToCache(stock.symbol, fromDate, toDate, candles, '5m');
                if (saved) {
                    successCount++;
                    totalCandles += candles.length;
                }
            } else {
                console.log(`  ⚠️ ${stock.symbol}: No candles returned`);
                errorCount++;
            }

            // Progress logging every 10 stocks
            if ((i + 1) % 10 === 0 || i === stocksToProcess.length - 1) {
                console.log(`  [${i + 1}/${stocksToProcess.length}] ${stock.symbol}: ${candles.length} candles ✓`);
            }

        } catch (error) {
            console.error(`  ❌ ${stock.symbol}: ${error.message}`);
            errorCount++;

            // Check for rate limit or auth errors
            if (error.message.includes('429') || error.message.includes('limit')) {
                console.log('  ⏳ Rate limited, waiting 60 seconds...');
                await new Promise(r => setTimeout(r, 60000));
            } else if (error.message.includes('401') || error.message.includes('unauthorized')) {
                console.error('\n❌ AUTHENTICATION ERROR - Token may be expired');
                break;
            }
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✓ Stocks imported: ${successCount}`);
    console.log(`✓ Total candles: ${totalCandles}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Avg candles/stock: ${successCount > 0 ? Math.round(totalCandles / successCount) : 0}`);
    console.log('='.repeat(60));

    return { successCount, totalCandles, errorCount };
}

// Run verification query
async function verifyImport() {
    console.log('\n📋 VERIFICATION: Checking imported data...\n');

    const result = await prisma.$queryRaw`
        SELECT 
            symbol,
            interval,
            from_date::text,
            to_date::text,
            jsonb_array_length(data) as candle_count
        FROM ohlcv_cache 
        WHERE interval = '5m'
        ORDER BY symbol
        LIMIT 20
    `;

    if (result.length === 0) {
        console.log('❌ No 5-minute data found after import');
    } else {
        console.log('✓ Sample of imported data:');
        console.table(result);
    }

    const total = await prisma.$queryRaw`
        SELECT 
            COUNT(DISTINCT symbol) as stocks,
            SUM(jsonb_array_length(data)) as total_candles
        FROM ohlcv_cache 
        WHERE interval = '5m'
    `;

    console.log('\n📊 Total imported:');
    console.log(`   Stocks: ${total[0]?.stocks || 0}`);
    console.log(`   Candles: ${total[0]?.total_candles || 0}`);
}

// CLI
const args = process.argv.slice(2);
const testMode = args.includes('--test') || args.includes('-t');
const verifyOnly = args.includes('--verify') || args.includes('-v');

if (verifyOnly) {
    verifyImport()
        .catch(console.error)
        .finally(() => prisma.$disconnect());
} else {
    importData(testMode)
        .then(() => verifyImport())
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}
