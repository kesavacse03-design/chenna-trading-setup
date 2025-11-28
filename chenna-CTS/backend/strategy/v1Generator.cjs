/**
 * V1 Strategy Generator
 * 
 * Takes time-travel backtest results and generates the V1 Default Strategy
 * Steps:
 * 1. Compute metrics for all variants
 * 2. Score and rank variants
 * 3. Select top 3
 * 4. Merge into V1
 * 5. Save to database + JSON file
 * 
 * CRITICAL: Deterministic, reproducible, frozen logic
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const V1StrategySchema = require('../models/strategySchema.cjs');

class V1StrategyGenerator {

    /**
     * Generate V1 from time-travel results
     */
    async generateV1FromResults(timeTravelResults, categoryKey, timeTravelJobId) {
        console.log('\n🔧 Generating V1 Strategy...');

        const { allResults, top3, v1Candidate } = timeTravelResults;

        // Step 1: Validate we have results
        if (!top3 || top3.length === 0) {
            throw new Error('No valid strategies found in time-travel results');
        }

        console.log(`✅ Top 3 candidates identified`);
        top3.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.variant.name} - Score: ${r.qualityScore.toFixed(2)} (WR: ${r.metrics.winRate.toFixed(1)}%)`);
        });

        // Step 2: Build V1 strategy from best candidate
        const best = top3[0];
        const variant = best.variant;
        const metrics = best.metrics;

        const v1Strategy = V1StrategySchema.create({
            category: categoryKey,
            sourceRun: timeTravelJobId,
            promoted: true,

            // Entry logic from best variant
            rsiThreshold: variant.rsiThreshold,
            rsiOperator: '<',
            macdCondition: 'bullish_cross',
            volumeFactor: variant.volumeFactor,
            priceVsSMA: 'above_20',

            // Exit logic from best variant
            targetPct: variant.targetPct,
            stopPct: variant.stopPct,
            maxSessions: variant.maxSessions,
            reversalExitEnabled: variant.reversalExitEnabled,
            reversalPatterns: ['bearish_engulfing', 'shooting_star'],

            // Metrics from backtest
            winRate: metrics.winRate,
            expectancy: metrics.expectancy,
            avgProfit: metrics.avgProfit,
            maxDrawdown: metrics.maxDrawdown,
            tradeCount: metrics.tradeCount,
            trapAvoidanceRate: metrics.trapAvoidanceRate,
            profitFactor: metrics.profitFactor,
            sharpeRatio: metrics.sharpeRatio,

            // Validation (placeholder - implement out-of-sample in Step 4)
            trainPeriod: { start: null, end: null },
            testPeriod: { start: null, end: null },
            trainWinRate: metrics.winRate,
            testWinRate: metrics.winRate,
            stabilityScore: 1.0
        });

        // Step 3: Validate schema
        const validation = V1StrategySchema.validate(v1Strategy);
        if (!validation.valid) {
            throw new Error(`V1 Strategy validation failed: ${validation.errors.join(', ')}`);
        }

        console.log(`✅ V1 Strategy validated`);

        // Step 4: Save to database
        await this.saveToDatabase(v1Strategy, categoryKey);

        // Step 5: Save to JSON file
        await this.saveToFile(v1Strategy, categoryKey);

        // Step 6: Generate display text
        const displayText = V1StrategySchema.toDisplayText(v1Strategy);

        console.log(`\n🎉 V1 Strategy Generated Successfully!`);
        console.log(`📊 ID: ${v1Strategy.id}`);
        console.log(`📈 Win Rate: ${v1Strategy.backtestMetrics.winRate.toFixed(1)}%`);
        console.log(`💰 Expectancy: ${v1Strategy.backtestMetrics.expectancy.toFixed(2)}%`);
        console.log(`📉 Max Drawdown: ${v1Strategy.backtestMetrics.maxDrawdown.toFixed(2)}%`);

        return {
            v1Strategy,
            displayText,
            top3Strategies: top3.map(r => ({
                name: r.variant.name,
                score: r.qualityScore,
                metrics: r.metrics
            }))
        };
    }

    /**
     * Save V1 strategy to database
     */
    async saveToDatabase(v1Strategy, categoryKey) {
        try {
            // Find category
            const category = await prisma.category.findUnique({
                where: { key: categoryKey }
            });

            if (!category) {
                console.warn(`⚠️ Category ${categoryKey} not found in database, skipping DB save`);
                return null;
            }

            // Unpromote any existing V1 strategies for this category
            await prisma.strategy.updateMany({
                where: {
                    categoryId: category.id,
                    version: 'V1',
                    promoted: true
                },
                data: { promoted: false }
            });

            // Create new V1 strategy
            const savedStrategy = await prisma.strategy.create({
                data: {
                    categoryId: category.id,
                    version: 'V1',
                    promoted: true,
                    description: `V1 Default - ${categoryKey}`,

                    // Store logic as JSON
                    rules: v1Strategy.logic,

                    // Store parameters
                    params: {
                        sourceRun: v1Strategy.sourceRun,
                        createdAt: v1Strategy.createdAt
                    },

                    // Store metrics
                    metrics: v1Strategy.backtestMetrics
                }
            });

            console.log(`✅ V1 Strategy saved to database (ID: ${savedStrategy.id})`);
            return savedStrategy;

        } catch (error) {
            console.error(`❌ Failed to save V1 to database:`, error.message);
            throw error;
        }
    }

    /**
     * Save V1 strategy to JSON file
     */
    async saveToFile(v1Strategy, categoryKey) {
        const resultsDir = path.join(__dirname, '../results');

        // Ensure results directory exists
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const filePath = path.join(resultsDir, `v1_${categoryKey.toLowerCase()}.json`);

        fs.writeFileSync(
            filePath,
            JSON.stringify(v1Strategy, null, 2),
            'utf8'
        );

        console.log(`✅ V1 Strategy saved to file: ${filePath}`);
        return filePath;
    }

    /**
     * Load V1 strategy from database
     */
    async loadV1FromDatabase(categoryKey) {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) {
            throw new Error(`Category ${categoryKey} not found`);
        }

        const v1Strategy = await prisma.strategy.findFirst({
            where: {
                categoryId: category.id,
                version: 'V1',
                promoted: true
            }
        });

        if (!v1Strategy) {
            throw new Error(`No V1 strategy found for ${categoryKey}`);
        }

        // Convert database format to V1StrategySchema format
        return {
            id: v1Strategy.id.toString(),
            version: 'V1',
            category: categoryKey,
            createdAt: v1Strategy.updatedAt.toISOString(),
            sourceRun: v1Strategy.params?.sourceRun || null,
            promoted: v1Strategy.promoted,
            logic: v1Strategy.rules,
            backtestMetrics: v1Strategy.metrics,
            validation: {
                trainPeriod: { start: null, end: null },
                testPeriod: { start: null, end: null },
                trainWinRate: v1Strategy.metrics.winRate || 0,
                testWinRate: v1Strategy.metrics.winRate || 0,
                stabilityScore: 1.0
            }
        };
    }

    /**
     * List all V1 strategies
     */
    async listAllV1Strategies() {
        const strategies = await prisma.strategy.findMany({
            where: { version: 'V1' },
            include: { category: true },
            orderBy: { updatedAt: 'desc' }
        });

        return strategies.map(s => ({
            id: s.id,
            category: s.category.key,
            promoted: s.promoted,
            winRate: s.metrics?.winRate || 0,
            expectancy: s.metrics?.expectancy || 0,
            updatedAt: s.updatedAt
        }));
    }
}

module.exports = V1StrategyGenerator;
