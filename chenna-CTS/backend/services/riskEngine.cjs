/**
 * Risk Engine Service
 * Phase 11: Enhanced Risk Management
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { todayIST, startOfDayUTC } = require('../utils/istUtils.cjs');

//=====================================
// DEFAULT RISK LIMITS
//=====================================

const DEFAULT_RISK_CONFIG = {
    maxRiskPerTrade: 2.0,        // Max 2% of capital per trade
    maxConcurrentTrades: 5,       // Max 5 trades at once
    maxCategoryExposure: 30.0,    // Max 30% in one category
    maxDailyLoss: 5.0,           // Max 5% loss in one day
    maxWeeklyLoss: 10.0,         // Max 10% loss in one week
    emergencyStopLoss: 15.0      // Emergency stop at 15% drawdown
};

//=====================================
// RISK CALCULATION FUNCTIONS
//=====================================

/**
 * Check if new trade is allowed based on risk limits
 */
async function validateTrade(params) {
    const {
        categoryKey,
        capital,
        positionSize,
        stopLoss,
        currentTrades = []
    } = params;

    try {
        // Get risk configuration for category
        const config = await getRiskConfig(categoryKey);

        const validation = {
            allowed: true,
            reasons: [],
            warnings: [],
            riskMetrics: {}
        };

        // 1. Check max concurrent trades
        if (currentTrades.length >= config.maxConcurrentTrades) {
            validation.allowed = false;
            validation.reasons.push(`Maximum concurrent trades reached (${config.maxConcurrentTrades})`);
        }

        // 2. Check risk per trade
        const riskAmount = (positionSize * stopLoss) / 100;
        const riskPercent = (riskAmount / capital) * 100;
        validation.riskMetrics.riskPerTrade = riskPercent;

        if (riskPercent > config.maxRiskPerTrade) {
            validation.allowed = false;
            validation.reasons.push(`Risk per trade ${riskPercent.toFixed(2)}% exceeds limit ${config.maxRiskPerTrade}%`);
        }

        // 3. Check category exposure
        const categoryTrades = currentTrades.filter(t => t.categoryKey === categoryKey);
        const categoryExposure = categoryTrades.reduce((sum, t) => sum + t.positionSize, 0);
        const totalExposure = (categoryExposure + positionSize) / capital * 100;
        validation.riskMetrics.categoryExposure = totalExposure;

        if (totalExposure > config.maxCategoryExposure) {
            validation.allowed = false;
            validation.reasons.push(`Category exposure ${totalExposure.toFixed(2)}% exceeds limit ${config.maxCategoryExposure}%`);
        }

        // 4. Check daily/weekly loss limits
        const dailyLoss = await getDailyLoss(categoryKey);
        const weeklyLoss = await getWeeklyLoss(categoryKey);

        if (dailyLoss >= config.maxDailyLoss) {
            validation.allowed = false;
            validation.reasons.push(`Daily loss limit ${config.maxDailyLoss}% reached`);
        }

        if (weeklyLoss >= config.maxWeeklyLoss) {
            validation.allowed = false;
            validation.reasons.push(`Weekly loss limit ${config.maxWeeklyLoss}% reached`);
        }

        // 5. Warnings (allow trade but warn)
        if (riskPercent > config.maxRiskPerTrade * 0.8) {
            validation.warnings.push(`Risk approaching limit (${riskPercent.toFixed(2)}%)`);
        }

        return validation;

    } catch (error) {
        console.error('[RiskEngine] Validation error:', error);
        return {
            allowed: false,
            reasons: ['Error validating trade'],
            warnings: [],
            riskMetrics: {}
        };
    }
}

/**
 * Calculate current risk exposure
 */
async function getCurrentExposure(categoryKey, activeTrades) {
    const exposure = {
        totalTrades: activeTrades.length,
        totalCapital: 0,
        totalRisk: 0,
        byCategory: {},
        bySymbol: {}
    };

    activeTrades.forEach(trade => {
        exposure.totalCapital += trade.positionSize || 0;
        exposure.totalRisk += (trade.positionSize * (trade.stopLoss || 1.5)) / 100;

        // By category
        if (!exposure.byCategory[trade.categoryKey]) {
            exposure.byCategory[trade.categoryKey] = { trades: 0, capital: 0, risk: 0 };
        }
        exposure.byCategory[trade.categoryKey].trades++;
        exposure.byCategory[trade.categoryKey].capital += trade.positionSize || 0;
        exposure.byCategory[trade.categoryKey].risk += (trade.positionSize * (trade.stopLoss || 1.5)) / 100;

        // By symbol
        if (!exposure.bySymbol[trade.symbol]) {
            exposure.bySymbol[trade.symbol] = { trades: 0, capital: 0 };
        }
        exposure.bySymbol[trade.symbol].trades++;
        exposure.bySymbol[trade.symbol].capital += trade.positionSize || 0;
    });

    return exposure;
}

/**
 * Get risk configuration for category
 */
async function getRiskConfig(categoryKey) {
    try {
        const config = await prisma.shadowLearnerConfig.findUnique({
            where: { categoryKey }
        });

        if (config && config.riskConfig) {
            return { ...DEFAULT_RISK_CONFIG, ...JSON.parse(config.riskConfig) };
        }

        return DEFAULT_RISK_CONFIG;
    } catch (error) {
        console.error('[RiskEngine] Config error:', error);
        return DEFAULT_RISK_CONFIG;
    }
}

/**
 * Update risk configuration
 */
async function updateRiskConfig(categoryKey, newConfig) {
    try {
        await prisma.shadowLearnerConfig.upsert({
            where: { categoryKey },
            create: {
                categoryKey,
                enabled: true,
                minObservations: 20,
                confidenceThreshold: 0.7,
                riskConfig: JSON.stringify(newConfig)
            },
            update: {
                riskConfig: JSON.stringify(newConfig)
            }
        });

        return { ok: true };
    } catch (error) {
        console.error('[RiskEngine] Update error:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Get daily loss
 */
async function getDailyLoss(categoryKey) {
    try {
        const todayStart = startOfDayUTC(todayIST());

        const outcomes = await prisma.learningOutcome.findMany({
            where: {
                categoryKey,
                timestamp: { gte: todayStart },
                result: 'LOSS'
            }
        });

        const totalLoss = outcomes.reduce((sum, o) => sum + Math.abs(o.pnl), 0);
        return totalLoss;
    } catch (error) {
        return 0;
    }
}

/**
 * Get weekly loss
 */
async function getWeeklyLoss(categoryKey) {
    try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const outcomes = await prisma.learningOutcome.findMany({
            where: {
                categoryKey,
                timestamp: { gte: weekAgo },
                result: 'LOSS'
            }
        });

        const totalLoss = outcomes.reduce((sum, o) => sum + Math.abs(o.pnl), 0);
        return totalLoss;
    } catch (error) {
        return 0;
    }
}

module.exports = {
    validateTrade,
    getCurrentExposure,
    getRiskConfig,
    updateRiskConfig,
    DEFAULT_RISK_CONFIG
};
