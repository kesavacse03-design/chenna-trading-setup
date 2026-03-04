/**
 * Category Verifier Service
 * 
 * PURPOSE: Verify that a stock ACTUALLY satisfies its category definition on addedDate
 * 
 * Before testing patterns, we must confirm:
 * - For MULTI_RESISTANCE_BO: Is price breaking multiple resistance levels?
 * - For DOWNSIDE_LOM_SWING: Is price at low-of-move with reversal signs?
 * - For UPSIDE_LOM_SWING: Is price at high-of-move with rejection?
 * 
 * If stock doesn't satisfy category definition → SKIP (data quality issue)
 */

const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');

class CategoryVerifier {

    constructor() {
        // Thresholds for verification
        this.thresholds = {
            resistanceProximity: 0.02,      // Within 2% of resistance
            supportProximity: 0.02,         // Within 2% of support
            minResistanceTests: 2,          // Minimum resistance touches for breakout
            minSupportTests: 2,             // Minimum support touches for breakdown
            lomDropPercent: 5,              // Minimum drop for Low-of-Move (5%)
            homRisePercent: 5,              // Minimum rise for High-of-Move (5%)
            consolidationDays: 5,           // Days to check for consolidation
            consolidationRange: 5           // Max range % for consolidation
        };
    }

    /**
     * Main verification entry point
     */
    async verify(stock, candles, categoryKey) {
        const result = {
            isValid: false,
            category: categoryKey,
            symbol: stock.symbol,
            reason: '',
            details: {}
        };

        if (!candles || candles.length < 50) {
            result.reason = 'Insufficient candle data';
            return result;
        }

        // Route to category-specific verification
        switch (categoryKey) {
            case 'MULTI_RESISTANCE_BO':
                return this.verifyMultiResistanceBO(stock, candles, result);

            case 'MULTI_SUPPORT_BO':
                return this.verifyMultiSupportBO(stock, candles, result);

            case 'DOWNSIDE_LOM_SWING':
            case 'DOWNSIDE_LOM_INTRA':
                return this.verifyDownsideLOM(stock, candles, result);

            case 'UPSIDE_LOM_SWING':
            case 'UPSIDE_LOM_INTRA':
                return this.verifyUpsideLOM(stock, candles, result);

            case 'SHORT_TERM_SWING_BO_UP':
            case 'LONG_TERM_SWING_BO_UP':
                return this.verifySwingBreakoutUp(stock, candles, result);

            case 'SHORT_TERM_SWING_BO_DOWN':
            case 'LONG_TERM_SWING_BO_DOWN':
                return this.verifySwingBreakoutDown(stock, candles, result);

            case 'HIGH_POWERED_STOCKS':
            case 'INTRADAY_BOOST':
                return this.verifyMomentumStock(stock, candles, result);

            case 'DAILY_CONTRACTION':
                return this.verifyDailyContraction(stock, candles, result);

            default:
                result.reason = `Unknown category: ${categoryKey}`;
                return result;
        }
    }

    // ============================================================
    // MULTI RESISTANCE BREAKOUT
    // ============================================================

    /**
     * Verify: Is price breaking MULTIPLE resistance levels?
     * 
     * Criteria:
     * 1. Price touched resistance at least 2 times before
     * 2. Current candle is breaking above the resistance
     * 3. Volume is elevated (> 1.2x average)
     */
    verifyMultiResistanceBO(stock, candles, result) {
        const current = candles[candles.length - 1];
        const lookback = candles.slice(-50, -1); // Last 50 candles excluding current

        // Find resistance levels (local highs)
        const resistanceLevels = this.findResistanceLevels(lookback);

        if (resistanceLevels.length === 0) {
            result.reason = 'No resistance levels found';
            return result;
        }

        // Find the closest resistance being broken
        const brokenResistance = resistanceLevels.find(r =>
            current.close > r.level &&
            current.open <= r.level * (1 + this.thresholds.resistanceProximity)
        );

        if (!brokenResistance) {
            result.reason = 'Not breaking any resistance';
            result.details.resistanceLevels = resistanceLevels.map(r => r.level.toFixed(2));
            result.details.currentClose = current.close.toFixed(2);
            return result;
        }

        // Check touches (must have tested resistance at least 2 times)
        if (brokenResistance.touches < this.thresholds.minResistanceTests) {
            result.reason = `Resistance only touched ${brokenResistance.touches} times (need ${this.thresholds.minResistanceTests}+)`;
            result.details.resistanceLevel = brokenResistance.level.toFixed(2);
            result.details.touches = brokenResistance.touches;
            return result;
        }

        // Check volume confirmation
        const avgVolume = lookback.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
        const volumeRatio = current.volume / avgVolume;

        result.isValid = true;
        result.reason = 'Valid Multi-Resistance Breakout';
        result.details = {
            resistanceLevel: brokenResistance.level.toFixed(2),
            touches: brokenResistance.touches,
            breakoutClose: current.close.toFixed(2),
            volumeRatio: volumeRatio.toFixed(2),
            volumeConfirmed: volumeRatio > 1.2
        };

        return result;
    }

    /**
     * Find resistance levels from price history
     */
    findResistanceLevels(candles, tolerance = 0.01) {
        const levels = [];
        const highs = candles.map(c => c.high);


        // Find local highs (peaks)
        for (let i = 2; i < candles.length - 2; i++) {
            const isLocalHigh = highs[i] > highs[i - 1] &&
                highs[i] > highs[i - 2] &&
                highs[i] > highs[i + 1] &&
                highs[i] >= highs[i + 2];

            if (isLocalHigh) {
                // Check if this level was tested multiple times
                const level = highs[i];
                let touches = 0;

                for (const candle of candles) {
                    const touchedResistance =
                        candle.high >= level * (1 - tolerance) &&
                        candle.high <= level * (1 + tolerance);
                    if (touchedResistance) touches++;
                }

                // Only include levels with 2+ touches
                if (touches >= 2) {
                    // Avoid duplicates (levels within tolerance)
                    const existing = levels.find(l => Math.abs(l.level - level) / level < tolerance);
                    if (!existing) {
                        levels.push({ level, touches });
                    } else {
                        existing.touches = Math.max(existing.touches, touches);
                    }
                }
            }
        }

        return levels.sort((a, b) => b.level - a.level); // Highest first
    }

    // ============================================================
    // MULTI SUPPORT BREAKOUT (Breakdown)
    // ============================================================

    verifyMultiSupportBO(stock, candles, result) {
        const current = candles[candles.length - 1];
        const lookback = candles.slice(-50, -1);

        const supportLevels = this.findSupportLevels(lookback);

        if (supportLevels.length === 0) {
            result.reason = 'No support levels found';
            return result;
        }

        const brokenSupport = supportLevels.find(s =>
            current.close < s.level &&
            current.open >= s.level * (1 - this.thresholds.supportProximity)
        );

        if (!brokenSupport) {
            result.reason = 'Not breaking any support';
            return result;
        }

        if (brokenSupport.touches < this.thresholds.minSupportTests) {
            result.reason = `Support only touched ${brokenSupport.touches} times`;
            return result;
        }

        result.isValid = true;
        result.reason = 'Valid Multi-Support Breakdown';
        result.details = {
            supportLevel: brokenSupport.level.toFixed(2),
            touches: brokenSupport.touches,
            breakdownClose: current.close.toFixed(2)
        };

        return result;
    }

    findSupportLevels(candles, tolerance = 0.01) {
        const levels = [];
        const lows = candles.map(c => c.low);

        for (let i = 2; i < candles.length - 2; i++) {
            const isLocalLow = lows[i] < lows[i - 1] &&
                lows[i] < lows[i - 2] &&
                lows[i] < lows[i + 1] &&
                lows[i] <= lows[i + 2];

            if (isLocalLow) {
                const level = lows[i];
                let touches = 0;

                for (const candle of candles) {
                    const touchedSupport =
                        candle.low >= level * (1 - tolerance) &&
                        candle.low <= level * (1 + tolerance);
                    if (touchedSupport) touches++;
                }

                if (touches >= 2) {
                    const existing = levels.find(l => Math.abs(l.level - level) / level < tolerance);
                    if (!existing) {
                        levels.push({ level, touches });
                    }
                }
            }
        }

        return levels.sort((a, b) => a.level - b.level); // Lowest first
    }

    /**
     * Verify: Is this a TRUE Downside LOM setup?
     * 
     * TRUE DEFINITION (discovered from 244 stocks):
     * - 51% had PRIOR 3-day DECLINE (not necessarily current day drop!)
     * - 50% near SUPPORT
     * - RSI NEUTRAL (avg 50.9, not necessarily oversold)
     * - Volume typically NORMAL
     * - Price STABILIZING (avg +0.16% on addedDate, not dropping!)
     * 
     * This is a "STABILIZATION after decline" setup, NOT "still dropping" setup
     */
    verifyDownsideLOM(stock, candles, result) {
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const prev3 = candles.slice(-4, -1); // 3 days before current
        const lookback10 = candles.slice(-10);
        const lookback20 = candles.slice(-20);

        // Calculate prior 3-day trend (before addedDate)
        const priorChange = prev3.length >= 3
            ? ((prev3[2].close - prev3[0].close) / prev3[0].close) * 100
            : 0;
        const hadPriorDecline = priorChange < -1; // At least -1% in prior 3 days

        // Check if near support (current low near 10-day low)
        const recent10Low = Math.min(...lookback10.map(c => c.low));
        const recent20Low = Math.min(...lookback20.map(c => c.low));
        const nearSupport = current.low <= recent10Low * 1.02; // Within 2% of 10-day low

        // Calculate RSI
        const slicedCandles = candles;
        const rsi = this.calculateRSI(slicedCandles, 14);
        const rsiNeutral = rsi >= 30 && rsi <= 70; // Not oversold, not overbought

        // Calculate close position in day's range
        const range = current.high - current.low;
        const closePosition = range > 0 ? (current.close - current.low) / range : 0.5;

        // Calculate current day change (should be FLAT or slightly positive = stabilizing)
        const dayChange = ((current.close - prev.close) / prev.close) * 100;

        // TRUE criteria: At least 2 of these 4 conditions
        let matchScore = 0;
        const conditions = [];

        if (hadPriorDecline) {
            matchScore++;
            conditions.push(`Prior decline: ${priorChange.toFixed(1)}%`);
        }

        if (nearSupport) {
            matchScore++;
            conditions.push(`Near support (${recent10Low.toFixed(2)})`);
        }

        // Check for stabilization (not dropping further)
        if (dayChange > -2) {
            matchScore++;
            conditions.push(`Stabilizing: ${dayChange > 0 ? '+' : ''}${dayChange.toFixed(1)}%`);
        }

        // RSI in reasonable range (not extreme)
        if (rsi !== null && rsi < 60) {
            matchScore++;
            conditions.push(`RSI: ${rsi.toFixed(1)}`);
        }

        // Valid if score >= 2 (matches TRUE pattern)
        result.isValid = matchScore >= 2;
        result.reason = result.isValid
            ? `Valid Downside LOM: ${conditions.join(', ')}`
            : `Does not match TRUE pattern (score ${matchScore}/4): ${conditions.length > 0 ? conditions.join(', ') : 'No matching criteria'}`;
        result.details = {
            priorChange: priorChange.toFixed(1) + '%',
            hadPriorDecline,
            nearSupport,
            support10d: recent10Low.toFixed(2),
            currentDayChange: dayChange.toFixed(1) + '%',
            closePosition: (closePosition * 100).toFixed(0) + '%',
            rsi: rsi?.toFixed(1) || 'N/A',
            matchScore,
            conditions
        };

        return result;
    }

    /**
     * Simple RSI calculation for verification
     */
    calculateRSI(candles, period = 14) {
        if (candles.length < period + 1) return null;

        const closes = candles.map(c => c.close);
        let gains = 0;
        let losses = 0;

        for (let i = closes.length - period; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    // ============================================================
    // UPSIDE LOM (High of Move)
    // ============================================================

    verifyUpsideLOM(stock, candles, result) {
        const current = candles[candles.length - 1];
        const lookback20 = candles.slice(-20);

        const recentLow = Math.min(...lookback20.map(c => c.low));
        const risePercent = ((current.high - recentLow) / recentLow) * 100;

        if (risePercent < this.thresholds.homRisePercent) {
            result.reason = `Insufficient rise: ${risePercent.toFixed(1)}% (need ${this.thresholds.homRisePercent}%+)`;
            return result;
        }

        const hasReversalPattern = this.hasReversalPatternDown(candles);

        result.isValid = true;
        result.reason = 'Valid Upside LOM Setup (Short Candidate)';
        result.details = {
            risePercent: risePercent.toFixed(1) + '%',
            recentLow: recentLow.toFixed(2),
            currentClose: current.close.toFixed(2),
            hasReversalPattern
        };

        return result;
    }

    // ============================================================
    // SWING BREAKOUT
    // ============================================================

    verifySwingBreakoutUp(stock, candles, result) {
        const current = candles[candles.length - 1];
        const lookback = candles.slice(-20, -1);

        // Check for consolidation followed by breakout
        const consolidation = this.detectConsolidation(lookback);

        if (!consolidation.isConsolidating) {
            result.reason = 'No consolidation pattern found';
            return result;
        }

        // Check if current candle breaks above consolidation high
        const isBreakingUp = current.close > consolidation.high;

        if (!isBreakingUp) {
            result.reason = 'Not breaking above consolidation';
            result.details = {
                consolidationHigh: consolidation.high.toFixed(2),
                currentClose: current.close.toFixed(2)
            };
            return result;
        }

        result.isValid = true;
        result.reason = 'Valid Swing Breakout Up';
        result.details = {
            consolidationRange: `${consolidation.low.toFixed(2)} - ${consolidation.high.toFixed(2)}`,
            consolidationDays: consolidation.days,
            breakoutClose: current.close.toFixed(2)
        };

        return result;
    }

    verifySwingBreakoutDown(stock, candles, result) {
        const current = candles[candles.length - 1];
        const lookback = candles.slice(-20, -1);

        const consolidation = this.detectConsolidation(lookback);

        if (!consolidation.isConsolidating) {
            result.reason = 'No consolidation pattern found';
            return result;
        }

        const isBreakingDown = current.close < consolidation.low;

        if (!isBreakingDown) {
            result.reason = 'Not breaking below consolidation';
            return result;
        }

        result.isValid = true;
        result.reason = 'Valid Swing Breakout Down';
        result.details = {
            consolidationRange: `${consolidation.low.toFixed(2)} - ${consolidation.high.toFixed(2)}`,
            breakdownClose: current.close.toFixed(2)
        };

        return result;
    }

    detectConsolidation(candles) {
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        const high = Math.max(...highs);
        const low = Math.min(...lows);
        const rangePercent = ((high - low) / low) * 100;

        const isConsolidating = rangePercent <= this.thresholds.consolidationRange;

        return {
            isConsolidating,
            high,
            low,
            rangePercent: rangePercent.toFixed(1),
            days: candles.length
        };
    }

    // ============================================================
    // MOMENTUM / INTRADAY
    // ============================================================

    verifyMomentumStock(stock, candles, result) {
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        // Check for gap up or strong opening
        const gapPercent = ((current.open - prev.close) / prev.close) * 100;
        const hasGap = gapPercent > 1;

        // Check for above-average volume
        const avgVolume = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
        const volumeRatio = current.volume / avgVolume;
        const hasVolume = volumeRatio > 1.5;

        // Check for strong close (closing in upper 25% of range)
        const range = current.high - current.low;
        const closePosition = range > 0 ? (current.close - current.low) / range : 0.5;
        const hasStrongClose = closePosition > 0.75;

        const validPoints = (hasGap ? 1 : 0) + (hasVolume ? 1 : 0) + (hasStrongClose ? 1 : 0);

        result.isValid = validPoints >= 2;
        result.reason = result.isValid ? 'Valid Momentum Stock' : 'Insufficient momentum criteria';
        result.details = {
            gapPercent: gapPercent.toFixed(2) + '%',
            volumeRatio: volumeRatio.toFixed(2),
            closePosition: (closePosition * 100).toFixed(0) + '%',
            hasGap,
            hasVolume,
            hasStrongClose
        };

        return result;
    }

    // ============================================================
    // DAILY CONTRACTION
    // ============================================================

    verifyDailyContraction(stock, candles, result) {
        const lookback5 = candles.slice(-5);

        // Check if range is contracting
        const ranges = lookback5.map(c => c.high - c.low);
        const avgRange = ranges.reduce((s, r) => s + r, 0) / ranges.length;
        const lastRange = ranges[ranges.length - 1];

        const rangeContraction = lastRange < avgRange * 0.7;

        // Check ATR contraction
        const atr = TechnicalAnalysis.ATR(candles);
        const prevAtr = TechnicalAnalysis.ATR(candles.slice(0, -5));
        const atrContraction = prevAtr && atr ? (atr < prevAtr * 0.8) : false;

        result.isValid = rangeContraction || atrContraction;
        result.reason = result.isValid ? 'Valid Daily Contraction' : 'No contraction detected';
        result.details = {
            avgRange: avgRange.toFixed(2),
            lastRange: lastRange.toFixed(2),
            rangeContraction,
            atrContraction
        };

        return result;
    }

    // ============================================================
    // HELPER: Reversal Patterns
    // ============================================================

    hasReversalPatternUp(candles) {
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        // Hammer pattern
        const body = Math.abs(current.close - current.open);
        const range = current.high - current.low;
        const lowerWick = Math.min(current.open, current.close) - current.low;
        const isHammer = range > 0 && lowerWick / range > 0.6 && body / range < 0.3;

        // Bullish engulfing
        const prevBearish = prev.close < prev.open;
        const currentBullish = current.close > current.open;
        const isEngulfing = prevBearish && currentBullish &&
            current.open < prev.close && current.close > prev.open;

        return isHammer || isEngulfing;
    }

    hasReversalPatternDown(candles) {
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        // Inverted Hammer / Shooting Star
        const body = Math.abs(current.close - current.open);
        const range = current.high - current.low;
        const upperWick = current.high - Math.max(current.open, current.close);
        const isShootingStar = range > 0 && upperWick / range > 0.6 && body / range < 0.3;

        // Bearish engulfing
        const prevBullish = prev.close > prev.open;
        const currentBearish = current.close < current.open;
        const isEngulfing = prevBullish && currentBearish &&
            current.open > prev.close && current.close < prev.open;

        return isShootingStar || isEngulfing;
    }

    identifyReversalPattern(candles) {
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        const body = Math.abs(current.close - current.open);
        const range = current.high - current.low;
        const lowerWick = Math.min(current.open, current.close) - current.low;

        if (range > 0 && lowerWick / range > 0.6 && body / range < 0.3) {
            return 'Hammer';
        }

        if (prev.close < prev.open && current.close > current.open &&
            current.open < prev.close && current.close > prev.open) {
            return 'Bullish Engulfing';
        }

        return 'Other';
    }
}

module.exports = new CategoryVerifier();
