/**
 * Historical Data Auto-Fetch Service
 * 
 * Provides a reusable function for Labs to fetch missing historical data.
 * Called automatically when a stock has insufficient candle data.
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
const TOKENS_FILE = path.join(__dirname, '../auth/tokens.json');

/**
 * Read Upstox tokens from file
 */
function readTokens() {
    try {
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch {
        return { access_token: null, refresh_token: null, expires_at: 0 };
    }
}

/**
 * Get valid access token
 */
function getAccessToken() {
    const t = readTokens();
    if (t.access_token && Date.now() < t.expires_at - 30000) {
        return t.access_token;
    }
    return null;
}

/**
 * Fetch historical candles for a single symbol from Upstox
 * 
 * @param {string} symbol - Stock symbol (e.g., "NTPC")
 * @param {number} days - Number of days to fetch (default 90)
 * @returns {Promise<Array>} Array of candle objects or empty array on failure
 */
async function fetchHistoricalForSymbol(symbol, days = 90) {
    console.log(`   ↳ Auto-fetching ${days}-day historical data for ${symbol}...`);

    // Get access token
    const token = getAccessToken();
    if (!token) {
        console.log(`   ❌ No valid Upstox token - cannot auto-fetch`);
        return [];
    }

    // Find stock and instrument key
    const stock = await prisma.stock.findFirst({ where: { symbol } });
    if (!stock || !stock.instrumentKey) {
        console.log(`   ❌ No instrument key found for ${symbol}`);
        return [];
    }

    // Calculate date range
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - days);

    const toDateStr = toDate.toISOString().split('T')[0];
    const fromDateStr = fromDate.toISOString().split('T')[0];

    // Fetch from Upstox
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(stock.instrumentKey)}/day/${toDateStr}/${fromDateStr}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        if (!response.ok) {
            console.log(`   ❌ HTTP ${response.status} fetching ${symbol}`);
            return [];
        }

        const data = await response.json();

        if (data.status === 'success' && data.data && data.data.candles) {
            const rawCandles = data.data.candles;

            // Transform to expected format
            const candles = rawCandles.map(c => ({
                timestamp: c[0],
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
                volume: c[5] || 0
            }));

            console.log(`   ✅ Fetched ${candles.length} candles for ${symbol}`);

            // Cache in ohlcvCache for future use
            try {
                await prisma.ohlcvCache.upsert({
                    where: {
                        symbol_interval_fromDate_toDate: {
                            symbol,
                            interval: 'day',
                            fromDate: new Date(fromDateStr),
                            toDate: new Date(toDateStr)
                        }
                    },
                    update: {
                        data: JSON.stringify(candles),
                        createdAt: new Date(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    },
                    create: {
                        symbol,
                        interval: 'day',
                        fromDate: new Date(fromDateStr),
                        toDate: new Date(toDateStr),
                        data: JSON.stringify(candles),
                        source: 'upstox-autofetch',
                        createdAt: new Date(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    }
                });
            } catch (cacheErr) {
                // Non-critical error, candles still returned
                console.log(`   ⚠️ Could not cache: ${cacheErr.message}`);
            }

            return candles;
        }

        console.log(`   ❌ No candles in response for ${symbol}`);
        return [];
    } catch (error) {
        console.log(`   ❌ Fetch error for ${symbol}: ${error.message}`);
        return [];
    }
}

module.exports = {
    fetchHistoricalForSymbol,
    getAccessToken
};
