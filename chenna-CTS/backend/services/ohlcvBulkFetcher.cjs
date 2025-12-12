/**
 * OHLCV Bulk Fetch Service
 * Fetches historical candle data for all category stocks
 * Uses Upstox API to get 200+ days of data
 */

const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const prisma = new PrismaClient();

class OhlcvBulkFetcher {
    constructor() {
        this.accessToken = process.env.UPSTOX_ACCESS_TOKEN;
        this.baseUrl = 'https://api.upstox.com/v2';
        this.rateLimitDelay = 500; // ms between requests
    }

    /**
     * Fetch OHLCV for a single symbol
     */
    async fetchSymbolOHLCV(symbol, instrumentKey, days = 200) {
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);

        const formattedFrom = fromDate.toISOString().split('T')[0];
        const formattedTo = toDate.toISOString().split('T')[0];

        try {
            const url = `${this.baseUrl}/historical-candle/${encodeURIComponent(instrumentKey)}/day/${formattedTo}/${formattedFrom}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.error(`Failed to fetch ${symbol}: ${response.status}`);
                return null;
            }

            const data = await response.json();
            if (data.status === 'success' && data.data?.candles) {
                return data.data.candles;
            }

            return null;
        } catch (error) {
            console.error(`Error fetching ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Save OHLCV to database cache
     */
    async saveToCache(symbol, candles, interval = 'day') {
        await prisma.ohlcvCache.upsert({
            where: {
                symbol_interval: { symbol, interval }
            },
            update: {
                data: candles,
                updatedAt: new Date()
            },
            create: {
                symbol,
                interval,
                data: candles
            }
        });
    }

    /**
     * Fetch OHLCV for all stocks in a category
     */
    async fetchCategoryOHLCV(categoryKey, days = 200) {
        console.log(`\n📊 Fetching ${days} days OHLCV for ${categoryKey}...`);

        // Get stocks for category
        const category = await prisma.category.findUnique({
            where: { key: categoryKey },
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        if (!category) {
            console.error(`Category ${categoryKey} not found`);
            return { success: false, error: 'Category not found' };
        }

        const stocks = category.stocks.map(sc => sc.stock);
        console.log(`   Found ${stocks.length} stocks\n`);

        let fetched = 0;
        let failed = 0;

        for (const stock of stocks) {
            try {
                // Get instrument key from database
                const instrument = await prisma.instrument.findFirst({
                    where: { tradingsymbol: stock.symbol }
                });

                if (!instrument) {
                    console.log(`   ⚠️  ${stock.symbol}: No instrument key`);
                    failed++;
                    continue;
                }

                const candles = await this.fetchSymbolOHLCV(stock.symbol, instrument.instrumentKey, days);

                if (candles && candles.length > 0) {
                    await this.saveToCache(stock.symbol, candles, 'day');
                    console.log(`   ✅ ${stock.symbol}: ${candles.length} candles`);
                    fetched++;
                } else {
                    console.log(`   ❌ ${stock.symbol}: No data`);
                    failed++;
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
            } catch (error) {
                console.error(`   ❌ ${stock.symbol}: ${error.message}`);
                failed++;
            }
        }

        console.log(`\n📈 Fetch complete: ${fetched} success, ${failed} failed\n`);
        return { success: true, fetched, failed, total: stocks.length };
    }

    /**
     * Fetch OHLCV for ALL categories
     */
    async fetchAllCategoriesOHLCV(days = 200) {
        console.log(`\n🚀 Bulk OHLCV Fetch: ${days} days for all categories\n`);

        const categories = await prisma.category.findMany({
            select: { key: true, name: true }
        });

        const results = [];
        for (const cat of categories) {
            const result = await this.fetchCategoryOHLCV(cat.key, days);
            results.push({ category: cat.key, ...result });
        }

        console.log(`\n✅ All categories processed\n`);
        return results;
    }
}

module.exports = new OhlcvBulkFetcher();

// CLI Usage: node ohlcvBulkFetcher.cjs CATEGORY_KEY 200
if (require.main === module) {
    const categoryKey = process.argv[2];
    const days = parseInt(process.argv[3]) || 200;

    if (!categoryKey) {
        console.log('Usage: node ohlcvBulkFetcher.cjs CATEGORY_KEY [DAYS]');
        console.log('Example: node ohlcvBulkFetcher.cjs DOWNSIDE_LOM_SWING 200');
        process.exit(1);
    }

    const fetcher = new OhlcvBulkFetcher();
    fetcher.fetchCategoryOHLCV(categoryKey, days).then(() => {
        console.log('Done!');
        process.exit(0);
    });
}
