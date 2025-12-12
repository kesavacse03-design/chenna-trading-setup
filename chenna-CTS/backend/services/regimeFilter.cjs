/**
 * Regime-Aware Trade Filter
 * Phase 6: Market Regime Integration
 * 
 * Purpose: Filter trade entries based on current market regime
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

//=====================================
// REGIME CONFIGURATION
//=====================================

const REGIME_RULES = {
    TRENDING_BULLISH: {
        allowLong: true,
        allowShort: false,
        riskMultiplier: 1.0,
        description: 'Favorable for long positions'
    },
    TRENDING_BEARISH: {
        allowLong: false,
        allowShort: true,
        riskMultiplier: 1.0,
        description: 'Favorable for short positions (if enabled)'
    },
    VOLATILE: {
        allowLong: false,
        allowShort: false,
        riskMultiplier: 0.5,
        description: 'Skip trades due to high volatility'
    },
    RANGING: {
        allowLong: true,
        allowShort: true,
        riskMultiplier: 0.8,
        description: 'Mean reversion strategies only'
    },
    UNKNOWN: {
        allowLong: true,
        allowShort: true,
        riskMultiplier: 0.7,
        description: 'Proceed with caution'
    }
};

//=====================================
// CORE FUNCTIONS
//=====================================

/**
 * Check if trade should proceed based on current regime
 */
async function shouldAllowTrade(symbol, direction = 'BUY', categoryKey) {
    try {
        // Get current market regime
        const currentRegime = await getCurrentRegime();

        if (!currentRegime) {
            return {
                allowed: true, // Default allow if regime unknown
                regime: 'UNKNOWN',
                reason: 'Regime unknown - proceeding with caution',
                riskMultiplier: 0.7
            };
        }

        const rules = REGIME_RULES[currentRegime.regime] || REGIME_RULES.UNKNOWN;

        // Check if direction is allowed
        const isLongTrade = direction === 'BUY';
        const allowed = isLongTrade ? rules.allowLong : rules.allowShort;

        // Get category-specific overrides if any
        const categoryOverride = await getCategoryRegimeOverride(categoryKey);
        if (categoryOverride && categoryOverride.enabled) {
            return {
                allowed: categoryOverride.allowInRegime[currentRegime.regime] !== false,
                regime: currentRegime.regime,
                reason: categoryOverride.customReason || rules.description,
                riskMultiplier: categoryOverride.riskMultiplier || rules.riskMultiplier,
                confidence: currentRegime.confidence
            };
        }

        return {
            allowed,
            regime: currentRegime.regime,
            reason: allowed ? rules.description : `Trade ${direction} not permitted in ${currentRegime.regime} regime`,
            riskMultiplier: rules.riskMultiplier,
            confidence: currentRegime.confidence
        };

    } catch (error) {
        console.error('[RegimeFilter] Error checking trade:', error);
        // Default to allowing trade on error
        return {
            allowed: true,
            regime: 'ERROR',
            reason: 'Error checking regime - proceeding',
            riskMultiplier: 0.6
        };
    }
}

/**
 * Get current market regime
 */
async function getCurrentRegime() {
    try {
        // Check cache first (regime updates every 5 minutes)
        const cached = global.regimeCache;
        if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
            return cached.data;
        }

        // TODO: Call actual regime detection API
        // For now, return mock data
        const mockRegime = {
            regime: 'TRENDING_BULLISH',
            confidence: 0.75,
            timestamp: Date.now()
        };

        // Cache it
        global.regimeCache = {
            data: mockRegime,
            timestamp: Date.now()
        };

        return mockRegime;

    } catch (error) {
        console.error('[RegimeFilter] Error getting regime:', error);
        return null;
    }
}

/**
 * Get category-specific regime overrides
 */
async function getCategoryRegimeOverride(categoryKey) {
    try {
        // Check if category has custom regime rules
        // This allows per-category customization
        const config = await prisma.shadowLearnerConfig.findUnique({
            where: { categoryKey }
        });

        if (!config || !config.regimeOverrides) {
            return null;
        }

        return JSON.parse(config.regimeOverrides);

    } catch (error) {
        console.error('[RegimeFilter] Error getting category override:', error);
        return null;
    }
}

/**
 * Update regime configuration for a category
 */
async function updateCategoryRegimeRules(categoryKey, rules) {
    try {
        await prisma.shadowLearnerConfig.upsert({
            where: { categoryKey },
            create: {
                categoryKey,
                enabled: true,
                minObservations: 20,
                confidenceThreshold: 0.7,
                regimeOverrides: JSON.stringify(rules)
            },
            update: {
                regimeOverrides: JSON.stringify(rules)
            }
        });

        return { ok: true };

    } catch (error) {
        console.error('[RegimeFilter] Error updating rules:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Get regime statistics for a category
 */
async function getRegimeStats(categoryKey, days = 30) {
    try {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Get all trades in this category since date
        const trades = await prisma.learningOutcome.findMany({
            where: {
                categoryKey,
                timestamp: { gte: since }
            },
            select: {
                result: true,
                pnl: true,
                metadata: true
            }
        });

        // Group by regime (stored in metadata)
        const byRegime = {};

        trades.forEach(trade => {
            const meta = trade.metadata ? JSON.parse(trade.metadata) : {};
            const regime = meta.regime || 'UNKNOWN';

            if (!byRegime[regime]) {
                byRegime[regime] = {
                    total: 0,
                    wins: 0,
                    losses: 0,
                    totalPnl: 0
                };
            }

            byRegime[regime].total++;
            if (trade.result === 'WIN') byRegime[regime].wins++;
            if (trade.result === 'LOSS') byRegime[regime].losses++;
            byRegime[regime].totalPnl += trade.pnl || 0;
        });

        // Calculate win rates
        Object.keys(byRegime).forEach(regime => {
            const stats = byRegime[regime];
            stats.winRate = stats.total > 0 ? stats.wins / stats.total : 0;
            stats.avgPnl = stats.total > 0 ? stats.totalPnl / stats.total : 0;
        });

        return {
            ok: true,
            stats: byRegime,
            period: days
        };

    } catch (error) {
        console.error('[RegimeFilter] Error getting stats:', error);
        return { ok: false, error: error.message };
    }
}

module.exports = {
    shouldAllowTrade,
    getCurrentRegime,
    updateCategoryRegimeRules,
    getRegimeStats,
    REGIME_RULES
};
