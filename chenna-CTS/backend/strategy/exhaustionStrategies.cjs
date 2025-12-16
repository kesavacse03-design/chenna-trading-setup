/**
 * PROFESSIONAL EXHAUSTION STRATEGIES
 * 
 * Designed for DOWNSIDE_LOM_SWING category
 * Looking for: Panic selling exhaustion → bounce
 * 
 * Key principles:
 * - Uses SCORING not binary rules
 * - Each strategy has clear invalidation
 * - Realistic exits based on context
 * - Professional trader logic
 */

const { LOGIC_FAMILIES } = require('../config/categoryLogicFilter.cjs');

/**
 * EXHAUSTION STRATEGY BUILDERS
 * Each returns a strategy object with family tag for filtering
 */
class ExhaustionStrategies {

    /**
     * Strategy 1: RSI Divergence Exhaustion
     * 
     * Logic: Price makes new low, but RSI makes higher low
     * This shows selling pressure is weakening despite lower prices
     */
    static rsiDivergenceExhaustion() {
        return {
            name: 'RSI Divergence Exhaustion',
            family: LOGIC_FAMILIES.EXHAUSTION,
            description: 'Price makes new low but RSI shows higher low - classic exhaustion signal',

            // Scoring function (0-100)
            score: (indicators, priceHistory) => {
                let score = 0;

                // Check RSI is in oversold territory
                if (indicators.rsi14 && indicators.rsi14 < 35) {
                    score += 25;

                    // Extra points for extreme oversold
                    if (indicators.rsi14 < 25) score += 10;
                }

                // Check for RSI divergence (RSI rising while price flat/down)
                if (indicators.rsi14_prev && indicators.rsi14 > indicators.rsi14_prev) {
                    score += 30; // RSI making higher value
                }

                // Check for lower wicks (buying absorption)
                if (indicators.lowerWickPct && indicators.lowerWickPct > 40) {
                    score += 20;
                }

                // Check volume declining (exhaustion)
                if (indicators.volumeDecline) {
                    score += 15;
                }

                return Math.min(100, score);
            },

            // Entry when score > threshold
            entry: (indicators, priceHistory) => {
                const score = ExhaustionStrategies.rsiDivergenceExhaustion().score(indicators, priceHistory);
                return score >= 55; // Need 55+ score to enter
            },

            // Dynamic exit based on volatility
            exit: (indicators) => ({
                target: Math.max(2.0, (indicators.atr14 / indicators.currentPrice) * 100 * 1.5),
                stop: Math.max(1.5, (indicators.atr14 / indicators.currentPrice) * 100 * 1.0)
            }),

            // Invalidation conditions
            invalidation: (indicators) => {
                // Invalidate if new low with increasing volume (capitulation not done)
                if (indicators.volumeExpanding && indicators.newLow) return true;
                // Invalidate if breakdown continues
                if (indicators.breakdown) return true;
                return false;
            }
        };
    }

    /**
     * Strategy 2: Volume Dry-Up After Panic
     * 
     * Logic: After heavy selling volume, volume dries up
     * Shows sellers exhausted, no more supply
     */
    static volumeDryUpExhaustion() {
        return {
            name: 'Volume Dry-Up Exhaustion',
            family: LOGIC_FAMILIES.EXHAUSTION,
            description: 'Selling volume spike followed by volume contraction - sellers exhausted',

            score: (indicators, priceHistory) => {
                let score = 0;

                // Volume declining from recent high
                if (indicators.volumeVsAvg && indicators.volumeVsAvg < 0.8) {
                    score += 30;
                }

                // Had volume spike recently (indicates panic happened)
                if (indicators.recentVolumeSpike) {
                    score += 25;
                }

                // Price stabilizing near lows
                if (indicators.priceNearLow && !indicators.newLow) {
                    score += 25;
                }

                // RSI in oversold zone
                if (indicators.rsi14 && indicators.rsi14 < 40) {
                    score += 20;
                }

                return Math.min(100, score);
            },

            entry: (indicators, priceHistory) => {
                const score = ExhaustionStrategies.volumeDryUpExhaustion().score(indicators, priceHistory);
                return score >= 60;
            },

            exit: (indicators) => ({
                target: 2.5,
                stop: 1.5
            }),

            invalidation: (indicators) => {
                // Invalidate if volume spikes again with new low
                if (indicators.volumeSpike && indicators.newLow) return true;
                return false;
            }
        };
    }

    /**
     * Strategy 3: Lower Wick Dominance
     * 
     * Logic: Candles showing lower wicks > bodies
     * Buyers absorbing selling at lower prices
     */
    static lowerWickDominance() {
        return {
            name: 'Lower Wick Dominance',
            family: LOGIC_FAMILIES.EXHAUSTION,
            description: 'Lower wicks dominate - buyers absorbing selling pressure',

            score: (indicators, priceHistory) => {
                let score = 0;

                // Lower wick > 40% of candle range
                if (indicators.lowerWickPct && indicators.lowerWickPct > 40) {
                    score += 35;
                    if (indicators.lowerWickPct > 60) score += 15; // Hammer
                }

                // Consecutive lower wick candles (2+)
                if (indicators.consecutiveLowerWicks && indicators.consecutiveLowerWicks >= 2) {
                    score += 25;
                }

                // Near support zone
                if (indicators.nearSupport) {
                    score += 15;
                }

                // RSI oversold
                if (indicators.rsi14 && indicators.rsi14 < 35) {
                    score += 10;
                }

                return Math.min(100, score);
            },

            entry: (indicators, priceHistory) => {
                const score = ExhaustionStrategies.lowerWickDominance().score(indicators, priceHistory);
                return score >= 50;
            },

            exit: (indicators) => ({
                target: 2.0,
                stop: 1.2
            }),

            invalidation: (indicators) => {
                // Invalidate if upper wick dominance (rejection at highs)
                if (indicators.upperWickPct && indicators.upperWickPct > 50) return true;
                return false;
            }
        };
    }

    /**
     * Strategy 4: Failed Breakdown
     * 
     * Logic: Price breaks support but fails to follow through
     * Classic bear trap / exhaustion signal
     */
    static failedBreakdown() {
        return {
            name: 'Failed Breakdown',
            family: LOGIC_FAMILIES.EXHAUSTION,
            description: 'Price breaks support but immediately reclaims - bear trap / exhaustion',

            score: (indicators, priceHistory) => {
                let score = 0;

                // Made new low recently
                if (indicators.recentNewLow) {
                    score += 20;
                }

                // Now trading above that low
                if (indicators.aboveRecentLow) {
                    score += 35;
                }

                // Volume spiked on breakdown (panic) but now declining
                if (indicators.breakdownVolumeSpike && indicators.volumeDecline) {
                    score += 25;
                }

                // Close near high of day (strength)
                if (indicators.closeNearHigh) {
                    score += 20;
                }

                return Math.min(100, score);
            },

            entry: (indicators, priceHistory) => {
                const score = ExhaustionStrategies.failedBreakdown().score(indicators, priceHistory);
                return score >= 55;
            },

            exit: (indicators) => ({
                target: 3.0, // Failed breakdowns can have larger moves
                stop: 1.5
            }),

            invalidation: (indicators) => {
                // Invalidate if price goes back below low (breakdown valid)
                if (indicators.newLow) return true;
                return false;
            }
        };
    }

    /**
     * Strategy 5: ATR Spike Then Contraction
     * 
     * Logic: Volatility spikes (panic) then contracts (stabilization)
     * Classic exhaustion pattern
     */
    static atrSpikeContraction() {
        return {
            name: 'ATR Spike Contraction',
            family: LOGIC_FAMILIES.EXHAUSTION,
            description: 'Volatility spikes then contracts - panic followed by stabilization',

            score: (indicators, priceHistory) => {
                let score = 0;

                // ATR had recent spike
                if (indicators.atrSpikeRecent) {
                    score += 25;
                }

                // ATR now contracting
                if (indicators.atrContracting) {
                    score += 30;
                }

                // Price holding above recent lows
                if (!indicators.newLow && indicators.holdingAboveLow) {
                    score += 25;
                }

                // RSI recovering from oversold
                if (indicators.rsi14 && indicators.rsi14 > 30 && indicators.rsi14 < 45) {
                    score += 20;
                }

                return Math.min(100, score);
            },

            entry: (indicators, priceHistory) => {
                const score = ExhaustionStrategies.atrSpikeContraction().score(indicators, priceHistory);
                return score >= 55;
            },

            exit: (indicators) => ({
                target: 2.5,
                stop: 1.5
            }),

            invalidation: (indicators) => {
                // Invalidate if ATR expands again with new low
                if (indicators.atrExpanding && indicators.newLow) return true;
                return false;
            }
        };
    }

    /**
     * Get all exhaustion strategies
     */
    static getAllExhaustionStrategies() {
        return [
            this.rsiDivergenceExhaustion(),
            this.volumeDryUpExhaustion(),
            this.lowerWickDominance(),
            this.failedBreakdown(),
            this.atrSpikeContraction()
        ];
    }

    /**
     * Get strategy by name
     */
    static getStrategy(name) {
        const strategies = this.getAllExhaustionStrategies();
        return strategies.find(s => s.name === name);
    }
}

module.exports = { ExhaustionStrategies };
