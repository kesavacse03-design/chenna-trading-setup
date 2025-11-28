/**
 * V1 Strategy Schema
 * 
 * Defines the structure for deterministic, frozen trading strategies
 * Generated from time-travel backtest results
 * 
 * CRITICAL: This schema ensures reproducibility and auditability
 */

class V1StrategySchema {
    /**
     * Validate a V1 strategy object
     */
    static validate(strategy) {
        const errors = [];

        // Required fields
        if (!strategy.id) errors.push('Missing required field: id');
        if (!strategy.version) errors.push('Missing required field: version');
        if (!strategy.category) errors.push('Missing required field: category');
        if (!strategy.logic) errors.push('Missing required field: logic');

        // Logic validation
        if (strategy.logic) {
            if (!strategy.logic.entry) errors.push('Missing logic.entry');
            if (!strategy.logic.exit) errors.push('Missing logic.exit');
            if (!strategy.logic.trapFilters) errors.push('Missing logic.trapFilters');
        }

        // Metrics validation
        if (strategy.backtestMetrics) {
            const m = strategy.backtestMetrics;
            if (typeof m.winRate !== 'number') errors.push('Invalid winRate');
            if (typeof m.expectancy !== 'number') errors.push('Invalid expectancy');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Create a new V1 strategy object template
     */
    static create(params) {
        return {
            // Metadata
            id: params.id || `v1_${params.category.toLowerCase()}_${Date.now()}`,
            version: "V1",
            category: params.category,
            createdAt: new Date().toISOString(),
            sourceRun: params.sourceRun || null,
            promoted: params.promoted || false,

            // Core Logic (Frozen)
            logic: {
                // Entry Conditions
                entry: {
                    rsiThreshold: params.rsiThreshold || 30,
                    rsiOperator: params.rsiOperator || "<",
                    macdCondition: params.macdCondition || "bullish_cross",
                    volumeFactor: params.volumeFactor || 1.5,
                    priceVsSMA: params.priceVsSMA || "above_20",
                    requireAllConditions: true
                },

                // Exit Rules
                exit: {
                    targetPct: params.targetPct || 2.5,
                    stopPct: params.stopPct || 1.5,
                    maxSessions: params.maxSessions || 10,
                    reversalExitEnabled: params.reversalExitEnabled || true,
                    reversalPatterns: params.reversalPatterns || ["bearish_engulfing", "shooting_star"]
                },

                // Trap Filters (Must ALL be false to trade)
                trapFilters: {
                    volumeTrap: {
                        enabled: true,
                        maxSpike: 3.0  // Reject if vol > 3x avg
                    },
                    bullTrap: {
                        enabled: true,
                        resistanceBuffer: 0.02  // 2% below resistance
                    },
                    fakeBreakout: {
                        enabled: true,
                        confirmationCandles: 2
                    },
                    stopHunt: {
                        enabled: true,
                        wickRatio: 0.5  // Lower wick > 50% range
                    },
                    distributionPhase: {
                        enabled: true,
                        volumeDecline: 0.8  // Vol declining while price flat
                    },
                    exhaustionCandle: {
                        enabled: true,
                        bodyToWickRatio: 0.3
                    },
                    liquiditySweep: {
                        enabled: true,
                        priorLowDistance: 0.015  // 1.5%
                    },
                    newsFakeSpike: {
                        enabled: true,
                        timeWindow: 60  // Minutes after news
                    }
                }
            },

            // Historical Performance (from time-travel)
            backtestMetrics: {
                winRate: params.winRate || 0,
                expectancy: params.expectancy || 0,
                avgProfit: params.avgProfit || 0,
                maxDrawdown: params.maxDrawdown || 0,
                tradeCount: params.tradeCount || 0,
                trapAvoidanceRate: params.trapAvoidanceRate || 0,
                profitFactor: params.profitFactor || 0,
                sharpeRatio: params.sharpeRatio || 0
            },

            // Overfitting Protection
            validation: {
                trainPeriod: params.trainPeriod || { start: null, end: null },
                testPeriod: params.testPeriod || { start: null, end: null },
                trainWinRate: params.trainWinRate || 0,
                testWinRate: params.testWinRate || 0,
                stabilityScore: params.stabilityScore || 0  // abs(trainWR - testWR) < 5%
            }
        };
    }

    /**
     * Convert strategy to display text for UI
     */
    static toDisplayText(strategy) {
        const e = strategy.logic.entry;
        const x = strategy.logic.exit;

        return `
V1 STRATEGY - ${strategy.category}

ENTRY RULES:
✓ RSI ${e.rsiOperator} ${e.rsiThreshold}
✓ MACD: ${e.macdCondition}
✓ Volume > ${e.volumeFactor}x average
✓ Price position: ${e.priceVsSMA}
✓ ALL conditions required: ${e.requireAllConditions ? 'YES' : 'NO'}

EXIT RULES:
✓ Target: +${x.targetPct}%
✓ Stop: -${x.stopPct}%
✓ Max Sessions: ${x.maxSessions} days
✓ Reversal Exit: ${x.reversalExitEnabled ? 'Enabled' : 'Disabled'}
${x.reversalExitEnabled ? `✓ Patterns: ${x.reversalPatterns.join(', ')}` : ''}

TRAP FILTERS:
${Object.entries(strategy.logic.trapFilters)
                .map(([name, config]) => `✓ ${name}: ${config.enabled ? 'ON' : 'OFF'}`)
                .join('\n')}

EXPECTED PERFORMANCE:
Win Rate: ${strategy.backtestMetrics.winRate.toFixed(1)}%
Expectancy: ${strategy.backtestMetrics.expectancy.toFixed(2)}%
Avg Profit: ${strategy.backtestMetrics.avgProfit.toFixed(2)}%
Max Drawdown: ${strategy.backtestMetrics.maxDrawdown.toFixed(2)}%
Trades: ${strategy.backtestMetrics.tradeCount}
        `.trim();
    }
}

module.exports = V1StrategySchema;
