/**
 * PROFESSIONAL Live Price Service - GUNSHOT FIX
 * Fetches and caches LTP from Upstox API with bulletproof error handling
 */

const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const marketHours = require('../utils/marketHours.cjs');

const prisma = new PrismaClient();
const TOKENS_PATH = path.join(__dirname, '../auth/tokens.json');
const CACHE_FILE = path.join(__dirname, '../cache/live_prices.json');
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

class LivePriceService {
    constructor() {
        this.priceCache = new Map(); // symbol -> {ltp, instrumentKey, updatedAt}
        this.lastUpdate = null;
        this.isUpdating = false;
        this.updateInterval = UPDATE_INTERVAL;
    }

    async getAccessToken() {
        try {
            const data = await fs.readFile(TOKENS_PATH, 'utf8');
            const tokens = JSON.parse(data);
            if (!tokens.access_token) throw new Error('No access_token in tokens.json');
            return tokens.access_token;
        } catch (error) {
            console.error('[LivePrice] Token error:', error.message);
            return null;
        }
    }

    async fetchLTP(instrumentKeys) {
        const token = await this.getAccessToken();
        if (!token) return {};

        try {
            const url = `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${instrumentKeys.join(',')}`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                console.log(`[LivePrice] API error: ${response.status}`);
                return {};
            }

            const data = await response.json();
            const prices = {};

            if (data.data) {
                for (const [key, value] of Object.entries(data.data)) {
                    if (value.last_price) {
                        prices[key] = {
                            ltp: value.last_price,
                            instrumentKey: value.instrument_token || key,
                            timestamp: new Date().toISOString()
                        };
                    }
                }
            }

            return prices;
        } catch (error) {
            console.error('[LivePrice] Fetch error:', error.message);
            return {};
        }
    }

    async updateAllPrices() {
        //Check if market is open
        const marketStatus = marketHours.isMarketOpen();
        if (!marketStatus.open) {
            console.log(`[LivePrice] ⏸️  Market CLOSED (${marketStatus.reason}) - skipping update`);
            this.isUpdating = false;
            return;
        }

        if (this.isUpdating) return;

        this.isUpdating = true;
        console.log('[LivePrice] 📈 Market OPEN - Starting update...');

        try {
            // ✅ ONLY fetch stocks from categories with livePriceEnabled=true
            const stocks = await prisma.stock.findMany({
                where: {
                    categories: {
                        some: {
                            category: {
                                livePriceEnabled: true  // ← Filter by enabled categories!
                            }
                        }
                    }
                },
                select: { symbol: true, instrumentKey: true }
            });

            if (stocks.length === 0) {
                console.log('[LivePrice] No stocks in enabled categories');
                this.isUpdating = false;
                return;
            }

            console.log(`[LivePrice] Found ${stocks.length} stocks in ENABLED categories`);

            // Build lookup map
            const stockMap = new Map();
            for (const stock of stocks) {
                if (stock.instrumentKey) {
                    stockMap.set(stock.instrumentKey, stock);
                }
            }
            console.log(`[LivePrice] Created stockMap with ${stockMap.size} entries`);

            // Fetch prices in batches
            const BATCH_SIZE = 100;
            const allPrices = {};

            for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
                const batch = stocks.slice(i, i + BATCH_SIZE);
                const keys = batch.map(s => s.instrumentKey).filter(Boolean);

                if (keys.length > 0) {
                    const batchPrices = await this.fetchLTP(keys);
                    Object.assign(allPrices, batchPrices);
                    console.log(`[LivePrice] Batch ${Math.floor(i / BATCH_SIZE) + 1}: Fetched ${Object.keys(batchPrices).length} prices`);

                    if (i + BATCH_SIZE < stocks.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }

            console.log(`[LivePrice] Total fetched: ${Object.keys(allPrices).length} prices`);

            // Cache prices
            let cached = 0;
            let notFound = 0;

            for (const [requestKey, priceData] of Object.entries(allPrices)) {
                // Use instrument_token from response for matching
                const instrumentKey = priceData.instrumentKey || requestKey;
                const stock = stockMap.get(instrumentKey);

                if (stock && priceData.ltp) {
                    this.priceCache.set(stock.symbol, {
                        ltp: priceData.ltp,
                        instrumentKey,
                        updatedAt: new Date().toISOString()
                    });
                    cached++;
                } else {
                    notFound++;
                    if (notFound <= 5) {
                        console.log(`[LivePrice] Not found: ${instrumentKey}`);
                    }
                }
            }

            this.lastUpdate = new Date();
            await this.saveCache();

            console.log(`[LivePrice] ✅ Cached ${cached} prices (${notFound} not found)`);
            console.log(`[LivePrice] Total in cache: ${this.priceCache.size}`);

        } catch (error) {
            console.error('[LivePrice] Update failed:', error.message);
        } finally {
            this.isUpdating = false;
        }
    }

    async saveCache() {
        try {
            const cacheDir = path.dirname(CACHE_FILE);
            await fs.mkdir(cacheDir, { recursive: true });

            const cacheData = {
                lastUpdate: this.lastUpdate?.toISOString(),
                prices: Array.from(this.priceCache.entries()).map(([symbol, data]) => ({
                    symbol,
                    ...data
                }))
            };

            await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
        } catch (error) {
            console.error('[LivePrice] Cache save error:', error.message);
        }
    }

    async loadCache() {
        try {
            const data = await fs.readFile(CACHE_FILE, 'utf8');
            const cacheData = JSON.parse(data);

            if (cacheData.prices) {
                for (const item of cacheData.prices) {
                    this.priceCache.set(item.symbol, {
                        ltp: item.ltp,
                        instrumentKey: item.instrumentKey,
                        updatedAt: item.updatedAt
                    });
                }
                this.lastUpdate = cacheData.lastUpdate ? new Date(cacheData.lastUpdate) : null;
                console.log(`[LivePrice] Loaded ${this.priceCache.size} prices from cache`);
            }
        } catch (error) {
            console.log('[LivePrice] No cache file, will create on first update');
        }
    }

    getPrice(symbol) {
        return this.priceCache.get(symbol) || null;
    }

    getAllPrices() {
        const prices = {};
        for (const [symbol, data] of this.priceCache.entries()) {
            prices[symbol] = data;
        }

        const marketStatus = marketHours.getMarketStatusMessage();

        return {
            ok: true,
            prices,
            lastUpdate: this.lastUpdate?.toISOString(),
            totalStocks: this.priceCache.size,
            marketStatus: marketStatus
        };
    }

    async start() {
        console.log('[LivePrice] 🚀 Starting service...');
        console.log(`[LivePrice] Update interval: ${this.updateInterval / 60000} minutes`);

        await this.loadCache();
        await this.updateAllPrices();

        this.intervalId = setInterval(async () => {
            await this.updateAllPrices();
        }, this.updateInterval);

        console.log('[LivePrice] ✅ Service ready');
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            console.log('[LivePrice] Service stopped');
        }
    }

    setUpdateInterval(minutes) {
        this.updateInterval = minutes * 60 * 1000;
        console.log(`[LivePrice] Interval changed to ${minutes} minutes`);

        if (this.intervalId) {
            this.stop();
            this.start();
        }
    }
}

module.exports = new LivePriceService();
