/**
 * LABS SERVICE - Creates TT-V1 (LabsRun) instead of V1 Strategy directly
 */

const BacktestEngine = require('../strategy/backtestEngine.cjs');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

class SimplifiedLabsService {
    /**
     * Run Labs - Creates TT-V1 record, not Strategy yet
     */
    async runSimplifiedLabs(categoryKey) {
        const prisma = new PrismaClient();

        try {
            // Get category
            const category = await prisma.category.findUnique({
                where: { key: categoryKey },
                include: { stocks: { include: { stock: true } } }
            });

            if (!category || category.stocks.length === 0) {
                throw new Error(`No stocks found for category ${categoryKey}`);
            }

            console.log(`[SimplifiedLabs] Testing ${categoryKey} (${category.stocks.length} stocks)`);

            // Run backtest to get data
            const engine = new BacktestEngine(categoryKey);
            const result = await engine.run();

            console.log(`[SimplifiedLabs] Backtest: ${result.totalTrades} trades, ${result.accuracy} accuracy`);

            // Parse accuracy correctly (it comes as "0.00%" string)
            const accuracyValue = typeof result.accuracy === 'string'
                ? parseFloat(result.accuracy.replace('%', ''))
                : parseFloat(result.accuracy);

            // Get next TT version number
            const existingRuns = await prisma.labsRun.findMany({
                where: { categoryKey },
                orderBy: { createdAt: 'desc' }
            });
            const nextTTVersion = `TT-V${existingRuns.length + 1}`;

            // Create LabsRun record (not Strategy yet!)
            const labsRunData = {
                id: uuidv4(),
                categoryKey,
                ttVersion: nextTTVersion,
                accuracy: accuracyValue,
                tradesTested: result.totalTrades,
                recommendedLogic: {
                    entry: ['breakout_up', 'volume_surge'],
                    exit: ['target_hit', 'stop_loss'],
                    trapAvoidance: []
                },
                entryConditions: { breakout_up: true, volume_surge: true },
                exitConditions: { target_hit: true, stop_loss: true },
                trapRules: {},
                cacheStatus: {
                    cached: 0,
                    uncached: category.stocks.length,
                    total: category.stocks.length
                },
                performanceMetrics: {
                    accuracy: accuracyValue / 100,
                    totalTrades: result.totalTrades,
                    avgProfit: parseFloat(result.avgProfit) || 0,
                    winRate: result.winningTrades / (result.totalTrades || 1)
                },
                promotedToVersionId: null  // Only field that exists (not 'promoted')
            };

            const labsRun = await prisma.labsRun.create({ data: labsRunData });

            console.log(`[SimplifiedLabs] ✅ Created ${nextTTVersion} (not promoted yet)`);

            // Check if V1 exists
            const existingV1 = await prisma.strategy.findFirst({
                where: {
                    categoryId: category.id,
                    version: 'V1'
                }
            });

            // Return results in format that frontend expects
            return {
                ok: true,
                runId: labsRun.id,
                ttVersion: nextTTVersion,
                categoryKey,
                accuracy: accuracyValue / 100,  // Convert to decimal for frontend
                totalTrades: result.totalTrades,
                recommendedLogic: labsRun.recommendedLogic,
                entry: labsRun.entryConditions,
                exit: labsRun.exitConditions,
                trapAvoidance: [],
                metrics: {
                    accuracy: accuracyValue / 100,
                    totalTrades: result.totalTrades,
                    pnl: parseFloat(result.avgProfit) * result.totalTrades || 0,
                    drawdown: 0,
                    winRate: result.winningTrades / (result.totalTrades || 1),
                    expectancy: parseFloat(result.avgProfit) || 0
                },
                pnl: parseFloat(result.avgProfit) * result.totalTrades || 0,
                drawdown: 0,
                winRate: result.winningTrades / (result.totalTrades || 1),
                expectancy: parseFloat(result.avgProfit) || 0,
                cacheStatus: labsRun.cacheStatus,
                cached: 0,
                uncached: category.stocks.length,
                total: category.stocks.length,
                totalStocks: category.stocks.length,
                processedStocks: result.totalStocks || category.stocks.length,
                promotionAllowed: accuracyValue >= 70,
                v1Exists: !!existingV1,
                message: accuracyValue >= 70
                    ? `✅ ${nextTTVersion} complete! Accuracy: ${accuracyValue}%. Ready to promote.`
                    : `⚠️ ${nextTTVersion} complete but accuracy ${accuracyValue}% < 70%. Cannot promote.`,
                usingRealData: true,
                dataSource: 'Upstox (cached)'
            };

        } finally {
            await prisma.$disconnect();
        }
    }
}

module.exports = new SimplifiedLabsService();
