// Redis Cache Service
// Provides caching layer for price data, backtests, and instrument mappings

const Redis = require('ioredis');

class CacheService {
    constructor() {
        // Initialize Redis client
        // For local development, connects to localhost:6379
        // For production, use REDIS_URL env variable
        const redisConfig = process.env.REDIS_URL
            ? process.env.REDIS_URL
            : {
                host: 'localhost',
                port: 6379,
                retryStrategy: (times) => {
                    if (times > 3) {
                        console.warn('[Cache] Redis connection failed after 3 retries, disabling cache');
                        return null; // Stop retrying
                    }
                    return Math.min(times * 100, 3000); // Exponential backoff
                }
            };

        this.redis = new Redis(redisConfig);
        this.enabled = false;

        this.redis.on('connect', () => {
            console.log('✅ [Cache] Redis connected');
            this.enabled = true;
        });

        this.redis.on('error', (err) => {
            console.warn('[Cache] Redis error, cache disabled:', err.message);
            this.enabled = false;
        });

        // TTL constants (in seconds)
        this.TTL = {
            PRICE_DATA: 3600,        // 1 hour
            BACKTEST: 86400,         // 24 hours
            INSTRUMENT: 604800,      // 1 week
            CATEGORY: 3600,          // 1 hour
            SIGNAL: 900,             // 15 minutes
        };
    }

    // ========== GENERIC CACHE METHODS ==========

    async get(key) {
        if (!this.enabled) return null;

        try {
            const data = await this.redis.get(key);
            if (!data) return null;

            return JSON.parse(data);
        } catch (error) {
            console.warn(`[Cache] Get error for key ${key}:`, error.message);
            return null;
        }
    }

    async set(key, value, ttl = 3600) {
        if (!this.enabled) return false;

        try {
            await this.redis.setex(key, ttl, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn(`[Cache] Set error for key ${key}:`, error.message);
            return false;
        }
    }

    async del(key) {
        if (!this.enabled) return false;

        try {
            await this.redis.del(key);
            return true;
        } catch (error) {
            console.warn(`[Cache] Delete error for key ${key}:`, error.message);
            return false;
        }
    }

    async flush() {
        if (!this.enabled) return false;

        try {
            await this.redis.flushdb();
            console.log('✅ [Cache] Cache flushed');
            return true;
        } catch (error) {
            console.warn('[Cache] Flush error:', error.message);
            return false;
        }
    }

    // ========== PRICE DATA CACHING ==========

    async getPriceData(symbol, interval, fromDate, toDate) {
        const key = `price:${symbol}:${interval}:${fromDate}:${toDate}`;
        return await this.get(key);
    }

    async setPriceData(symbol, interval, fromDate, toDate, candles) {
        const key = `price:${symbol}:${interval}:${fromDate}:${toDate}`;
        return await this.set(key, candles, this.TTL.PRICE_DATA);
    }

    // ========== BACKTEST RESULTS CACHING ==========

    async getBacktestResult(jobId) {
        const key = `backtest:${jobId}`;
        return await this.get(key);
    }

    async setBacktestResult(jobId, result) {
        const key = `backtest:${jobId}`;
        return await this.set(key, result, this.TTL.BACKTEST);
    }

    // ========== INSTRUMENT MAPPING CACHING ==========

    async getInstrument(symbol) {
        const key = `instrument:${symbol}`;
        return await this.get(key);
    }

    async setInstrument(symbol, instrumentData) {
        const key = `instrument:${symbol}`;
        return await this.set(key, instrumentData, this.TTL.INSTRUMENT);
    }

    async getAllInstruments() {
        const key = 'instruments:all';
        return await this.get(key);
    }

    async setAllInstruments(instruments) {
        const key = 'instruments:all';
        return await this.set(key, instruments, this.TTL.INSTRUMENT);
    }

    // ========== CATEGORY STOCKS CACHING ==========

    async getCategoryStocks(categoryKey) {
        const key = `category:${categoryKey}:stocks`;
        return await this.get(key);
    }

    async setCategoryStocks(categoryKey, stocks) {
        const key = `category:${categoryKey}:stocks`;
        return await this.set(key, stocks, this.TTL.CATEGORY);
    }

    async invalidateCategoryCache(categoryKey) {
        const key = `category:${categoryKey}:stocks`;
        return await this.del(key);
    }

    // ========== SIGNAL CACHING (for live tracking) ==========

    async getLatestSignal(symbol, category) {
        const key = `signal:${category}:${symbol}`;
        return await this.get(key);
    }

    async setLatestSignal(symbol, category, signalData) {
        const key = `signal:${category}:${symbol}`;
        return await this.set(key, signalData, this.TTL.SIGNAL);
    }

    // ========== STATS & MONITORING ==========

    async getStats() {
        if (!this.enabled) {
            return { enabled: false, message: 'Redis not connected' };
        }

        try {
            const info = await this.redis.info('stats');
            const dbSize = await this.redis.dbsize();

            return {
                enabled: true,
                dbSize,
                info: info.split('\r\n').reduce((acc, line) => {
                    const [key, value] = line.split(':');
                    if (key && value) acc[key] = value;
                    return acc;
                }, {})
            };
        } catch (error) {
            return { enabled: false, error: error.message };
        }
    }

    // ========== CLEANUP ==========

    async disconnect() {
        if (this.redis) {
            await this.redis.quit();
            console.log('✅ [Cache] Redis disconnected');
        }
    }
}

// Singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
