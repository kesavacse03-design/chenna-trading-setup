// Price Service with Smart Caching and Rate Limiting
// Handles Upstox historical data fetching for backtesting and live tracking

const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

// Rate limiter to avoid hitting API limits
class RateLimiter {
    constructor(requestsPerSecond = 1) {
        this.requestsPerSecond = requestsPerSecond;
        this.requestsThisMinute = 0;
        this.requestsToday = 0;
        this.lastRequestTime = 0;
        this.minuteStart = Date.now();
        this.dayStart = new Date().setHours(0, 0, 0, 0);
    }

    async waitIfNeeded() {
        const now = Date.now();

        // Reset minute counter if needed
        if (now - this.minuteStart >= 60000) {
            this.requestsThisMinute = 0;
            this.minuteStart = now;
        }

        // Reset daily counter if needed
        const todayStart = new Date().setHours(0, 0, 0, 0);
        if (todayStart > this.dayStart) {
            this.requestsToday = 0;
            this.dayStart = todayStart;
        }

        // Check daily limit (assuming 1000 per day)
        if (this.requestsToday >= 1000) {
            throw new Error('Daily API limit reached (1000 requests). Try tomorrow.');
        }

        // Check minute limit (60 requests/min)
        if (this.requestsThisMinute >= 60) {
            const waitTime = 60000 - (now - this.minuteStart);
            console.log(`[RateLimiter] Minute limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
            await this.sleep(waitTime);
            this.requestsThisMinute = 0;
            this.minuteStart = Date.now();
        }

        // Ensure minimum delay between requests
        const timeSinceLastRequest = now - this.lastRequestTime;
        const minDelay = 1000 / this.requestsPerSecond; // milliseconds

        if (timeSinceLastRequest < minDelay) {
            const waitTime = minDelay - timeSinceLastRequest;
            await this.sleep(waitTime);
        }

        this.lastRequestTime = Date.now();
        this.requestsThisMinute++;
        this.requestsToday++;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStats() {
        return {
            requestsThisMinute: this.requestsThisMinute,
            requestsToday: this.requestsToday
        };
    }
}

// Price Service
class PriceService {
    constructor() {
        this.rateLimiter = new RateLimiter(1); // 1 request per second
        this.tokenPath = path.join(__dirname, '../auth/tokens.json');
    }

    // Get access token from saved tokens
    async getAccessToken() {
        try {
            const data = await fs.readFile(this.tokenPath, 'utf8');
            const tokens = JSON.parse(data);

            if (!tokens.access_token) {
                throw new Error('No access token found. Please authenticate with Upstox first.');
            }

            return tokens.access_token;
        } catch (error) {
            throw new Error(`Failed to load Upstox token: ${error.message}`);
        }
    }

    // Fetch historical candles from Upstox
    async fetchFromUpstox(instrumentKey, fromDate, toDate, interval = 'day') {
        await this.rateLimiter.waitIfNeeded();

        const token = await this.getAccessToken();
        const from = new Date(fromDate).toISOString().split('T')[0];
        const to = new Date(toDate).toISOString().split('T')[0];

        const url = `https://api.upstox.com/v2/historical-candle/${instrumentKey}/${interval}/${to}/${from}`;

        console.log(`[PriceService] Fetching ${instrumentKey} from ${from} to ${to}...`);

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
                throw new Error(`Invalid response from Upstox: ${JSON.stringify(result)}`);
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

            console.log(`[PriceService] ✓ Fetched ${candles.length} candles`);
            return candles;

        } catch (error) {
            console.error(`[PriceService] Error fetching ${instrumentKey}:`, error.message);
            throw error;
        }
    }

    // Check if data exists in cache
    async getFromCache(symbol, fromDate, toDate, interval = 'day') {
        try {
            const cached = await prisma.ohlcvCache.findFirst({
                where: {
                    symbol,
                    interval,
                    fromDate: new Date(fromDate),
                    toDate: new Date(toDate)
                }
            });

            if (cached) {
                // Check if cache is expired
                if (cached.expiresAt && new Date() > cached.expiresAt) {
                    console.log(`[Cache] Expired cache for ${symbol}`);
                    return null;
                }

                console.log(`[Cache] ✓ Hit for ${symbol} (${fromDate} to ${toDate})`);
                return cached;
            }

            console.log(`[Cache] Miss for ${symbol} (${fromDate} to ${toDate})`);
            return null;
        } catch (error) {
            console.error('[Cache] Error reading cache:', error.message);
            return null;
        }
    }

    // Save data to cache
    async saveToCache(symbol, fromDate, toDate, data, interval = 'day', source = 'upstox') {
        try {
            // Set expiration: today's data expires in 15 minutes, historical data never expires
            const today = new Date().toISOString().split('T')[0];
            const expiresAt = toDate >= today ? new Date(Date.now() + 15 * 60 * 1000) : null;

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
                    source,
                    expiresAt
                },
                update: {
                    data,
                    expiresAt
                }
            });

            console.log(`[Cache] ✓ Saved ${symbol} (${fromDate} to ${toDate}), expires: ${expiresAt || 'never'}`);
        } catch (error) {
            console.error('[Cache] Error saving cache:', error.message);
        }
    }

    // Smart fetch with caching and delta updates
    async fetchPrice(symbol, instrumentKey, fromDate, toDate, interval = 'day') {
        // 1. Check full cache first
        const cached = await this.getFromCache(symbol, fromDate, toDate, interval);
        if (cached) {
            return cached.data;
        }

        // 2. Check if we have partial data (delta update scenario)
        const partialCache = await prisma.ohlcvCache.findFirst({
            where: {
                symbol,
                interval,
                fromDate: { lte: new Date(fromDate) },
                toDate: { lt: new Date(toDate) }
            },
            orderBy: { toDate: 'desc' }
        });

        if (partialCache) {
            // Delta update: fetch only missing data
            const nextDay = new Date(partialCache.toDate);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = nextDay.toISOString().split('T')[0];

            console.log(`[Delta] Cached until ${partialCache.toDate.toISOString().split('T')[0]}, fetching from ${nextDayStr}`);

            const newCandles = await this.fetchFromUpstox(instrumentKey, nextDayStr, toDate, interval);
            const fullData = [...partialCache.data, ...newCandles];

            // Save combined data
            await this.saveToCache(symbol, fromDate, toDate, fullData, interval);
            return fullData;
        }

        // 3. No cache - fetch everything
        console.log(`[Fetch] Full download for ${symbol} (${fromDate} to ${toDate})`);
        const data = await this.fetchFromUpstox(instrumentKey, fromDate, toDate, interval);

        // Save to cache
        await this.saveToCache(symbol, fromDate, toDate, data, interval);
        return data;
    }

    // Get rate limiter stats
    getRateLimitStats() {
        return this.rateLimiter.getStats();
    }

    // Bulk fetch for multiple stocks (used in backtesting)
    async fetchBulk(stocks, progressCallback) {
        const results = {};
        let processed = 0;

        for (const stock of stocks) {
            try {
                const data = await this.fetchPrice(
                    stock.symbol,
                    stock.instrumentKey,
                    stock.fromDate,
                    stock.toDate
                );
                results[stock.symbol] = { success: true, data };
                processed++;

                if (progressCallback) {
                    progressCallback({
                        symbol: stock.symbol,
                        progress: processed / stocks.length,
                        total: stocks.length,
                        processed
                    });
                }
            } catch (error) {
                results[stock.symbol] = { success: false, error: error.message };
                console.error(`[Bulk] Failed to fetch ${stock.symbol}:`, error.message);
            }
        }

        return results;
    }
}

module.exports = new PriceService();
