/**
 * Professional Entry Validator Service
 * 
 * PURPOSE: Validate trade entries like a 20+ year institutional trader
 * 
 * Entry Checklist:
 * 1. Technical Setup (RSI, MACD, indicators)
 * 2. Volume Confirmation (must have above-average volume)
 * 3. Price Action Patterns (hammer, engulfing, etc.)
 * 4. Trend Context (are we buying dips in uptrend?)
 * 5. Category-Specific Rules
 * 
 * Philosophy: Every check must pass. One failed check = NO ENTRY.
 */

class EntryValidator {

    constructor() {
        // Minimum requirements for any entry
        this.requirements = {
            minVolumeRatio: 1.2,      // Volume must be 1.2x average
            minEventScore: 25,         // From event reconstruction
            minSimilarity: 40,         // Category signature match
            maxRSI_oversold: 35,       // RSI threshold for oversold entries
            minRSI_momentum: 50,       // RSI threshold for momentum entries
            trendConfirmationDays: 5   // Days to check for trend
        };
    }

    // ============================================================
    // MAIN VALIDATION ENTRY POINT
    // ============================================================

    /**
     * Validate entry - ALL checks must pass
     * @param {Object} context - { candles, indicators, eventResult, similarity, categoryKey }
     * @returns {Object} - { valid, score, signals[], rejections[], entry }
     */
    validateEntry(context) {
        const {
            candles,
            indicators,
            eventResult,
            similarity,
            categoryKey,
            v1Strategy
        } = context;

        const results = {
            valid: false,
            score: 0,
            maxScore: 100,
            signals: [],      // What's working FOR the trade
            rejections: [],   // What's working AGAINST
            entry: null
        };

        if (!candles || candles.length < 50) {
            results.rejections.push('Insufficient candle data');
            return results;
        }

        const currentCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];

        // ============================================================
        // LAYER 1: Volume Confirmation (25 points)
        // ============================================================
        const volumeCheck = this.checkVolume(candles);
        if (volumeCheck.valid) {
            results.signals.push(volumeCheck.reason);
            results.score += volumeCheck.points;
        } else {
            results.rejections.push(volumeCheck.reason);
        }

        // ============================================================
        // LAYER 2: Price Action Patterns (25 points)
        // ============================================================
        const priceAction = this.checkPriceAction(candles);
        if (priceAction.valid) {
            results.signals.push(priceAction.reason);
            results.score += priceAction.points;
        } else {
            // Don't reject, just don't add points
            // Price action is bonus, not mandatory
        }

        // ============================================================
        // LAYER 3: Trend Context (20 points)
        // ============================================================
        const trendCheck = this.checkTrendContext(candles, indicators, categoryKey);
        if (trendCheck.valid) {
            results.signals.push(trendCheck.reason);
            results.score += trendCheck.points;
        } else {
            results.rejections.push(trendCheck.reason);
        }

        // ============================================================
        // LAYER 4: Technical Indicators (20 points)
        // ============================================================
        const technicalCheck = this.checkTechnicals(indicators, categoryKey);
        if (technicalCheck.valid) {
            results.signals.push(technicalCheck.reason);
            results.score += technicalCheck.points;
        } else {
            results.rejections.push(technicalCheck.reason);
        }

        // ============================================================
        // LAYER 5: Category-Specific Validation (10 points)
        // ============================================================
        const categoryCheck = this.checkCategorySpecific(candles, indicators, categoryKey);
        if (categoryCheck.valid) {
            results.signals.push(categoryCheck.reason);
            results.score += categoryCheck.points;
        } else {
            results.rejections.push(categoryCheck.reason);
        }

        // ============================================================
        // FINAL DECISION
        // ============================================================

        // Must pass: Volume + Trend + Technicals (minimum 65 points)
        // Plus no critical rejections
        const criticalRejections = results.rejections.filter(r =>
            r.includes('Volume') || r.includes('Hostile') || r.includes('Against trend')
        );

        results.valid = results.score >= 50 && criticalRejections.length === 0;

        if (results.valid) {
            // Calculate ATR-based stops
            const atr = this.calculateATR(candles);
            const entryPrice = currentCandle.close;

            results.entry = {
                entryPrice,
                // ATR-based stops (2x ATR for stop, 3x ATR for target)
                stopLoss: entryPrice - (atr * 2),
                stopLossPercent: ((atr * 2) / entryPrice * 100).toFixed(2),
                targetPrice: entryPrice + (atr * 3),
                targetPercent: ((atr * 3) / entryPrice * 100).toFixed(2),
                rewardRiskRatio: 1.5,
                atr: atr.toFixed(2),
                validationScore: results.score,
                passedChecks: results.signals,
                confidence: this.calculateConfidence(results.score, results.signals.length)
            };
        }

        return results;
    }

    // ============================================================
    // VOLUME VALIDATION
    // ============================================================

    checkVolume(candles) {
        const currentVolume = candles[candles.length - 1].volume;

        // Calculate 20-day average volume
        const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;

        const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

        if (volumeRatio >= 1.5) {
            return {
                valid: true,
                points: 25,
                reason: `Strong volume: ${volumeRatio.toFixed(1)}x average`,
                volumeRatio
            };
        } else if (volumeRatio >= 1.2) {
            return {
                valid: true,
                points: 15,
                reason: `Adequate volume: ${volumeRatio.toFixed(1)}x average`,
                volumeRatio
            };
        } else {
            return {
                valid: false,
                points: 0,
                reason: `Volume too low: ${volumeRatio.toFixed(1)}x average (need 1.2x+)`,
                volumeRatio
            };
        }
    }

    // ============================================================
    // PRICE ACTION PATTERNS
    // ============================================================

    checkPriceAction(candles) {
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const prev2 = candles[candles.length - 3];

        const patterns = [];

        // Hammer Pattern
        if (this.isHammer(current)) {
            patterns.push({ name: 'Hammer', points: 15 });
        }

        // Bullish Engulfing
        if (this.isBullishEngulfing(current, prev)) {
            patterns.push({ name: 'Bullish Engulfing', points: 20 });
        }

        // Morning Star (3-candle pattern)
        if (this.isMorningStar(current, prev, prev2)) {
            patterns.push({ name: 'Morning Star', points: 25 });
        }

        // Doji at support
        if (this.isDoji(current)) {
            patterns.push({ name: 'Doji', points: 10 });
        }

        // Strong close (closing in upper 25% of range)
        const range = current.high - current.low;
        const closePosition = range > 0 ? (current.close - current.low) / range : 0.5;
        if (closePosition > 0.75) {
            patterns.push({ name: 'Strong Close', points: 10 });
        }

        if (patterns.length > 0) {
            const best = patterns.reduce((a, b) => a.points > b.points ? a : b);
            return {
                valid: true,
                points: best.points,
                reason: best.name + ' detected',
                patterns: patterns.map(p => p.name)
            };
        }

        return {
            valid: false,
            points: 0,
            reason: 'No bullish price action',
            patterns: []
        };
    }

    isHammer(candle) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const upperWick = candle.high - Math.max(candle.open, candle.close);

        return range > 0 &&
            lowerWick / range > 0.6 &&
            body / range < 0.3 &&
            upperWick < body;
    }

    isBullishEngulfing(current, prev) {
        const prevBearish = prev.close < prev.open;
        const currentBullish = current.close > current.open;
        const engulfs = current.open < prev.close && current.close > prev.open;

        return prevBearish && currentBullish && engulfs;
    }

    isMorningStar(current, prev, prev2) {
        // First candle: Strong bearish
        const firstBearish = prev2.close < prev2.open &&
            Math.abs(prev2.close - prev2.open) / prev2.close > 0.01;

        // Second candle: Small body (star)
        const secondSmall = Math.abs(prev.close - prev.open) / prev.close < 0.005;

        // Third candle: Strong bullish closing above midpoint of first
        const thirdBullish = current.close > current.open &&
            current.close > (prev2.open + prev2.close) / 2;

        return firstBearish && secondSmall && thirdBullish;
    }

    isDoji(candle) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        return range > 0 && body / range < 0.1;
    }

    // ============================================================
    // TREND CONTEXT
    // ============================================================

    checkTrendContext(candles, indicators, categoryKey) {
        const closes = candles.map(c => c.close);
        const current = closes[closes.length - 1];

        // Calculate SMAs
        const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;

        // Check recent trend (last 5 days)
        const recent5 = closes.slice(-5);
        const higherHighs = recent5.slice(1).every((c, i) => c >= recent5[i] * 0.99);

        // For DOWNSIDE/LOM categories, we want mean reversion (buying dip in uptrend)
        const isLongCategory = categoryKey?.includes('DOWNSIDE') ||
            categoryKey?.includes('SUPPORT') ||
            categoryKey?.includes('LOM');

        const isBreakoutCategory = categoryKey?.includes('BREAKOUT') ||
            categoryKey?.includes('BO_UP') ||
            categoryKey?.includes('POWERED');

        if (isLongCategory) {
            // Mean reversion: Want pullback to support in uptrend
            if (current > sma50 && current < sma20 * 1.02) {
                return {
                    valid: true,
                    points: 20,
                    reason: 'Uptrend pullback to MA support'
                };
            } else if (current > sma50) {
                return {
                    valid: true,
                    points: 15,
                    reason: 'Above SMA50 uptrend intact'
                };
            } else {
                return {
                    valid: false,
                    points: 0,
                    reason: 'Against trend: Price below SMA50'
                };
            }
        }

        if (isBreakoutCategory) {
            // Breakout: Want price breaking above resistance
            if (current > sma20 && current > sma50) {
                return {
                    valid: true,
                    points: 20,
                    reason: 'Breaking above moving averages'
                };
            } else {
                return {
                    valid: false,
                    points: 0,
                    reason: 'No breakout: Below moving averages'
                };
            }
        }

        // Default: Just check not in hostile downtrend
        if (current > sma50 * 0.95) {
            return {
                valid: true,
                points: 15,
                reason: 'Trend context acceptable'
            };
        }

        return {
            valid: false,
            points: 0,
            reason: 'Hostile downtrend detected'
        };
    }

    // ============================================================
    // TECHNICAL INDICATORS
    // ============================================================

    checkTechnicals(indicators, categoryKey) {
        if (!indicators) {
            return { valid: false, points: 0, reason: 'No indicator data' };
        }

        const signals = [];

        // RSI Check
        if (indicators.rsi14 !== undefined) {
            if (indicators.rsi14 < 35) {
                signals.push({ name: 'RSI Oversold', points: 10 });
            } else if (indicators.rsi14 >= 35 && indicators.rsi14 < 65) {
                signals.push({ name: 'RSI Neutral', points: 5 });
            }
            // RSI > 70 would be overbought - no signal
        }

        // MACD Check
        if (indicators.macd) {
            if (indicators.macd.histogram > 0) {
                signals.push({ name: 'MACD Bullish', points: 10 });
            } else if (indicators.macd.histogram > indicators.macd.histogram * 0.9) {
                // Histogram improving
                signals.push({ name: 'MACD Improving', points: 5 });
            }
        }

        // Bollinger Bands
        if (indicators.bb) {
            const current = indicators.currentPrice || indicators.bb.middle;
            if (current <= indicators.bb.lower * 1.02) {
                signals.push({ name: 'BB Lower Touch', points: 10 });
            }
        }

        // Stochastic
        if (indicators.stochastic && indicators.stochastic.k < 25) {
            signals.push({ name: 'Stochastic Oversold', points: 5 });
        }

        if (signals.length > 0) {
            const totalPoints = Math.min(20, signals.reduce((sum, s) => sum + s.points, 0));
            return {
                valid: true,
                points: totalPoints,
                reason: signals.map(s => s.name).join(' + ')
            };
        }

        return {
            valid: false,
            points: 0,
            reason: 'No supportive technical signals'
        };
    }

    // ============================================================
    // CATEGORY-SPECIFIC RULES
    // ============================================================

    checkCategorySpecific(candles, indicators, categoryKey) {
        if (!categoryKey) {
            return { valid: true, points: 5, reason: 'Default logic applied' };
        }

        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        // DOWNSIDE_LOM_SWING - Looking for hammer at low-of-move
        if (categoryKey.includes('DOWNSIDE_LOM') || categoryKey.includes('LOM_SWING')) {
            // Need: Recent decline + reversal candle + volume
            const decline5Day = (current.close - candles[candles.length - 6].close) / candles[candles.length - 6].close;

            if (decline5Day < -0.03 && this.isHammer(current)) {
                return { valid: true, points: 10, reason: 'LOM: Hammer after decline' };
            } else if (decline5Day < -0.03) {
                return { valid: true, points: 5, reason: 'LOM: Pullback detected' };
            }
            return { valid: false, points: 0, reason: 'LOM: No clear reversal setup' };
        }

        // MULTI_RESISTANCE_BO - Looking for breakout above resistance
        if (categoryKey.includes('RESISTANCE') || categoryKey.includes('BO_UP')) {
            // Need: Break above recent high with volume
            const high5Day = Math.max(...candles.slice(-6, -1).map(c => c.high));

            if (current.close > high5Day) {
                return { valid: true, points: 10, reason: 'Breakout above 5-day high' };
            }
            return { valid: false, points: 0, reason: 'No breakout confirmation' };
        }

        // HIGH_POWERED_STOCKS - Momentum continuation
        if (categoryKey.includes('POWERED') || categoryKey.includes('INTRADAY')) {
            // Need: Gap up or strong opening range break
            const gap = (current.open - prev.close) / prev.close;

            if (gap > 0.01) {
                return { valid: true, points: 10, reason: 'Gap up opening' };
            } else if (current.close > current.open) {
                return { valid: true, points: 5, reason: 'Bullish intraday' };
            }
            return { valid: false, points: 0, reason: 'No momentum setup' };
        }

        // DEFAULT
        return { valid: true, points: 5, reason: 'Standard validation passed' };
    }

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================

    calculateATR(candles, period = 14) {
        const trueRanges = [];

        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trueRanges.push(tr);
        }

        if (trueRanges.length < period) return 0;

        const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
        return atr;
    }

    calculateConfidence(score, signalCount) {
        // Base confidence on score
        let confidence = Math.min(95, score);

        // Bonus for multiple confirming signals
        confidence += signalCount * 2;

        return Math.min(95, confidence);
    }
}

module.exports = new EntryValidator();
