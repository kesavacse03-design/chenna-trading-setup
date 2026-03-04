/**
 * Auto-Strategy Generation API Routes
 * Modular endpoint for automatic strategy generation
 */

const { PrismaClient } = require('@prisma/client');
const AutoStrategyGenerator = require('../strategy/autoGenerator.cjs');
const TimeTravelEngine = require('../strategy/timeTravelEngine.cjs');
const V1BacktestEngine = require('../strategy/v1BacktestEngine.cjs');
const backtestResultsService = require('../services/backtestResultsService.cjs');
const strategyManager = require('../services/labs/strategyManager.cjs');

const prisma = new PrismaClient();

function registerAutoStrategyRoutes(app) {
    /**
     * GET /api/strategy/info/:categoryKey
     * Get strategy configuration for Time-Travel Backtest UI
     */
    app.get('/api/strategy/info/:categoryKey', async (req, res) => {
        try {
            const { categoryKey } = req.params;

            console.log(`[GET /api/strategy/info] Fetching strategy for: ${categoryKey}`);

            const strategyInfo = strategyManager.getStrategyInfo(categoryKey);

            if (!strategyInfo) {
                return res.json({
                    ok: true,
                    hasStrategy: false,
                    message: `No strategy configured for ${categoryKey}. Backtest will use default rules.`
                });
            }

            res.json({
                ok: true,
                hasStrategy: true,
                strategy: strategyInfo
            });

        } catch (error) {
            console.error('[GET /api/strategy/info] Error:', error);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

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

    /**
    /**
     * POST /api/categories/:categoryKey/promote-strategy
     * Promote a strategy to be the active V1 for a category
     */
    app.post('/api/categories/:categoryKey/promote-strategy', async (req, res) => {
        try {
            const { categoryKey } = req.params;
            let { strategyId } = req.body;

            console.log(`[POST /promote-strategy] Request for ${categoryKey}, strategyId: ${strategyId}`);

            // Find category
            const category = await prisma.category.findUnique({
                where: { key: categoryKey }
            });

            if (!category) {
                return res.status(404).json({ ok: false, error: 'Category not found' });
            }

            // GUNSHOT FIX: Auto-find V1 if no strategyId provided
            if (!strategyId) {
                console.log(`[POST /promote-strategy] No strategyId, finding V1 for ${categoryKey}...`);
                const v1Strategy = await prisma.strategy.findFirst({
                    where: {
                        categoryId: category.id,
                        version: 'V1'
                    },
                    orderBy: { createdAt: 'desc' }
                });

                if (!v1Strategy) {
                    return res.status(404).json({
                        ok: false,
                        error: 'No V1 strategy found. Run Time-Travel Backtest first.'
                    });
                }

                strategyId = v1Strategy.id;
                console.log(`[POST /promote-strategy] Found V1 strategy: ${strategyId}`);
            }

            // Unpromote all existing strategies for this category
            await prisma.strategy.updateMany({
                where: {
                    categoryId: category.id,
                    promoted: true
                },
                data: { promoted: false }
            });

            // Promote the specified strategy
            const promotedStrategy = await prisma.strategy.update({
                where: { id: strategyId },
                data: { promoted: true, updatedAt: new Date() }
            });

            console.log(`[POST /promote-strategy]  Promoted strategy ${strategyId} for ${categoryKey}`);

            res.json({
                ok: true,
                strategy: promotedStrategy
            });

        } catch (error) {
            console.error('[POST /promote-strategy] ERROR:', error);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    /**
     * POST /api/strategy/time-travel-backtest
     * Run comprehensive time-travel backtest with 200+ logic combinations
     * Tests institutional trap avoidance and discovers best strategies
     */
    app.post('/api/strategy/time-travel-backtest', async (req, res) => {
        try {
            const { categoryKey, quickMode = false, stockCount = 10, forceRefresh = false } = req.body;

            if (!categoryKey) {
                return res.status(400).json({ ok: false, error: 'categoryKey is required' });
            }

            console.log(`\n🔮 [Time-Travel] Starting comprehensive backtest for: ${categoryKey}`);
            console.log(`   Quick Mode: ${quickMode ? `ON (${stockCount} oldest stocks)` : 'OFF (all stocks)'}`);
            console.log(`   Force Refresh: ${forceRefresh ? 'ON (clearing cache)' : 'OFF (using cache)'}\n`);

            // Create engine instance
            const engine = new TimeTravelEngine();

            // Run backtest with quickMode option
            const results = await engine.runTimeTravelBacktest(categoryKey, null, { quickMode, stockCount, forceRefresh });

            console.log(`\n✅ [Time-Travel] Backtest complete!\n`);

            // Save results to storage and generate CSV
            const savedResults = await backtestResultsService.saveTimeTravelResults(categoryKey, results);

            console.log(`\n💾 Results saved:`);
            console.log(`   JSON: ${savedResults.jsonPath}`);
            console.log(`   CSV: ${savedResults.csvPath}`);

            // Return results with file paths
            res.json({
                ok: true,
                categoryKey,
                runId: savedResults.runId,
                stats: results.stats,
                top3: results.top3.map(r => ({
                    rank: results.top3.indexOf(r) + 1,
                    logic: r.logic.name,
                    score: parseFloat(r.score.toFixed(1)),
                    metrics: {
                        winRate: parseFloat(r.metrics.winRate.toFixed(1)),
                        expectancy: parseFloat(r.metrics.expectancy.toFixed(2)),
                        trades: r.metrics.tradeCount,
                        avgHolding: parseFloat(r.metrics.avgHolding.toFixed(1)),
                        trapAvoidance: parseFloat(r.metrics.trapAvoidanceRate.toFixed(1))
                    },
                    scoreBreakdown: r.scoreBreakdown
                })),
                v1Strategy: results.v1Strategy,
                files: {
                    json: savedResults.jsonPath,
                    csv: savedResults.csvPath
                },
                summary: savedResults.summary,
                message: 'Time-travel backtest completed and saved successfully'
            });

        } catch (error) {
            console.error('[POST /api/strategy/time-travel-backtest] Error:', error);
            console.error('[POST /api/strategy/time-travel-backtest] Stack:', error.stack);
            console.error('[POST /api/strategy/time-travel-backtest] Full error object:', JSON.stringify(error, null, 2));
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    /**
    /**
     * POST /api/categories/:categoryKey/promote-strategy
     * Promote a strategy to be the active V1 for a category
     */
    app.post('/api/categories/:categoryKey/promote-strategy', async (req, res) => {
        try {
            const { categoryKey } = req.params;
            let { strategyId } = req.body;

            console.log(`[POST /promote-strategy] Request for ${categoryKey}, strategyId: ${strategyId}`);

            // Find category
            const category = await prisma.category.findUnique({
                where: { key: categoryKey }
            });

            if (!category) {
                return res.status(404).json({ ok: false, error: 'Category not found' });
            }

            // GUNSHOT FIX: Auto-find V1 if no strategyId provided
            if (!strategyId) {
                console.log(`[POST /promote-strategy] No strategyId, finding V1 for ${categoryKey}...`);
                const v1Strategy = await prisma.strategy.findFirst({
                    where: {
                        categoryId: category.id,
                        version: 'V1'
                    },
                    orderBy: { createdAt: 'desc' }
                });

                if (!v1Strategy) {
                    return res.status(404).json({
                        ok: false,
                        error: 'No V1 strategy found. Run Time-Travel Backtest first.'
                    });
                }

                strategyId = v1Strategy.id;
                console.log(`[POST /promote-strategy] Found V1 strategy: ${strategyId}`);
            }

            // Unpromote all existing strategies for this category
            await prisma.strategy.updateMany({
                where: {
                    categoryId: category.id,
                    promoted: true
                },
                data: { promoted: false }
            });

            // Promote the specified strategy
            const promotedStrategy = await prisma.strategy.update({
                where: { id: strategyId },
                data: { promoted: true, updatedAt: new Date() }
            });

            console.log(`[POST /promote-strategy]  Promoted strategy ${strategyId} for ${categoryKey}`);

            res.json({
                ok: true,
                strategy: promotedStrategy
            });

        } catch (error) {
            console.error('[POST /promote-strategy] ERROR:', error);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    /**
     * POST /api/strategy/run-v1-backtest
     * Run backtest using promoted V1 strategy from database
     * Tests V1 on all stocks in category and generates detailed results
     */
    app.post('/api/strategy/run-v1-backtest', async (req, res) => {
        try {
            const { categoryKey } = req.body;

            if (!categoryKey) {
                return res.status(400).json({ ok: false, error: 'categoryKey is required' });
            }

            console.log(`\n🎯 [V1-Backtest] Starting for: ${categoryKey}\n`);

            // Create engine instance
            const engine = new V1BacktestEngine();

            // Run V1 backtest
            const results = await engine.runV1Backtest(categoryKey);

            console.log(`\n✅ [V1-Backtest] Complete!`);
            console.log(`   Trades: ${results.trades.length}`);
            console.log(`   Win Rate: ${results.metrics.winRate}%\n`);

            // Save results to CSV
            const savedResults = await backtestResultsService.saveRegularBacktestResults(
                categoryKey,
                {
                    name: results.v1Strategy.description,
                    version: 'V1',
                    exit: results.v1Strategy.rules.exit
                },
                results.trades.map(t => ({ symbol: t.symbol })),
                results.trades
            );

            console.log(`💾 Results saved:`);
            console.log(`   JSON: ${savedResults.jsonPath}`);
            console.log(`   CSV: ${savedResults.csvPath}\n`);

            // Return results
            res.json({
                ok: true,
                categoryKey,
                runId: savedResults.runId,
                backtest: {
                    accuracy: results.metrics.winRate / 100,
                    totalTrades: results.metrics.totalTrades,
                    netPnl: results.metrics.totalPnL,
                    expectancy: results.metrics.expectancy,
                    maxDrawdown: results.metrics.maxDrawdown
                },
                strategy: {
                    description: results.v1Strategy.description,
                    rules: results.v1Strategy.rules
                },
                files: {
                    json: savedResults.jsonPath,
                    csv: savedResults.csvPath
                },
                summary: savedResults.summary,
                message: 'V1 backtest completed successfully'
            });

        } catch (error) {
            console.error('[POST /api/strategy/run-v1-backtest] Error:', error);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    console.log('[Routes] Auto-strategy generation routes registered ✅');
    console.log('[Routes] Time-travel backtest endpoint registered ✅');
    console.log('[Routes] V1 backtest endpoint registered ✅');
}

module.exports = registerAutoStrategyRoutes;
