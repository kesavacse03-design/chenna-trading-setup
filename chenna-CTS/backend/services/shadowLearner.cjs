/**
 * Shadow Learner Core Service (Phase 3)
 * Orchestrates the learning cycle: outcome tracking → pattern recognition → suggestions
 */

const outcomeTracker = require('./outcomeTracker.cjs');
const patternRecognition = require('./patternRecognition.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ShadowLearner {

    constructor() {
        this.learningCycles = new Map(); // Track active learning cycles
    }

    /**
     * Main learning cycle for a category
     * Runs pattern analysis and generates improvement suggestions
     */
    async runLearningCycle(categoryKey) {
        console.log(`\n[Shadow] 🧠 Starting learning cycle for ${categoryKey}`);

        try {
            // Get config for this category
            const config = await outcomeTracker.getConfig(categoryKey);

            if (!config.enabled) {
                console.log(`[Shadow] Learning disabled for ${categoryKey}`);
                return { status: 'disabled' };
            }

            // Step 1: Gather recent outcomes
            const outcomes = await outcomeTracker.getRecentOutcomes(
                categoryKey,
                config.learningWindowDays
            );

            if (outcomes.length < config.minSampleSize) {
                console.log(`[Shadow] Insufficient data: ${outcomes.length}/${config.minSampleSize} outcomes`);
                return { status: 'insufficient_data', count: outcomes.length };
            }

            console.log(`[Shadow] Analyzing ${outcomes.length} outcomes from last ${config.learningWindowDays} days`);

            // Step 2: Run pattern recognition
            const { patterns } = await patternRecognition.analyze(categoryKey, {
                days: config.learningWindowDays,
                minSampleSize: config.minSampleSize
            });

            console.log(`[Shadow] Discovered ${patterns.length} patterns`);

            // Step 3: Filter high-confidence patterns
            const highConfidencePatterns = patterns.filter(
                p => p.confidence >= config.confidenceThreshold
            );

            console.log(`[Shadow] ${highConfidencePatterns.length} high-confidence patterns (>=${config.confidenceThreshold})`);

            // Step 4: Generate improvement suggestions
            const suggestions = await patternRecognition.generateSuggestions(
                categoryKey,
                highConfidencePatterns
            );

            console.log(`[Shadow] Generated ${suggestions.length} improvement suggestions`);

            // Step 5: Save suggestions to database
            await this.saveSuggestions(categoryKey, suggestions);

            // Step 6: Get category statistics
            const stats = await outcomeTracker.getStats(categoryKey, config.learningWindowDays);

            console.log(`[Shadow] ✅ Learning cycle complete`);
            console.log(`[Shadow]    Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
            console.log(`[Shadow]    Avg accuracy: ${(stats.avgAccuracy * 100).toFixed(1)}%`);

            return {
                status: 'complete',
                patternsDiscovered: patterns.length,
                highConfidence: highConfidencePatterns.length,
                suggestionCount: suggestions.length,
                stats
            };

        } catch (error) {
            console.error(`[Shadow] Error in learning cycle:`, error);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Save improvement suggestions to database
     */
    async saveSuggestions(categoryKey, suggestions) {
        for (const suggestion of suggestions) {
            try {
                // Get current strategy params for comparison
                const currentParams = await this.getCurrentStrategyParams(categoryKey);

                await prisma.strategyImprovement.create({
                    data: {
                        categoryKey,
                        originalParams: currentParams || {},
                        improvedParams: suggestion,
                        expectedGain: suggestion.confidence * 0.1, // Conservative estimate
                        status: 'pending',
                        notes: suggestion.reason || ''
                    }
                });
            } catch (error) {
                console.error(`[Shadow] Error saving suggestion:`, error.message);
            }
        }
    }

    /**
     * Get current strategy parameters for a category
     */
    async getCurrentStrategyParams(categoryKey) {
        try {
            // Get most recent outcome
            const recent = await prisma.learningOutcome.findFirst({
                where: { categoryKey },
                orderBy: { timestamp: 'desc' }
            });

            return recent?.strategyParams || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get pending improvement suggestions for a category
     */
    async getPendingSuggestions(categoryKey) {
        return await prisma.strategyImprovement.findMany({
            where: {
                categoryKey,
                status: 'pending'
            },
            orderBy: { expectedGain: 'desc' }
        });
    }

    /**
     * Get learning stats for dashboard
     */
    async getDashboardStats() {
        const [
            totalOutcomes,
            totalPatterns,
            pendingImprovements,
            recentAdaptations
        ] = await Promise.all([
            prisma.learningOutcome.count(),
            prisma.patternObservation.count({
                where: { validUntil: { gte: new Date() } }
            }),
            prisma.strategyImprovement.count({
                where: { status: 'pending' }
            }),
            prisma.adaptationHistory.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    }
                }
            })
        ]);

        return {
            totalOutcomes,
            patternsDiscovered: totalPatterns,
            improvementsPending: pendingImprovements,
            recentAdaptations,
            lastUpdated: new Date()
        };
    }

    /**
     * Get category-specific learning insights
     */
    async getCategoryInsights(categoryKey) {
        const [stats, patterns, suggestions] = await Promise.all([
            outcomeTracker.getStats(categoryKey, 30),
            patternRecognition.getPatterns(categoryKey, { minConfidence: 0.6 }),
            this.getPendingSuggestions(categoryKey)
        ]);

        return {
            stats,
            patterns: patterns.slice(0, 5), // Top 5 patterns
            suggestionCount: suggestions.length,
            learningStatus: stats.total >= 20 ? 'active' : 'gathering_data'
        };
    }

    /**
     * Manual trigger for learning cycle (for testing)
     */
    async triggerManual(categoryKey) {
        console.log(`[Shadow] Manual learning cycle triggered for ${categoryKey}`);
        return await this.runLearningCycle(categoryKey);
    }

    /**
     * Schedule automatic learning cycles (daily)
     * Called from server.cjs on startup
     */
    startAutomatedLearning() {
        console.log('[Shadow] 🤖 Starting automated learning scheduler');

        // Run learning cycle daily at 2 AM
        const schedule = require('node-cron');

        schedule.schedule('0 2 * * *', async () => {
            console.log('\n[Shadow] 🌙 Running scheduled learning cycles (2 AM)');

            try {
                // Get all active categories
                const categories = await prisma.category.findMany({
                    where: { enabled: true }
                });

                for (const category of categories) {
                    await this.runLearningCycle(category.key);

                    // Wait 1 minute between categories to avoid overwhelming DB
                    await new Promise(resolve => setTimeout(resolve, 60000));
                }

                console.log(`[Shadow] ✅ Completed learning cycles for ${categories.length} categories`);

            } catch (error) {
                console.error('[Shadow] Error in scheduled learning:', error);
            }
        });

        console.log('[Shadow] ✅ Automated learning scheduler active (daily at 2 AM)');
    }
}

module.exports = new ShadowLearner();
