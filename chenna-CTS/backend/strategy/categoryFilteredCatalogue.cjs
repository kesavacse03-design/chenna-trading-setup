/**
 * CATEGORY-FILTERED LOGIC CATALOGUE
 * 
 * This module provides category-aware strategy selection.
 * Each category only gets strategies from allowed logic families.
 */

const { LOGIC_FAMILIES, getAllowedFamilies, getFilterInfo } = require('../config/categoryLogicFilter.cjs');
const { ExhaustionStrategies } = require('./exhaustionStrategies.cjs');

class CategoryFilteredCatalogue {

    /**
     * Build logic catalogue for a specific category
     * Only includes strategies from allowed logic families
     */
    static buildForCategory(categoryKey) {
        const filterInfo = getFilterInfo(categoryKey);
        const allowedFamilies = getAllowedFamilies(categoryKey);

        console.log(`\n🎯 [Category Filter] Building catalogue for: ${categoryKey}`);
        console.log(`   Allowed families: ${allowedFamilies.join(', ')}`);
        if (filterInfo) {
            console.log(`   Rationale: ${filterInfo.rationale}`);
        }

        const allStrategies = [];
        let id = 1;

        // Add strategies based on allowed families
        for (const family of allowedFamilies) {
            const familyStrategies = this.getStrategiesForFamily(family);
            for (const strategy of familyStrategies) {
                strategy.id = id++;
                strategy.family = family;
                allStrategies.push(strategy);
            }
        }

        console.log(`   Total strategies after filtering: ${allStrategies.length}\n`);

        return allStrategies;
    }

    /**
     * Get strategies for a specific logic family
     */
    static getStrategiesForFamily(family) {
        switch (family) {
            case LOGIC_FAMILIES.EXHAUSTION:
                return this.buildExhaustionStrategies();

            case LOGIC_FAMILIES.REVERSAL:
                return this.buildReversalStrategies();

            case LOGIC_FAMILIES.BREAKOUT:
                return this.buildBreakoutStrategies();

            case LOGIC_FAMILIES.MOMENTUM:
                return this.buildMomentumStrategies();

            case LOGIC_FAMILIES.CONTRACTION:
                return this.buildContractionStrategies();

            case LOGIC_FAMILIES.MEAN_REVERSION:
                return this.buildMeanReversionStrategies();

            default:
                console.warn(`[CategoryFilter] Unknown family: ${family}`);
                return [];
        }
    }

    /**
     * EXHAUSTION STRATEGIES (For DOWNSIDE_LOM_SWING)
     * Professional exhaustion detection
     */
    static buildExhaustionStrategies() {
        const strategies = [];

        // === Strategy 1: RSI Divergence Exhaustion ===
        strategies.push({
            name: 'RSI Divergence Exhaustion',
            description: 'Price makes new low but RSI makes higher low - selling pressure weakening',
            entry: (indicators, candles) => {
                // RSI in oversold zone
                if (!indicators.rsi14 || indicators.rsi14 > 35) return false;

                // Check for RSI making higher low (divergence)
                // RSI improving while price still weak
                if (indicators.rsi14_prev && indicators.rsi14 > indicators.rsi14_prev) {
                    // Extra confirmation: lower wick showing buying
                    if (indicators.lowerWickPct && indicators.lowerWickPct > 30) {
                        return true;
                    }
                }
                return false;
            },
            exit: { target: 2.5, stop: 1.5 }
        });

        // === Strategy 2: Volume Dry-Up After Panic ===
        strategies.push({
            name: 'Volume Dry-Up Exhaustion',
            description: 'Volume declines after selling spike - sellers exhausted',
            entry: (indicators, candles) => {
                // RSI oversold
                if (!indicators.rsi14 || indicators.rsi14 > 40) return false;

                // Volume below average (dried up)
                if (indicators.volumeVsAvg && indicators.volumeVsAvg < 0.7) {
                    // Price not making new lows
                    if (!indicators.newLow) {
                        return true;
                    }
                }
                return false;
            },
            exit: { target: 2.0, stop: 1.5 }
        });

        // === Strategy 3: Lower Wick Dominance ===
        strategies.push({
            name: 'Lower Wick Dominance',
            description: 'Candles with large lower wicks - buyers absorbing selling',
            entry: (indicators, candles) => {
                // Check lower wick > 40% of range
                if (indicators.lowerWickPct && indicators.lowerWickPct > 40) {
                    // RSI in oversold area
                    if (indicators.rsi14 && indicators.rsi14 < 40) {
                        return true;
                    }
                }
                return false;
            },
            exit: { target: 2.0, stop: 1.2 }
        });

        // === Strategy 4: Failed Breakdown ===
        strategies.push({
            name: 'Failed Breakdown',
            description: 'Price breaks low but immediately reclaims - bear trap',
            entry: (indicators, candles) => {
                // Had a new low recently
                if (indicators.recentNewLow) {
                    // Now trading above that low
                    if (indicators.aboveRecentLow) {
                        // Close near high of day (strength)
                        if (indicators.closeNearHigh) {
                            return true;
                        }
                    }
                }
                return false;
            },
            exit: { target: 3.0, stop: 1.5 }
        });

        // === Strategy 5: ATR Contraction After Spike ===
        strategies.push({
            name: 'ATR Spike Contraction',
            description: 'Volatility spikes then contracts - panic followed by stabilization',
            entry: (indicators, candles) => {
                // ATR had recent spike and now contracting
                if (indicators.atrSpikeRecent && indicators.atrContracting) {
                    // Price holding above lows
                    if (!indicators.newLow) {
                        // RSI recovering from oversold
                        if (indicators.rsi14 && indicators.rsi14 > 25 && indicators.rsi14 < 45) {
                            return true;
                        }
                    }
                }
                return false;
            },
            exit: { target: 2.5, stop: 1.5 }
        });

        return strategies;
    }

    /**
     * REVERSAL STRATEGIES
     */
    static buildReversalStrategies() {
        return [
            {
                name: 'Hammer at Support',
                description: 'Hammer candlestick pattern at support level',
                entry: (indicators) => {
                    return indicators.hammer && indicators.nearSupport && indicators.rsi14 < 40;
                },
                exit: { target: 2.5, stop: 1.5 }
            },
            {
                name: 'Bullish Engulfing Reversal',
                description: 'Bullish engulfing after downtrend',
                entry: (indicators) => {
                    return indicators.bullishEngulfing && indicators.rsi14 < 35;
                },
                exit: { target: 2.5, stop: 1.5 }
            },
            {
                name: 'Morning Star Reversal',
                description: 'Morning star pattern at lows',
                entry: (indicators) => {
                    return indicators.morningStar && indicators.rsi14 < 35;
                },
                exit: { target: 3.0, stop: 1.5 }
            }
        ];
    }

    /**
     * BREAKOUT STRATEGIES
     */
    static buildBreakoutStrategies() {
        return [
            {
                name: 'Range Breakout',
                description: 'Price breaks out of consolidation range',
                entry: (indicators) => {
                    return indicators.rangeBreakout && indicators.volumeExpansion;
                },
                exit: { target: 3.0, stop: 1.5 }
            },
            {
                name: 'Resistance Break with Volume',
                description: 'Price breaks resistance with volume confirmation',
                entry: (indicators) => {
                    return indicators.resistanceBreak && indicators.volumeVsAvg > 1.5;
                },
                exit: { target: 3.5, stop: 1.5 }
            },
            {
                name: 'BB Squeeze Breakout',
                description: 'Bollinger Band squeeze followed by expansion',
                entry: (indicators) => {
                    return indicators.bbSqueezeReleasing && indicators.priceAboveBBMiddle;
                },
                exit: { target: 2.5, stop: 1.5 }
            }
        ];
    }

    /**
     * MOMENTUM STRATEGIES
     */
    static buildMomentumStrategies() {
        return [
            {
                name: 'Trend Continuation',
                description: 'Price above SMAs with momentum',
                entry: (indicators) => {
                    return indicators.aboveSMA20 && indicators.aboveSMA50 && indicators.macdBullish;
                },
                exit: { target: 3.0, stop: 1.5 }
            },
            {
                name: 'MACD Momentum',
                description: 'MACD bullish with histogram expanding',
                entry: (indicators) => {
                    return indicators.macdBullish && indicators.macdHistogramExpanding;
                },
                exit: { target: 2.5, stop: 1.5 }
            },
            {
                name: 'RSI Momentum',
                description: 'RSI rising above 50 with price above SMA',
                entry: (indicators) => {
                    return indicators.rsi14 > 50 && indicators.rsi14 < 70 && indicators.aboveSMA20;
                },
                exit: { target: 2.5, stop: 1.5 }
            }
        ];
    }

    /**
     * CONTRACTION STRATEGIES
     */
    static buildContractionStrategies() {
        return [
            {
                name: 'Volatility Squeeze',
                description: 'ATR contracting, waiting for expansion',
                entry: (indicators) => {
                    return indicators.atrContracting && indicators.bbWidth && indicators.bbWidth < 0.05;
                },
                exit: { target: 2.5, stop: 1.5 }
            },
            {
                name: 'Narrow Range Day',
                description: 'Narrow range with volume declining',
                entry: (indicators) => {
                    return indicators.narrowRange && indicators.volumeDecline;
                },
                exit: { target: 2.0, stop: 1.0 }
            }
        ];
    }

    /**
     * MEAN REVERSION STRATEGIES
     */
    static buildMeanReversionStrategies() {
        return [
            {
                name: 'BB Lower Bounce',
                description: 'Price at lower Bollinger Band in uptrend',
                entry: (indicators) => {
                    return indicators.nearBBLower && indicators.aboveSMA50 && indicators.rsi14 < 40;
                },
                exit: { target: 2.0, stop: 1.5 }
            },
            {
                name: 'EMA Pullback',
                description: 'Pullback to EMA in established uptrend',
                entry: (indicators) => {
                    return indicators.nearEMA20 && indicators.aboveSMA50 && !indicators.newLow;
                },
                exit: { target: 2.5, stop: 1.5 }
            }
        ];
    }
}

module.exports = { CategoryFilteredCatalogue };
