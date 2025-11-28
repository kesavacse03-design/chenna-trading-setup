/**
 * Time-Travel V2 API Routes
 * 
 * Endpoints for running time-travel backtest and generating V1 strategies
 */

const express = require('express');
const router = express.Router();

const TimeTravelBacktesterV2 = require('../strategy/timeTravelBacktesterV2.cjs');
const V1StrategyGenerator = require('../strategy/v1Generator.cjs');

/**
 * POST /api/backtest/time-travel-v2
 * Run time-travel backtest and generate V1 strategy
 */
router.post('/time-travel-v2', async (req, res) => {
    try {
        const { categoryKey } = req.body;

        if (!categoryKey) {
            return res.status(400).json({
                success: false,
                error: 'categoryKey is required'
            });
        }

        console.log(`\n🚀 Starting Time-Travel V2 Backtest for ${categoryKey}`);

        // Step 1: Run time-travel backtest
        const backtester = new TimeTravelBacktesterV2();
        const results = await backtester.run(categoryKey);

        // Step 2: Generate V1 strategy from results
        const generator = new V1StrategyGenerator();
        const jobId = `tt_v2_${categoryKey}_${Date.now()}`;
        const v1Result = await generator.generateV1FromResults(results, categoryKey, jobId);

        // Step 3: Return results
        res.json({
            success: true,
            data: {
                timeTravelJobId: jobId,
                testedVariants: results.allResults.length,
                top3: results.top3.map(r => ({
                    name: r.variant.name,
                    score: r.qualityScore.toFixed(2),
                    winRate: r.metrics.winRate.toFixed(1),
                    expectancy: r.metrics.expectancy.toFixed(2),
                    trades: r.trades.length
                })),
                v1Strategy: {
                    id: v1Result.v1Strategy.id,
                    displayText: v1Result.displayText,
                    logic: v1Result.v1Strategy.logic,
                    metrics: v1Result.v1Strategy.backtestMetrics
                }
            }
        });

    } catch (error) {
        console.error('❌ Time-Travel V2 Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/backtest/v1-strategy/:categoryKey
 * Get the current V1 strategy for a category
 */
router.get('/v1-strategy/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        const generator = new V1StrategyGenerator();
        const v1Strategy = await generator.loadV1FromDatabase(categoryKey);

        const displayText = require('../models/strategySchema.cjs').toDisplayText(v1Strategy);

        res.json({
            success: true,
            data: {
                v1Strategy,
                displayText
            }
        });

    } catch (error) {
        console.error('❌ Error loading V1:', error);
        res.status(error.message.includes('not found') ? 404 : 500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/backtest/v1-strategies
 * List all V1 strategies
 */
router.get('/v1-strategies', async (req, res) => {
    try {
        const generator = new V1StrategyGenerator();
        const strategies = await generator.listAllV1Strategies();

        res.json({
            success: true,
            data: strategies
        });

    } catch (error) {
        console.error('❌ Error listing V1 strategies:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
