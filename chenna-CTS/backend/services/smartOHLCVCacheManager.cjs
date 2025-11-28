/**
 * Smart OHLCV Data Cache Manager
 * 
 * Automatically ensures OHLCV data is available and fresh
 * Integrated into backtesting workflow
 * 
 * Features:
 * - Auto-detects missing data
 * - Fetches data intelligently
 * - Validates data sufficiency
 * - Handles failures gracefully
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fetch = require('node-fetch');

class SmartOHLCVCacheManager {

    constructor(options = {}) {
        this.minCandles = options.minCandles || 50;
        this.maxAge = options.maxAgeDays || 7; // Refresh if older than 7 days
        this.apiBase = options.apiBase || 'http://localhost:3001';
    }

    /**
     * Ensure category has sufficient OHLCV data
     * Auto-fetches if missing
     */
    async ensureDataForCategory(categoryKey) {
        console.log(`\n🔍 Checking OHLCV data for ${categoryKey}...`);

        // Get all stocks in category
        const categoryStocks = await prisma.stockCategory.findMany({
            where: { category: { key: categoryKey } },
            include: { stock: true }
        });

        if (categoryStocks.length === 0) {
            throw new Error(`No stocks found in category: ${categoryKey}`);
        }

        console.log(`   Stocks in category: ${categoryStocks.length}`);

        // Check cache status for each stock
        const dataStatus = await this.checkDataStatus(categoryStocks.map(cs => cs.stock));

        console.log(`   ✅ With data: ${dataStatus.withData.length}`);
        console.log(`   ❌ Missing: ${dataStatus.missing.length}`);
        console.log(`   🔄 Stale: ${dataStatus.stale.length}`);

        // Auto-fetch missing/stale data
        if (dataStatus.missing.length > 0 || dataStatus.stale.length > 0) {
            const needsFetch = [
                ...dataStatus.missing,
                ...dataStatus.stale
            ];

            console.log(`\n🚀 Auto-fetching data for ${needsFetch.length} stocks...`);

            await this.fetchMissingData(needsFetch);

            // Re-check after fetch
            const newStatus = await this.checkDataStatus(categoryStocks.map(cs => cs.stock));
            console.log(`\n✅ After fetch: ${newStatus.withData.length}/${categoryStocks.length} stocks ready`);
        }

        return {
            total: categoryStocks.length,
            ready: dataStatus.withData.length,
            fetched: dataStatus.missing.length + dataStatus.stale.length,
            sufficient: dataStatus.withData.length >= Math.min(10, categoryStocks.length * 0.5)
        };
    }

    /**
     * Check data status for stocks
     */
    async checkDataStatus(stocks) {
        const withData = [];
        const missing = [];
        const stale = [];

        for (const stock of stocks) {
            const cached = await prisma.ohlcvCache.findFirst({
                where: {
                    symbol: stock.symbol,
                    interval: 'day'
                },
                orderBy: { createdAt: 'desc' }
            });

            if (!cached) {
                missing.push(stock);
                continue;
            }

            // Check if data is sufficient
            const candles = Array.isArray(cached.data) ? cached.data : [];
            if (candles.length < this.minCandles) {
                missing.push(stock);
                continue;
            }

            // Check if data is fresh
            const ageInDays = (Date.now() - new Date(cached.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays > this.maxAge) {
                stale.push(stock);
                continue;
            }

            withData.push(stock);
        }

        return { withData, missing, stale };
    }

    /**
     * Fetch missing OHLCV data
     */
    async fetchMissingData(stocks) {
        const results = {
            success: [],
            failed: []
        };

        // Limit to 20 stocks at a time to avoid overwhelming API
        const batch = stocks.slice(0, 20);

        if (batch.length < stocks.length) {
            console.log(`   ⚠️ Limiting to first 20 stocks (total: ${stocks.length})`);
        }

        for (let i = 0; i < batch.length; i++) {
            const stock = batch[i];

            try {
                console.log(`   [${i + 1}/${batch.length}] Fetching ${stock.symbol}...`);

                const success = await this.fetchStockData(stock.symbol);

                if (success) {
                    results.success.push(stock.symbol);
                } else {
                    results.failed.push(stock.symbol);
                }

                // Add delay to avoid rate limiting
                if (i < batch.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } catch (error) {
                console.error(`   ❌ ${stock.symbol}: ${error.message}`);
                results.failed.push(stock.symbol);
            }
        }

        console.log(`\n   ✅ Success: ${results.success.length}`);
        console.log(`   ❌ Failed: ${results.failed.length}`);

        return results;
    }

    /**
     * Fetch data for single stock
     */
    async fetchStockData(symbol) {
        try {
            // Try to use existing cache endpoint
            const response = await fetch(`${this.apiBase}/api/ohlcv/cache`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol,
                    interval: 'day'
                })
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const result = await response.json();
            return result.success || result.ok;

        } catch (error) {
            // If API not available, try direct Upstox fetch
            try {
                await this.fetchFromUpstoxDirect(symbol);
                return true;
            } catch (directError) {
                throw new Error(`Both API and direct fetch failed: ${error.message}`);
            }
        }
    }

    /**
     * Direct Upstox fetch (fallback)
     */
    async fetchFromUpstoxDirect(symbol) {
        // This would need Upstox API credentials
        // For now, just log and skip
        console.log(`      ⚠️ Direct Upstox fetch not configured for ${symbol}`);
        return false;
    }

    /**
     * Get cache summary
     */
    async getCacheSummary() {
        const entries = await prisma.ohlcvCache.findMany({
            where: { interval: 'day' }
        });

        const symbolStats = {};

        for (const entry of entries) {
            if (!symbolStats[entry.symbol]) {
                symbolStats[entry.symbol] = {
                    candles: 0,
                    lastUpdate: entry.createdAt
                };
            }

            const candles = Array.isArray(entry.data) ? entry.data : [];
            symbolStats[entry.symbol].candles = Math.max(
                symbolStats[entry.symbol].candles,
                candles.length
            );
        }

        const symbols = Object.values(symbolStats);

        return {
            totalEntries: entries.length,
            totalSymbols: symbols.length,
            sufficient: symbols.filter(s => s.candles >= this.minCandles).length,
            insufficient: symbols.filter(s => s.candles < this.minCandles).length
        };
    }
}

module.exports = SmartOHLCVCacheManager;
