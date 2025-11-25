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
