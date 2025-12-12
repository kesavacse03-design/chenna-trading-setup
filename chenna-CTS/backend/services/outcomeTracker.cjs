/**
 * Outcome Tracker Service for Shadow Learner (Phase 3)
 * Tracks all backtest and trade outcomes for AI learning
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Track a backtest/trade outcome for learning
 * @param {Object} data - Outcome data
 * @param {string} data.type - 'tt_backtest', 'v1_execution', 'labs_discovery'
 * @param {string} data.categoryKey - Category being tested
 * @param {Object} data.strategyParams - Strategy parameters used
 * @param {Object} data.result - Full backtest result
 * @param {Object} data.marketContext - Optional market conditions
 */
async function trackOutcome(data) {
    const { type, categoryKey, strategyParams, result, marketContext = null } = data;

    try {
        // Extract key metrics from result
        const metrics = extractMetrics(result);

        // Save to database
        const outcome = await prisma.learningOutcome.create({
            data: {
                type,
                categoryKey,
                strategyParams,
                result,
                marketContext,
                timestamp: new Date(),

                // Denormalized metrics for fast queries
                accuracy: metrics.accuracy,
                winRate: metrics.winRate,
                pnl: metrics.pnl,
                drawdown: metrics.drawdown,
                tradeCount: metrics.tradeCount
            }
        });

        console.log(`[OutcomeTracker] Tracked ${type} for ${categoryKey}: ${metrics.accuracy?.toFixed(2)}% accuracy`);

        // Trigger pattern analysis if enough outcomes (async, non-blocking)
        queuePatternAnalysis(categoryKey).catch(err =>
            console.error('[OutcomeTracker] Pattern analysis queue error:', err)
        );

        return outcome;

    } catch (error) {
        console.error('[OutcomeTracker] Error tracking outcome:', error);
        throw error;
    }
}

/**
 * Extract standardized metrics from backtest result
 */
function extractMetrics(result) {
    // Handle different result formats
    const accuracy = result.accuracy || result.winRate || 0;
    const winRate = result.winRate || result.accuracy || 0;
    const pnl = result.pnl || result.totalPnl || result.netPnl || 0;
    const drawdown = result.drawdown || result.maxDrawdown || 0;
    const tradeCount = result.tradeCount || result.totalTrades || result.trades?.length || 0;

    return {
        accuracy: parseFloat(accuracy),
        winRate: parseFloat(winRate),
        pnl: parseFloat(pnl),
        drawdown: parseFloat(drawdown),
        tradeCount: parseInt(tradeCount)
    };
}

/**
 * Queue pattern analysis for a category
 * This runs asynchronously after enough outcomes are collected
 */
async function queuePatternAnalysis(categoryKey) {
    // Check if we have enough recent outcomes
    const recentCount = await prisma.learningOutcome.count({
        where: {
            categoryKey,
            timestamp: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
        }
    });

    // Trigger pattern recognition if we have enough data
    const config = await getConfig(categoryKey);
    if (recentCount >= config.minSampleSize) {
        console.log(`[OutcomeTracker] Queueing pattern analysis for ${categoryKey} (${recentCount} outcomes)`);

        // TODO: Trigger pattern recognition service
        // For now, just log - we'll implement pattern recognition next
    }
}

/**
 * Get outcomes for a category with filters
 * @param {string} categoryKey - Category key
 * @param {Object} filters - Query filters
 * @param {Date} filters.startDate - Filter by start date
 * @param {Date} filters.endDate - Filter by end date
 * @param {number} filters.minAccuracy - Minimum accuracy threshold
 * @param {number} filters.maxAccuracy - Maximum accuracy threshold
 * @param {string} filters.type - Outcome type
 * @param {number} filters.limit - Limit results
 */
async function getOutcomes(categoryKey, filters = {}) {
    const where = { categoryKey };

    // Apply filters
    if (filters.startDate || filters.endDate) {
        where.timestamp = {};
        if (filters.startDate) where.timestamp.gte = filters.startDate;
        if (filters.endDate) where.timestamp.lte = filters.endDate;
    }

    if (filters.minAccuracy !== undefined) {
        where.accuracy = { gte: filters.minAccuracy };
    }

    if (filters.maxAccuracy !== undefined) {
        where.accuracy = where.accuracy || {};
        where.accuracy.lte = filters.maxAccuracy;
    }

    if (filters.type) {
        where.type = filters.type;
    }

    const outcomes = await prisma.learningOutcome.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: filters.limit || 100
    });

    return outcomes;
}

/**
 * Get recent outcomes (last N days)
 */
async function getRecentOutcomes(categoryKey, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await getOutcomes(categoryKey, { startDate });
}

/**
 * Get winning outcomes (accuracy >= threshold)
 */
async function getWinningOutcomes(categoryKey, threshold = 0.6, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await getOutcomes(categoryKey, {
        startDate,
        minAccuracy: threshold
    });
}

/**
 * Get failing outcomes (accuracy < threshold)
 */
async function getFailingOutcomes(categoryKey, threshold = 0.4, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await getOutcomes(categoryKey, {
        maxAccuracy: threshold
    });
}

/**
 * Get or create Shadow Learner config for a category
 */
async function getConfig(categoryKey) {
    let config = await prisma.shadowLearnerConfig.findUnique({
        where: { categoryKey }
    });

    if (!config) {
        // Create default config
        config = await prisma.shadowLearnerConfig.create({
            data: {
                categoryKey,
                enabled: true,
                automationLevel: 2, // Moderate by default
                learningWindowDays: 30,
                minSampleSize: 20,
                confidenceThreshold: 0.75
            }
        });
    }

    return config;
}

/**
 * Update Shadow Learner config
 */
async function updateConfig(categoryKey, updates) {
    return await prisma.shadowLearnerConfig.upsert({
        where: { categoryKey },
        create: {
            categoryKey,
            ...updates
        },
        update: updates
    });
}

/**
 * Get statistics for a category
 */
async function getStats(categoryKey, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [total, winning, failing, avgMetrics] = await Promise.all([
        // Total outcomes
        prisma.learningOutcome.count({
            where: { categoryKey, timestamp: { gte: startDate } }
        }),

        // Winning outcomes (>= 60%)
        prisma.learningOutcome.count({
            where: {
                categoryKey,
                timestamp: { gte: startDate },
                accuracy: { gte: 0.6 }
            }
        }),

        // Failing outcomes (< 40%)
        prisma.learningOutcome.count({
            where: {
                categoryKey,
                timestamp: { gte: startDate },
                accuracy: { lt: 0.4 }
            }
        }),

        // Average metrics
        prisma.learningOutcome.aggregate({
            where: { categoryKey, timestamp: { gte: startDate } },
            _avg: {
                accuracy: true,
                winRate: true,
                pnl: true,
                drawdown: true
            }
        })
    ]);

    return {
        total,
        winning,
        failing,
        successRate: total > 0 ? winning / total : 0,
        avgAccuracy: avgMetrics._avg.accuracy || 0,
        avgWinRate: avgMetrics._avg.winRate || 0,
        avgPnl: avgMetrics._avg.pnl || 0,
        avgDrawdown: avgMetrics._avg.drawdown || 0
    };
}

module.exports = {
    trackOutcome,
    getOutcomes,
    getRecentOutcomes,
    getWinningOutcomes,
    getFailingOutcomes,
    getConfig,
    updateConfig,
    getStats
};
