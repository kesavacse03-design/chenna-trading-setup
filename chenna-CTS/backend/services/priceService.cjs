// Price Service with Smart Caching and Rate Limiting
// Handles Upstox historical data fetching for backtesting and live tracking

const { PrismaClient } = require('@prisma/client');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

/**
 * Convert Date to IST YYYY-MM-DD string.
 * toISOString() converts to UTC which shifts IST midnight to previous day.
 * Upstox uses IST timestamps, so all date comparisons must use IST.
 */
function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

// Rate limiter to avoid hitting API limits
class RateLimiter {
    constructor(requestsPerSecond = 1) {
        this.requestsPerSecond = requestsPerSecond;
        this.requestsThisMinute = 0;
        this.requestsToday = 0;
        this.lastRequestTime = 0;
        this.minuteStart = Date.now();
        this.dayStart = new Date().setHours(0, 0, 0, 0);
        this.dailyLimit = 10000;
        this.emergencyMode = false;
    }

    setEmergencyMode(enabled) {
        this.emergencyMode = enabled;
        console.warn(`[Limit] Emergency Mode ${enabled ? 'ENABLED' : 'DISABLED'} - API calls will be ${enabled ? 'blocked' : 'allowed'}`);
    }

    async waitIfNeeded() {
        if (this.emergencyMode) {
            throw new Error('API Emergency Mode: Calls blocked to prevent overage.');
        }

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
            console.log('[Limit] New day detected - resetting daily counter');
        }

        // Check daily limit (assuming 1000 per day)
        if (this.requestsToday >= this.dailyLimit) {
            throw new Error(`Daily API limit reached (${this.dailyLimit}). Try tomorrow.`);
        }

        // Warn at 80%
        if (this.requestsToday === Math.floor(this.dailyLimit * 0.8)) {
            console.warn(`[Limit] ⚠️ WARNING: 80% of daily API limit used (${this.requestsToday}/${this.dailyLimit})`);
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
            requestsToday: this.requestsToday,
            dailyLimit: this.dailyLimit,
            remaining: this.dailyLimit - this.requestsToday,
            emergencyMode: this.emergencyMode
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

    // Helper: Native HTTPS Request (Replaces node-fetch to avoid encoding issues)
    async makeHttpsRequest(url, token) {
        const MAX_RETRIES = 3;
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
            attempt++;
            try {
                return await new Promise((resolve, reject) => {
                    const urlObj = new URL(url);
                    const options = {
                        hostname: urlObj.hostname,
                        path: urlObj.pathname + urlObj.search,
                        method: 'GET',
                        agent: new https.Agent({ keepAlive: false }), // Disable keep-alive to avoid frequent resets
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json',
                            'User-Agent': 'Node.js/PriceService',
                            'Connection': 'close' // Explicitly close to be safe
                        }
                    };

                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                try {
                                    const json = JSON.parse(data);
                                    resolve(json);
                                } catch (e) {
                                    reject(new Error(`Invalid JSON: ${e.message}`));
                                }
                            } else {
                                // Create error with properties
                                const err = new Error(`Request failed with status ${res.statusCode}`);
                                err.statusCode = res.statusCode;
                                err.body = data; // Attach error body for debugging
                                reject(err);
                            }
                        });
                    });

                    req.on('error', (e) => {
                        reject(e);
                    });

                    // Set a reasonable timeout
                    req.setTimeout(10000, () => {
                        req.destroy(new Error('Request Limit Timeout'));
                    });

                    req.end();
                });
            } catch (error) {
                const isRetryable = error.code === 'ECONNRESET' || error.message.includes('Timeout') || (error.statusCode && error.statusCode >= 500);

                if (isRetryable && attempt < MAX_RETRIES) {
                    const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
                    console.log(`[PriceService] Attempt ${attempt} failed (${error.code || error.statusCode}). Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                // If not retryable or max retries reached
                throw error;
            }
        }
    }

    // Fetch historical candles from Upstox
    async fetchFromUpstox(instrumentKey, fromDate, toDate, interval = 'day', symbolHint = null) {
        const from = toISTDateString(fromDate);
        const to = toISTDateString(toDate);
        const today = toISTDateString(new Date());

        // 1. Local File Cache Logic
        const cleanKey = symbolHint || instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const cacheDir = path.join(__dirname, `../cache/${interval}`);

        // --- MASTER CACHE CHECK (BULK CACHE SUPPORT) ---
        // If a bulk cache file exists, use it to serve arbitrary date subsets without API calls.
        const masterCachePath = path.join(cacheDir, `${cleanKey}_master.json`);
        try {
            const masterDataStr = await fs.readFile(masterCachePath, 'utf8');
            const masterObj = JSON.parse(masterDataStr);
            const masterArray = Array.isArray(masterObj) ? masterObj : masterObj.data;

            if (masterArray && masterArray.length > 0) {
                const firstDate = String(masterArray[0].timestamp || masterArray[0].date).split('T')[0];
                const lastDate = String(masterArray[masterArray.length - 1].timestamp || masterArray[masterArray.length - 1].date).split('T')[0];

                // If the requested range falls within the bulk cached range, slice and return it!
                if (from >= firstDate) { // As long as we don't ask for data older than what we have
                    const filtered = masterArray.filter(c => {
                        const d = String(c.timestamp || c.date).split('T')[0];
                        return d >= from && d <= to;
                    });

                    if (filtered.length > 0) {
                        return filtered;
                    }
                }
            }
        } catch (e) {
            // Master cache miss, proceed to exact-match logic
        }

        const cacheKey = `${cleanKey}_${from}_${to}.json`;
        const cachePath = path.join(cacheDir, cacheKey);

        // Skip permanent cache for very recent data (last 3 days)
        const isRecent = (to >= today || from >= today || new Date(toDate).getTime() > Date.now() - 3 * 86400000);

        // Check cache first always
        try {
            const cachedDataStr = await fs.readFile(cachePath, 'utf8');
            const cacheObj = JSON.parse(cachedDataStr);

            // For recent data, the cache object will be stored as: { expires: timestamp, data: [...] }
            // For older permanent data (written previously), it's just the basic array [...]

            if (isRecent) {
                if (cacheObj.expires && Date.now() < cacheObj.expires) {
                    return cacheObj.data;
                }
                // If no expires field or expired, proceed to fetch
            } else {
                // If not recent but we have the array, return it directly
                // (or if it's stored in the new wrapped format with 'data')
                return Array.isArray(cacheObj) ? cacheObj : cacheObj.data;
            }
        } catch (e) {
            // Cache miss, proceed to fetch
        }

        const MAX_RETRIES = 3;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                await this.rateLimiter.waitIfNeeded();

                const token = await this.getAccessToken();

                // DETERMINE ENDPOINT
                // If requesting '1minute' data and range includes Today, use /intraday endpoint
                // which provides the last ~5 days including Live Data.
                let url;
                let isIntradayEndpoint = false;

                // Check if 'to' date reaches today or if 'from' is today
                // 'to' is usually exclusive, but logic often passes request covering today
                if (interval === '1minute' && (to >= today || from === today)) {
                    // Use Intraday Endpoint (No dates required)
                    // URL encoded manually to ensure pipe | is %7C
                    url = `https://api.upstox.com/v2/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/${interval}`;
                    isIntradayEndpoint = true;
                    if (attempt === 1) console.log(`[PriceService] Using INTRADAY endpoint for ${instrumentKey}`);
                } else {
                    // Standard Historical Endpoint
                    url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${to}/${from}`;
                }

                if (attempt === 1) {
                    // console.log(`[PriceService] Fetching ${instrumentKey} (${interval})...`);
                }

                // Use Native HTTPS
                const result = await this.makeHttpsRequest(url, token);

                if (result.status !== 'success' || !result.data || !result.data.candles) {
                    const msg = result.message || JSON.stringify(result);
                    if (result.error_code === 'UDAPI100011') {
                        console.error(`[PriceService] Invalid Instrument Key: ${instrumentKey}`);
                        return [];
                    }
                    throw new Error(`Invalid response from Upstox: ${msg}`);
                }

                // Transform to our format
                let candles = result.data.candles.map(c => ({
                    timestamp: c[0],
                    open: c[1],
                    high: c[2],
                    low: c[3],
                    close: c[4],
                    volume: c[5],
                    oi: c[6] || 0
                }));

                // If using Intraday endpoint, we might get more data than requested (last 5 days).
                // Filter to match requested range.
                if (isIntradayEndpoint) {
                    const fromTime = new Date(fromDate).getTime();
                    // 'to' date in fetchPrice is usually exclusive (up to)
                    const toTime = new Date(toDate).getTime();

                    candles = candles.filter(c => {
                        const t = new Date(c.timestamp).getTime();
                        return t >= fromTime && t < toTime;
                    });

                    // Sort
                    candles.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

                    console.log(`[PriceService] Intraday fetch filtered to ${candles.length} candles (Range: ${from} to ${to})`);
                }

                console.log(`[PriceService] ✓ Fetched ${candles.length} candles`);

                if (candles.length > 0) {
                    try {
                        await fs.mkdir(cacheDir, { recursive: true });
                        if (isRecent) {
                            // Expire in 6 hours for recent data cache
                            const cacheObject = {
                                expires: Date.now() + 6 * 3600 * 1000,
                                data: candles
                            };
                            await fs.writeFile(cachePath, JSON.stringify(cacheObject));
                        } else {
                            await fs.writeFile(cachePath, JSON.stringify(candles));
                        }
                    } catch (err) {
                        console.error('[LocalCache] Save failed:', err);
                    }
                }

                return candles;

            } catch (error) {
                // Error handling
                if (error.statusCode === 400 || (error.body && error.body.includes('UDAPI100011'))) {
                    console.error(`[PriceService] Invalid Key or Bad Request for ${instrumentKey}`);
                    return [];
                }

                console.error(`[PriceService] Attempt ${attempt} failed for ${instrumentKey}:`, error.message);

                if (attempt === MAX_RETRIES) {
                    throw error;
                }
                const delay = 1000 * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
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
            const today = toISTDateString(new Date());
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
        // VALIDATION: Ensure dates are valid
        if (isNaN(new Date(fromDate).getTime()) || isNaN(new Date(toDate).getTime())) {
            console.error(`[PriceService] Invalid dates for ${symbol}: ${fromDate} to ${toDate}`);
            return null;
        }

        // 1. Check full cache first
        const cached = await this.getFromCache(symbol, fromDate, toDate, interval);
        if (cached && cached.data && cached.data.length > 0) {
            // VALIDATION: Check if cached data actually matches the requested date range
            let firstCandleDate;
            try {
                if (!cached.data[0].timestamp) throw new Error('Missing timestamp');
                // CRITICAL: Use raw timestamp string split (IST), NOT toISOString (UTC)
                const ts = String(cached.data[0].timestamp);
                firstCandleDate = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
            } catch (e) {
                console.warn(`[Cache] Corrupted data for ${symbol}: ${e.message}`);
                // Treat as cache miss (optional: delete cache entry)
                return null;
            }

            // If data is older than requested date
            if (firstCandleDate < fromDate) {
                console.warn(`[Limit] Cache Corruption Detected! Data from ${firstCandleDate} found in key for ${fromDate}. Discarding.`);
                // Proceed to fetch fresh
            } else {
                const stats = this.rateLimiter.getStats();
                if (stats.emergencyMode || stats.remaining < 10) {
                    console.warn(`[Limit] Low/Zero budget - using CACHED data for ${symbol} (might be stale)`);
                    return cached.data;
                }
                return cached.data;
            }
        }

        // 2. Budget check for NEW fetch
        const stats = this.rateLimiter.getStats();
        if (stats.emergencyMode || stats.remaining <= 0) {
            console.error(`[Limit] BLOCKED: ${symbol} | Emergency: ${stats.emergencyMode} | Remaining: ${stats.remaining} | Daily: ${stats.dailyLimit} | Today: ${stats.requestsToday}`);
            return null;
        }

        // 3. Delta Update Logic (Disabled for 1minute to prevent bugs, kept for Day)
        let partialCache = null;
        if (interval !== '1minute') {
            partialCache = await prisma.ohlcvCache.findFirst({
                where: {
                    symbol,
                    interval,
                    fromDate: { lte: new Date(fromDate) },
                    toDate: { lt: new Date(toDate) }
                },
                orderBy: { toDate: 'desc' }
            });
        }

        if (partialCache) {
            // Delta update: fetch only missing data
            const nextDay = new Date(partialCache.toDate);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = toISTDateString(nextDay);

            console.log(`[Delta] Cached until ${toISTDateString(partialCache.toDate)}, fetching from ${nextDayStr}`);

            const newCandles = await this.fetchFromUpstox(instrumentKey, nextDayStr, toDate, interval);
            const fullData = [...partialCache.data, ...newCandles];

            // Save combined data
            await this.saveToCache(symbol, fromDate, toDate, fullData, interval);
            return fullData;
        }

        // 4. No cache - fetch everything
        // console.log(`[Fetch] Full download for ${symbol} (${fromDate} to ${toDate})`);
        const data = await this.fetchFromUpstox(instrumentKey, fromDate, toDate, interval);

        // Save to cache
        await this.saveToCache(symbol, fromDate, toDate, data, interval);
        return data;
    }

    // Get rate limiter stats
    getRateLimitStats() {
        return this.rateLimiter.getStats();
    }

    // Set emergency mode manually
    setEmergencyMode(enabled) {
        this.rateLimiter.setEmergencyMode(enabled);
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
