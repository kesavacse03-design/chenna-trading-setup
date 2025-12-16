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
                // RSI in oversold zone (LOOSENED: 35 -> 45)
                if (!indicators.rsi14 || indicators.rsi14 > 45) return false;

                // Check for RSI making higher low (divergence)
                // RSI improving while price still weak
                if (indicators.rsi14_prev && indicators.rsi14 > indicators.rsi14_prev) {
                    // Lower wick showing buying (LOOSENED: 30 -> 25)
                    if (indicators.lowerWickPct && indicators.lowerWickPct > 25) {
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
                // RSI oversold (LOOSENED: 40 -> 50)
                if (!indicators.rsi14 || indicators.rsi14 > 50) return false;

                // Volume below average (LOOSENED: 0.7 -> 0.85)
                if (indicators.volumeVsAvg && indicators.volumeVsAvg < 0.85) {
                    // Price not making aggressive new lows (allow marginal)
                    if (!indicators.newLow || indicators.holdingAboveLow) {
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
                // Lower wick (LOOSENED: 40% -> 30%)
                if (indicators.lowerWickPct && indicators.lowerWickPct > 30) {
                    // RSI in oversold area (LOOSENED: 40 -> 50)
                    if (indicators.rsi14 && indicators.rsi14 < 50) {
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
                // Had a new low recently OR price at recent low area
                if (indicators.recentNewLow || indicators.priceNearLow) {
                    // Now trading above that low (OR just holding)
                    if (indicators.aboveRecentLow || indicators.holdingAboveLow) {
                        // Close in upper half of candle (LOOSENED from closeNearHigh)
                        const closePosition = indicators.closeNearHigh || (indicators.lowerWickPct && indicators.lowerWickPct > 20);
                        if (closePosition) {
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
                // ATR showing contraction (LOOSENED: removed spike requirement as primary)
                if (indicators.atrContracting || (indicators.atrSpikeRecent && !indicators.atrExpanding)) {
                    // Price stabilizing (allow marginal new low)
                    if (!indicators.newLow || indicators.holdingAboveLow) {
                        // RSI in recovery zone (LOOSENED: 25-45 -> 20-55)
                        if (indicators.rsi14 && indicators.rsi14 > 20 && indicators.rsi14 < 55) {
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
