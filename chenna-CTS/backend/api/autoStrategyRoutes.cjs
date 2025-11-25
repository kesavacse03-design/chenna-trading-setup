/**
 * Auto-Strategy Generation API Routes
 * Modular endpoint for automatic strategy generation
 */

const { PrismaClient } = require('@prisma/client');
const AutoStrategyGenerator = require('../strategy/autoGenerator.cjs');

const prisma = new PrismaClient();

function registerAutoStrategyRoutes(app) {
    /**
     * POST /api/strategy/auto-generate
     * Auto-generate optimized trading strategy for a category
     */
    app.post('/api/strategy/auto-generate', async (req, res) => {
        try {
            const { categoryKey, minAccuracy, mode } = req.body;

            if (!categoryKey) {
                return res.status(400).json({ ok: false, error: 'categoryKey is required' });
            }

            console.log(`[POST /api/strategy/auto-generate] Generating strategy for ${categoryKey}`);

            // Step 1: Fetch stocks for category
            const categoryStocks = await prisma.stockCategory.findMany({
                where: {
                    category: { key: categoryKey }
                },
                include: {
                    stock: true
                }
            });

            if (categoryStocks.length === 0) {
                return res.status(404).json({
                    ok: false,
                    error: 'No stocks found for category',
                    categoryKey
                });
            }

            console.log(`[AutoGen] Found ${categoryStocks.length} stocks in category`);

            // Step 2: Fetch historical data from OhlcvCache for each stock
            const stocksWithData = [];

            for (const sc of categoryStocks) {
                const symbol = sc.stock.symbol;

                // Get most recent cached data (day interval)
                const cachedData = await prisma.ohlcvCache.findFirst({
                    where: {
                        symbol,
                        interval: 'day'
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                if (!cachedData || !cachedData.data) {
                    console.log(`[AutoGen] No cached data for ${symbol}, skipping`);
                    continue;
                }

                // Parse candle data
                const candles = Array.isArray(cachedData.data) ? cachedData.data : [];

                if (candles.length < 50) {
                    console.log(`[AutoGen] Insufficient data for ${symbol} (${candles.length} candles), skipping`);
                    continue;
                }

                // Transform to expected format
                const historicalData = candles.map(c => ({
                    timestamp: c.timestamp || c[0],
                    open: parseFloat(c.open || c[1]),
                    high: parseFloat(c.high || c[2]),
                    low: parseFloat(c.low || c[3]),
                    close: parseFloat(c.close || c[4]),
                    volume: parseInt(c.volume || c[5]) || 0
                })).filter(c => !isNaN(c.open) && !isNaN(c.close));

                if (historicalData.length >= 50) {
                    stocksWithData.push({
                        symbol,
                        historicalData: historicalData.slice(0, 200) // Use last 200 candles
                    });
                }
            }

            if (stocksWithData.length === 0) {
                return res.status(400).json({
                    ok: false,
                    error: 'Insufficient historical data. Need at least 50 days per stock.',
                    categoryKey
                });
            }

            console.log(`[AutoGen] Processing ${stocksWithData.length} stocks with sufficient data`);

            // Step 3: Generate strategy
            const generator = new AutoStrategyGenerator({
                minAccuracy: minAccuracy || 0.70,
                targetPercent: 2.5,
                stopLossPercent: 1.5,
                maxDays: 10
            });

            const result = await generator.generate(stocksWithData);

            console.log(`[AutoGen] Strategy generated: ${result.validation.accuracy.toFixed(2)}% accuracy`);

            // Step 4: Format response
            res.json({
                ok: true,
                version: 'v1',
                strategy: result.strategy,
                backtest: {
                    accuracy: result.validation.accuracy,
                    totalTrades: result.validation.totalTrades,
                    netPnl: result.validation.netPnl,
                    expectancy: result.validation.expectancy,
                    maxDrawdown: result.validation.maxDrawdown,
                    avgRMultiple: result.validation.avgRMultiple
                },
                breakdown: {
                    successful: result.validation.successful,
                    failed: result.validation.failed,
                    sideways: result.validation.sideways
                },
                generatedAt: new Date().toISOString()
            });

        } catch (error) {
            console.error('[POST /api/strategy/auto-generate] Error:', error);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    console.log('[Routes] Auto-strategy generation routes registered ✅');
}

module.exports = registerAutoStrategyRoutes;
