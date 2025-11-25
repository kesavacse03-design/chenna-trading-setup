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

            // Fetch stocks for category with historical data
            const stocks = await prisma.stock.findMany({
                where: { categoryKey },
                include: {
                    historicalData: {
                        orderBy: { timestamp: 'asc' },
                        take: 200 // Get up to 200 days of history
                    }
                }
            });

            if (stocks.length === 0) {
                return res.status(404).json({
                    ok: false,
                    error: 'No stocks found for category',
                    categoryKey
                });
            }

            // Transform to format expected by generator
            const stocksWithData = stocks.map(stock => ({
                symbol: stock.symbol,
                historicalData: stock.historicalData.map(candle => ({
                    timestamp: candle.timestamp,
                    open: parseFloat(candle.open),
                    high: parseFloat(candle.high),
                    low: parseFloat(candle.low),
                    close: parseFloat(candle.close),
                    volume: parseInt(candle.volume) || 0
                }))
            })).filter(s => s.historicalData.length >= 50); // Minimum 50 days required

            if (stocksWithData.length === 0) {
                return res.status(400).json({
                    ok: false,
                    error: 'Insufficient historical data. Need at least 50 days per stock.',
                    categoryKey
                });
            }

            console.log(`[AutoGen] Processing ${stocksWithData.length} stocks with sufficient data`);

            // Generate strategy
            const generator = new AutoStrategyGenerator({
                minAccuracy: minAccuracy || 0.70,
                targetPercent: 2.5,
                stopLossPercent: 1.5,
                maxDays: 10
            });

            const result = await generator.generate(stocksWithData);

            console.log(`[AutoGen] Strategy generated: ${result.validation.accuracy.toFixed(2)}% accuracy`);

            // Format response
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
