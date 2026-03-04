/**
 * Fetch Intraday Data for PRE_MARKET Stocks
 * 
 * Uses Upstox intraday-candle API to fetch 1-minute data
 * Upstox provides intraday data for current day only (live market)
 * For historical intraday, we use historical-candle with 1minute interval
 */

const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const TOKENS_FILE = path.join(__dirname, '../auth/tokens.json');

// Rate limiting
const RATE_LIMIT_DELAY = 500; // ms between requests
const MAX_STOCKS = 50;       // Limit for testing

/**
 * Read Upstox tokens
 */
function readTokens() {
    try {
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch {
        return { access_token: null };
    }
}

/**
 * Get access token
 */
function getAccessToken() {
    const t = readTokens();
    if (t.access_token && Date.now() < t.expires_at - 30000) {
        return t.access_token;
    }
    return null;
}

/**
 * Fetch intraday historical candles from Upstox
 * 
 * @param {string} instrumentKey - Upstox instrument key
 * @param {string} interval - '1minute' | '5minute' | '15minute' | '30minute'
 * @param {string} toDate - YYYY-MM-DD
 * @param {string} fromDate - YYYY-MM-DD
 */
async function fetchIntradayCandles(instrumentKey, interval, toDate, fromDate) {
    const token = getAccessToken();
    if (!token) {
        throw new Error('No valid Upstox access token');
    }

    // Upstox historical-candle API supports intraday intervals
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toDate}/${fromDate}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
        },
        timeout: 30000
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();

    if (data.status === 'success' && data.data && data.data.candles) {
        return data.data.candles.map(c => ({
            timestamp: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5] || 0
        }));
    }

    return [];
}

/**
 * Get PRE_MARKET stocks with instrument keys
 */
async function getPreMarketStocks(limit = MAX_STOCKS) {
    const category = await prisma.category.findUnique({
        where: { key: 'PRE_MARKET' },
        include: {
            stocks: {
                include: { stock: true },
                take: limit
            }
        }
    });

    if (!category) {
        console.log('PRE_MARKET category not found');
        return [];
    }

    // Filter stocks that have instrument keys
    return category.stocks
        .filter(cs => cs.stock.instrumentKey)
        .map(cs => ({
            symbol: cs.stock.symbol,
            name: cs.stock.name,
            instrumentKey: cs.stock.instrumentKey
        }));
}

/**
 * Main function to fetch intraday data for PRE_MARKET stocks
 */
async function fetchIntradayForPreMarket() {
    console.log('\n' + '='.repeat(60));
    console.log('FETCHING INTRADAY DATA FOR PRE_MARKET STOCKS');
    console.log('='.repeat(60));

    // Check token
    const token = getAccessToken();
    if (!token) {
        console.log('\n❌ ERROR: No valid Upstox access token!');
        console.log('   Please authenticate with Upstox first.');
        console.log('   Run the OAuth flow at /api/auth/upstox/login\n');
        return;
    }
    console.log('✅ Valid Upstox token found');

    // Get stocks
    const stocks = await getPreMarketStocks(MAX_STOCKS);
    console.log(`\nFound ${stocks.length} PRE_MARKET stocks with instrument keys`);

    if (stocks.length === 0) {
        console.log('❌ No stocks with instrument keys found');
        return;
    }

    // Date range (last 5 trading days for intraday)
    // Upstox typically provides ~5-7 days of intraday history
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);

    const toDateStr = toDate.toISOString().split('T')[0];
    const fromDateStr = fromDate.toISOString().split('T')[0];

    console.log(`\nDate range: ${fromDateStr} to ${toDateStr}`);
    console.log('Interval: 1minute\n');

    let success = 0;
    let failed = 0;
    let totalCandles = 0;

    for (const stock of stocks) {
        process.stdout.write(`Fetching ${stock.symbol}... `);

        try {
            const candles = await fetchIntradayCandles(
                stock.instrumentKey,
                '1minute',
                toDateStr,
                fromDateStr
            );

            if (candles.length > 0) {
                // Cache in database
                await prisma.ohlcvCache.upsert({
                    where: {
                        symbol_interval_fromDate_toDate: {
                            symbol: stock.symbol,
                            interval: '1minute',
                            fromDate: new Date(fromDateStr),
                            toDate: new Date(toDateStr)
                        }
                    },
                    update: {
                        data: JSON.stringify(candles),
                        createdAt: new Date(),
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day expiry for intraday
                    },
                    create: {
                        symbol: stock.symbol,
                        interval: '1minute',
                        fromDate: new Date(fromDateStr),
                        toDate: new Date(toDateStr),
                        data: JSON.stringify(candles),
                        source: 'upstox-intraday',
                        createdAt: new Date(),
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                    }
                });

                console.log(`✅ ${candles.length} candles`);
                success++;
                totalCandles += candles.length;
            } else {
                console.log('⚠️ No data returned');
                failed++;
            }
        } catch (error) {
            console.log(`❌ ${error.message}`);
            failed++;
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    console.log('\n' + '='.repeat(60));
    console.log('FETCH COMPLETE');
    console.log('='.repeat(60));
    console.log(`Success: ${success} stocks`);
    console.log(`Failed:  ${failed} stocks`);
    console.log(`Total candles fetched: ${totalCandles}`);

    if (success > 0) {
        console.log('\n✅ Intraday data now available for PRE_MARKET analysis!');
        console.log('   Run: node analysis/premarket_deep_analysis.cjs');
    }
}

// Run
fetchIntradayForPreMarket()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
