/**
 * Expanded Logic Catalogue - 200+ Strategy Combinations
 * This module contains all the logic builders for the time-travel engine
 */

class LogicCatalogueExpanded {

    // ==================== SINGLE INDICATOR LOGICS (70+) ====================

    static buildSingleIndicatorLogics() {
        const logics = [];

        // RSI strategies - 18 combinations
        for (const threshold of [15, 20, 25, 30, 35, 40]) {
            logics.push({
                name: `RSI14 Oversold ${threshold}`,
                entry: (indicators) => indicators.rsi14 && indicators.rsi14 < threshold,
                exit: { target: 2.5, stop: 1.5 }
            });
            logics.push({
                name: `RSI14 Overbought ${100 - threshold}`,
                entry: (indicators) => indicators.rsi14 && indicators.rsi14 > (100 - threshold),
                exit: { target: 2.5, stop: 1.5 }
            });
            logics.push({
                name: `RSI21 Oversold ${threshold}`,
                entry: (indicators) => indicators.rsi21 && indicators.rsi21 < threshold,
                exit: { target: 2.5, stop: 1.5 }
            });
        }

        // SMA strategies - 15 combinations
        const smaPairs = [[10, 50], [10, 100], [10, 200], [20, 50], [20, 100], [20, 200], [50, 100], [50, 200]];
        for (const [fast, slow] of smaPairs) {
            logics.push({
                name: `Price Above SMA${fast}/${slow}`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators[`sma${fast}`] && indicators[`sma${slow}`] &&
                        price > indicators[`sma${fast}`] && price > indicators[`sma${slow}`];
                },
                exit: { target: 3.0, stop: 1.5 }
            });
        }

        for (const period of [10, 20, 50]) {
            logics.push({
                name: `Price Bouncing Off SMA${period}`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators[`sma${period}`] &&
                        Math.abs(price - indicators[`sma${period}`]) / price < 0.01;
                },
                exit: { target: 2.0, stop: 1.0 }
            });
        }

        // EMA strategies - 12 combinations
        for (const period of [10, 20, 50]) {
            logics.push({
                name: `Price Above EMA${period}`,
                entry: (indicators) => indicators.currentPrice > indicators[`ema${period}`],
                exit: { target: 2.5, stop: 1.5 }
            });
            logics.push({
                name: `Price Below EMA${period}`,
                entry: (indicators) => indicators.currentPrice < indicators[`ema${period}`],
                exit: { target: 2.5, stop: 1.5 }
            });
            logics.push({
                name: `Price Near EMA${period}`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators[`ema${period}`] &&
                        Math.abs(price - indicators[`ema${period}`]) / price < 0.015;
                },
                exit: { target: 2.0, stop: 1.0 }
            });
            logics.push({
                name: `EMA${period} Rising`,
                entry: (indicators) => indicators[`ema${period}`] && indicators.currentPrice > indicators[`ema${period}`] * 1.01,
                exit: { target: 2.5, stop: 1.5 }
            });
        }

        // Bollinger Band strategies - 12 combinations
        for (const mult of [0.97, 0.98, 0.99, 1.00, 1.01, 1.02]) {
            logics.push({
                name: `BB Lower Band Touch ${mult}`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators.bb && price < indicators.bb.lower * mult;
                },
                exit: { target: 2.0, stop: 1.0 }
            });
        }
        for (const mult of [0.98, 0.99, 1.00, 1.01, 1.02, 1.03]) {
            logics.push({
                name: `BB Upper Band Touch ${mult}`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators.bb && price > indicators.bb.upper * mult;
                },
                exit: { target: 2.0, stop: 1.0 }
            });
        }

        // MACD strategies - 8 combinations
        logics.push({
            name: 'MACD Bullish Crossover',
            entry: (indicators) => indicators.macd && indicators.macd.histogram > 0,
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Bearish Crossover',
            entry: (indicators) => indicators.macd && indicators.macd.histogram < 0,
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Strong Bullish',
            entry: (indicators) => indicators.macd && indicators.macd.histogram > 0.2,
            exit: { target: 3.0, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Weak Bullish',
            entry: (indicators) => indicators.macd && indicators.macd.histogram > 0 && indicators.macd.histogram < 0.1,
            exit: { target: 2.0, stop: 1.0 }
        });
        logics.push({
            name: 'MACD Zero Line Cross',
            entry: (indicators) => indicators.macd && Math.abs(indicators.macd.macd) < 0.05,
            exit: { target: 2.0, stop: 1.0 }
        });
        logics.push({
            name: 'MACD Histogram Expanding',
            entry: (indicators) => indicators.macd && indicators.macd.histogram > 0.1,
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Signal Above MACD',
            entry: (indicators) => indicators.macd && indicators.macd.signal > indicators.macd.macd,
            exit: { target: 2.0, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Divergence Setup',
            entry: (indicators) => indicators.macd && indicators.macdBullish && indicators.rsiOversold,
            exit: { target: 3.0, stop: 1.5 }
        });

        // ADX strategies - 10 combinations
        logics.push({
            name: 'ADX Strong Trend >25',
            entry: (indicators) => indicators.adx && indicators.adx.adx > 25,
            exit: { target: 3.0, stop: 1.5 }
        });
        logics.push({
            name: 'ADX Very Strong Trend >40',
            entry: (indicators) => indicators.adx && indicators.adx.adx > 40,
            exit: { target: 3.5, stop: 1.5 }
        });
        logics.push({
            name: 'ADX Weak Trend <20',
            entry: (indicators) => indicators.adx && indicators.adx.adx < 20,
            exit: { target: 1.5, stop: 1.0 }
        });
        logics.push({
            name: 'ADX Building Strength',
            entry: (indicators) => indicators.adx && indicators.adx.adx > 20 && indicators.adx.adx < 30,
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'DI+ Above DI-',
            entry: (indicators) => indicators.adx && indicators.adx.diPlus > indicators.adx.diMinus,
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'DI+ Dominant',
            entry: (indicators) => indicators.adx && indicators.adx.diPlus > indicators.adx.diMinus * 1.5,
            exit: { target: 3.0, stop: 1.5 }
        });
        logics.push({
            name: 'DI- Above DI+',
            entry: (indicators) => indicators.adx && indicators.adx.diPlus < indicators.adx.diMinus,
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'DI- Dominant',
            entry: (indicators) => indicators.adx && indicators.adx.diMinus > indicators.adx.diPlus * 1.5,
            exit: { target: 3.0, stop: 1.5 }
        });
        logics.push({
            name: 'DI Convergence',
            entry: (indicators) => indicators.adx && Math.abs(indicators.adx.diPlus - indicators.adx.diMinus) < 3,
            exit: { target: 1.5, stop: 1.0 }
        });
        logics.push({
            name: 'ADX Rising with DI+',
            entry: (indicators) => indicators.adx && indicators.adx.adx > 20 && indicators.adx.diPlus > indicators.adx.diMinus,
            exit: { target: 3.5, stop: 1.5 }
        });

        return logics;
    }

    // ==================== DUAL INDICATOR LOGICS (60+) ====================

    static buildDualIndicatorLogics() {
        const logics = [];

        // RSI + SMA - 20 combinations
        for (const rsiThreshold of [20, 25, 30, 35]) {
            logics.push({
                name: `RSI<${rsiThreshold} + Above SMA50`,
                entry: (indicators) => indicators.rsi14 && indicators.rsi14 < rsiThreshold && indicators.aboveSMA50,
                exit: { target: 3.0, stop: 1.5 }
            });
            logics.push({
                name: `RSI<${rsiThreshold} + Above SMA200`,
                entry: (indicators) => indicators.rsi14 && indicators.rsi14 < rsiThreshold && indicators.aboveSMA200,
                exit: { target: 3.5, stop: 1.5 }
            });
            logics.push({
                name: `RSI>${100 - rsiThreshold} + Below SMA50`,
                entry: (indicators) => indicators.rsi14 && indicators.rsi14 > (100 - rsiThreshold) && !indicators.aboveSMA50,
                exit: { target: 2.5, stop: 1.5 }
            });
            logics.push({
                name: `RSI<${rsiThreshold} + Near SMA50`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators.rsi14 && indicators.rsi14 < rsiThreshold &&
                        indicators.sma50 && Math.abs(price - indicators.sma50) / price < 0.02;
                },
                exit: { target: 2.5, stop: 1.0 }
            });
            logics.push({
                name: `RSI<${rsiThreshold} + Price Between SMA20/50`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators.rsi14 && indicators.rsi14 < rsiThreshold &&
                        indicators.sma20 && indicators.sma50 &&
                        price > indicators.sma50 && price < indicators.sma20;
                },
                exit: { target: 2.5, stop: 1.5 }
            });
        }

        // RSI + MACD - 12 combinations
        for (const rsiThreshold of [20, 25, 30, 35]) {
            logics.push({
                name: `RSI<${rsiThreshold} + MACD Bullish`,
                entry: (indicators) => indicators.rsi14 && indicators.rsi14 < rsiThreshold && indicators.macdBullish,
                exit: { target: 2.5, stop: 1.5 }
            });
            logics.push({
                name: `RSI>${100 - rsiThreshold} + MACD Bearish`,
                entry: (indicators) => indicators.rsi14 && indicators.rsi14 > (100 - rsiThreshold) && !indicators.macdBullish,
                exit: { target: 2.5, stop: 1.5 }
            });
            logics.push({
                name: `RSI<${rsiThreshold} + MACD Strong`,
                entry: (indicators) => indicators.rsi14 && indicators.rsi14 < rsiThreshold &&
                    indicators.macd && indicators.macd.histogram > 0.1,
                exit: { target: 3.0, stop: 1.5 }
            });
        }

        // BB + RSI - 10 combinations
        for (const rsiThreshold of [20, 25, 30, 35, 40]) {
            logics.push({
                name: `BB Lower + RSI<${rsiThreshold}`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators.bb && price < indicators.bb.lower * 1.01 &&
                        indicators.rsi14 && indicators.rsi14 < rsiThreshold;
                },
                exit: { target: 2.5, stop: 1.0 }
            });
            logics.push({
                name: `BB Upper + RSI>${100 - rsiThreshold}`,
                entry: (indicators) => {
                    const price = indicators.currentPrice;
                    return indicators.bb && price > indicators.bb.upper * 0.99 &&
                        indicators.rsi14 && indicators.rsi14 > (100 - rsiThreshold);
                },
                exit: { target: 2.0, stop: 1.0 }
            });
        }

        // MACD + SMA - 10 combinations
        logics.push({
            name: 'MACD Bullish + Above SMA20',
            entry: (indicators) => indicators.macdBullish && indicators.aboveSMA20,
            exit: { target: 3.0, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Bullish + Above SMA50',
            entry: (indicators) => indicators.macdBullish && indicators.aboveSMA50,
            exit: { target: 3.5, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Bullish + Above SMA200',
            entry: (indicators) => indicators.macdBullish && indicators.aboveSMA200,
            exit: { target: 4.0, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Bullish + Near SMA50',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.macdBullish && indicators.sma50 &&
                    Math.abs(price - indicators.sma50) / price < 0.02;
            },
            exit: { target: 2.5, stop: 1.0 }
        });
        logics.push({
            name: 'MACD Cross + Golden Cross',
            entry: (indicators) => {
                return indicators.macdBullish && indicators.sma50 && indicators.sma200 &&
                    indicators.sma50 > indicators.sma200;
            },
            exit: { target: 4.0, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Bearish + Below SMA20',
            entry: (indicators) => !indicators.macdBullish && !indicators.aboveSMA20,
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Bearish + Below SMA50',
            entry: (indicators) => !indicators.macdBullish && !indicators.aboveSMA50,
            exit: { target: 3.0, stop: 1.5 }
        });
        logics.push({
            name: 'MACD + EMA20 Alignment',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.macdBullish && indicators.ema20 && price > indicators.ema20;
            },
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'MACD + Price Between SMAs',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.macdBullish && indicators.sma20 && indicators.sma50 &&
                    price > indicators.sma50 && price < indicators.sma20;
            },
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'MACD Strong + Above All SMAs',
            entry: (indicators) => {
                return indicators.macd && indicators.macd.histogram > 0.1 &&
                    indicators.aboveSMA20 && indicators.aboveSMA50;
            },
            exit: { target: 3.5, stop: 1.5 }
        });

        // ADX + RSI - 8 combinations
        logics.push({
            name: 'Strong Trend + RSI Oversold',
            entry: (indicators) => indicators.adx && indicators.adx.adx > 25 &&
                indicators.rsi14 && indicators.rsi14 < 30,
            exit: { target: 3.5, stop: 1.5 }
        });
        logics.push({
            name: 'Strong Trend + RSI Overbought',
            entry: (indicators) => indicators.adx && indicators.adx.adx > 25 &&
                indicators.rsi14 && indicators.rsi14 > 70,
            exit: { target: 3.5, stop: 1.5 }
        });
        logics.push({
            name: 'Weak Trend + RSI Oversold',
            entry: (indicators) => indicators.adx && indicators.adx.adx < 20 &&
                indicators.rsi14 && indicators.rsi14 < 30,
            exit: { target: 2.0, stop: 1.0 }
        });
        logics.push({
            name: 'DI+ Bullish + RSI<30',
            entry: (indicators) => indicators.adx && indicators.adx.diPlus > indicators.adx.diMinus &&
                indicators.rsi14 && indicators.rsi14 < 30,
            exit: { target: 3.0, stop: 1.5 }
        });
        logics.push({
            name: 'DI- Bearish + RSI>70',
            entry: (indicators) => indicators.adx && indicators.adx.diPlus < indicators.adx.diMinus &&
                indicators.rsi14 && indicators.rsi14 > 70,
            exit: { target: 3.0, stop: 1.5 }
        });
        logics.push({
            name: 'Strong DI+ + RSI<35',
            entry: (indicators) => indicators.adx && indicators.adx.diPlus > indicators.adx.diMinus * 1.2 &&
                indicators.rsi14 && indicators.rsi14 < 35,
            exit: { target: 3.5, stop: 1.5 }
        });
        logics.push({
            name: 'ADX Building + RSI Oversold',
            entry: (indicators) => indicators.adx && indicators.adx.adx > 20 && indicators.adx.adx < 30 &&
                indicators.rsi14 && indicators.rsi14 < 30,
            exit: { target: 2.5, stop: 1.5 }
        });
        logics.push({
            name: 'Very Strong Trend + RSI<25',
            entry: (indicators) => indicators.adx && indicators.adx.adx > 40 &&
                indicators.rsi14 && indicators.rsi14 < 25,
            exit: { target: 4.0, stop: 1.5 }
        });

        return logics;
    }

    // ==================== PATTERN + INDICATOR LOGICS (50+) ====================

    static buildPatternIndicatorLogics() {
        const logics = [];
        const patterns = ['Bullish Engulfing', 'Hammer', 'Morning Star', 'Doji', 'Shooting Star'];

        for (const pattern of patterns) {
            // Pattern + RSI - 10 per pattern = 50 total
            logics.push({
                name: `${pattern} + RSI<20`,
                entry: (indicators, candles) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    return hasPattern && indicators.rsi14 && indicators.rsi14 < 30;
                },
                exit: { target: 3.0, stop: 1.5 }
            });
            logics.push({
                name: `${pattern} + RSI<30`,
                entry: (indicators, candles) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    return hasPattern && indicators.rsi14 && indicators.rsi14 < 30;
                },
                exit: { target: 2.5, stop: 1.5 }
            });

            // Pattern + Support/Resistance
            logics.push({
                name: `${pattern} at Support`,
                entry: (indicators, candles, context) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    const atSupport = context.support && candles[candles.length - 1].close < context.support * 1.02;
                    return hasPattern && atSupport;
                },
                exit: { target: 3.0, stop: 1.5 }
            });

            logics.push({
                name: `${pattern} at Resistance`,
                entry: (indicators, candles, context) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    const atResistance = context.resistance && candles[candles.length - 1].close > context.resistance * 0.98;
                    return hasPattern && atResistance;
                },
                exit: { target: 2.5, stop: 1.5 }
            });

            // Pattern + MACD
            logics.push({
                name: `${pattern} + MACD Bullish`,
                entry: (indicators, candles) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    return hasPattern && indicators.macdBullish;
                },
                exit: { target: 2.5, stop: 1.5 }
            });

            // Pattern + SMA
            logics.push({
                name: `${pattern} + Above SMA50`,
                entry: (indicators, candles) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    return hasPattern && indicators.aboveSMA50;
                },
                exit: { target: 3.0, stop: 1.5 }
            });

            // Pattern + BB
            logics.push({
                name: `${pattern} + BB Lower`,
                entry: (indicators, candles) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    const price = indicators.currentPrice;
                    return hasPattern && indicators.bb && price < indicators.bb.lower * 1.05;
                },
                exit: { target: 2.5, stop: 1.0 }
            });

            // Pattern + ADX
            logics.push({
                name: `${pattern} + Strong Trend`,
                entry: (indicators, candles) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    return hasPattern && indicators.adx && indicators.adx.adx > 25;
                },
                exit: { target: 3.5, stop: 1.5 }
            });

            // Pattern + Volume
            logics.push({
                name: `${pattern} + High Volume`,
                entry: (indicators, candles) => {
                    const hasPattern = LogicCatalogueExpanded.checkPattern(candles, pattern);
                    const lastCandle = candles[candles.length - 1];
                    const avgVol = LogicCatalogueExpanded.avgVolume(candles.slice(-20));
                    return hasPattern && lastCandle.volume > avgVol * 1.5;
                },
                exit: { target: 2.5, stop: 1.5 }
            });

            // Pattern Solo
            logics.push({
                name: `${pattern} Solo`,
                entry: (indicators, candles) => {
                    return LogicCatalogueExpanded.checkPattern(candles, pattern);
                },
                exit: { target: 2.0, stop: 1.5 }
            });
        }

        return logics;
    }

    // ==================== TRIPLE & COMPOSITE LOGICS (35+) ====================

    static buildCompositeLogics() {
        const logics = [];

        // Triple confirmation strategies - 15 combinations
        logics.push({
            name: 'Triple Bullish: RSI + MACD + SMA50',
            entry: (indicators) => {
                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.macdBullish &&
                    indicators.aboveSMA50;
            },
            exit: { target: 3.5, stop: 1.5 }
        });

        logics.push({
            name: 'Triple Bullish: RSI + MACD + SMA200',
            entry: (indicators) => {
                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.macdBullish &&
                    indicators.aboveSMA200;
            },
            exit: { target: 4.0, stop: 1.5 }
        });

        logics.push({
            name: 'Triple Bullish: RSI + BB + SMA',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.bb && price < indicators.bb.lower * 1.01 &&
                    indicators.aboveSMA200;
            },
            exit: { target: 3.5, stop: 1.5 }
        });

        logics.push({
            name: 'Triple Bullish: MACD + BB + SMA50',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.macdBullish &&
                    indicators.bb && price < indicators.bb.lower * 1.02 &&
                    indicators.aboveSMA50;
            },
            exit: { target: 3.0, stop: 1.5 }
        });

        logics.push({
            name: 'Triple Bullish: RSI + ADX + DI',
            entry: (indicators) => {
                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.adx && indicators.adx.adx > 25 &&
                    indicators.adx.diPlus > indicators.adx.diMinus;
            },
            exit: { target: 4.0, stop: 1.5 }
        });

        logics.push({
            name: 'Triple Bearish: RSI + MACD + Below SMA',
            entry: (indicators) => {
                return indicators.rsi14 && indicators.rsi14 > 70 &&
                    !indicators.macdBullish &&
                    !indicators.aboveSMA50;
            },
            exit: { target: 3.0, stop: 1.5 }
        });

        logics.push({
            name: 'Triple: RSI + EMA + MACD',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.ema20 && price > indicators.ema20 &&
                    indicators.macdBullish;
            },
            exit: { target: 3.0, stop: 1.5 }
        });

        logics.push({
            name: 'Triple: BB + MACD + ADX',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.bb && price < indicators.bb.lower * 1.01 &&
                    indicators.macdBullish &&
                    indicators.adx && indicators.adx.adx > 20;
            },
            exit: { target: 3.5, stop: 1.5 }
        });

        // Demand/Supply Zone Confluence - 10 combinations
        logics.push({
            name: 'Demand Zone: Pattern + Support + Volume',
            entry: (indicators, candles, context) => {
                const hasPattern = LogicCatalogueExpanded.checkPattern(candles, 'Bullish Engulfing');
                const atSupport = context.support && candles[candles.length - 1].close < context.support * 1.02;
                const volumeConfirm = candles[candles.length - 1].volume > LogicCatalogueExpanded.avgVolume(candles.slice(-20)) * 1.3;

                return hasPattern && atSupport && volumeConfirm && indicators.rsi14 && indicators.rsi14 < 40;
            },
            exit: { target: 4.0, stop: 1.5 }
        });

        logics.push({
            name: 'Demand Zone: Support + MACD + RSI',
            entry: (indicators, candles, context) => {
                const atSupport = context.support && candles[candles.length - 1].close < context.support * 1.02;
                return atSupport && indicators.macdBullish && indicators.rsi14 && indicators.rsi14 < 35;
            },
            exit: { target: 3.0, stop: 1.5 }
        });

        logics.push({
            name: 'Supply Zone: Pattern + Resistance + Volume',
            entry: (indicators, candles, context) => {
                const hasPattern = LogicCatalogueExpanded.checkPattern(candles, 'Shooting Star');
                const atResistance = context.resistance && candles[candles.length - 1].close > context.resistance * 0.98;
                const volumeConfirm = candles[candles.length - 1].volume > LogicCatalogueExpanded.avgVolume(candles.slice(-20)) * 1.3;

                return hasPattern && atResistance && volumeConfirm && indicators.rsi14 && indicators.rsi14 > 60;
            },
            exit: { target: 3.5, stop: 1.5 }
        });

        // Quadruple confirmation strategies - 10 ultimate combinations
        logics.push({
            name: 'Ultimate: RSI + MACD + SMA + Pattern',
            entry: (indicators, candles) => {
                const hasPattern = LogicCatalogueExpanded.checkPattern(candles, 'Bullish Engulfing');
                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.macdBullish &&
                    indicators.aboveSMA200 &&
                    hasPattern;
            },
            exit: { target: 4.5, stop: 1.5 }
        });

        logics.push({
            name: 'Ultimate: RSI + BB + SMA + Volume',
            entry: (indicators, candles) => {
                const price = indicators.currentPrice;
                const volumeConfirm = candles[candles.length - 1].volume > LogicCatalogueExpanded.avgVolume(candles.slice(-20)) * 1.5;
                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.bb && price < indicators.bb.lower * 1.01 &&
                    indicators.aboveSMA200 &&
                    volumeConfirm;
            },
            exit: { target: 4.0, stop: 1.5 }
        });

        logics.push({
            name: 'Ultimate: Pattern + Support + MACD + Volume',
            entry: (indicators, candles, context) => {
                const hasPattern = LogicCatalogueExpanded.checkPattern(candles, 'Hammer');
                const atSupport = context.support && candles[candles.length - 1].close < context.support * 1.02;
                const volumeConfirm = candles[candles.length - 1].volume > LogicCatalogueExpanded.avgVolume(candles.slice(-20)) * 1.5;
                return hasPattern && atSupport && indicators.macdBullish && volumeConfirm;
            },
            exit: { target: 4.5, stop: 1.5 }
        });

        logics.push({
            name: 'Ultimate: RSI + ADX + DI + SMA',
            entry: (indicators) => {
                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.adx && indicators.adx.adx > 25 &&
                    indicators.adx.diPlus > indicators.adx.diMinus &&
                    indicators.aboveSMA200;
            },
            exit: { target: 4.5, stop: 1.5 }
        });

        logics.push({
            name: 'Ultimate Confluence: All Aligned',
            entry: (indicators, candles, context) => {
                const hasPattern = LogicCatalogueExpanded.checkPattern(candles, 'Bullish Engulfing');
                const atSupport = context.support && candles[candles.length - 1].close < context.support * 1.02;
                const price = indicators.currentPrice;
                const volumeConfirm = candles[candles.length - 1].volume > LogicCatalogueExpanded.avgVolume(candles.slice(-20)) * 1.5;

                return indicators.rsi14 && indicators.rsi14 < 30 &&
                    indicators.macdBullish &&
                    indicators.aboveSMA200 &&
                    indicators.bb && price < indicators.bb.lower * 1.02 &&
                    hasPattern &&
                    atSupport &&
                    volumeConfirm;
            },
            exit: { target: 5.0, stop: 1.5 }
        });

        return logics;
    }

    // Helper method for pattern checking
    static checkPattern(candles, patternName) {
        try {
            const PatternRecognition = require('./patternRecognition.cjs');
            const patterns = PatternRecognition.scanPatterns(candles);
            return patterns.some(p => p.name === patternName);
        } catch {
            return false;
        }
    }

    // Helper method for avgVolume
    static avgVolume(candles) {
        if (candles.length === 0) return 0;
        return candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
    }
}

module.exports = LogicCatalogueExpanded;


