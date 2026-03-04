/**
 * Behavior Extractor Service
 * 
 * PURPOSE: Extract comprehensive RAW BEHAVIORS from price action
 * 
 * Philosophy:
 * - Extract STRUCTURAL observations, NOT indicator values
 * - These are what a trader SEES on the chart, not calculated numbers
 * - Features are designed to be aggregated across many stocks
 *   to learn what a category represents
 * 
 * Used by:
 * - EventReconstructor (for single event analysis)
 * - CategorySignatureBuilder (for learning patterns)
 * - Signal Generator (for validation)
 */

const SupportResistanceCalculator = require('../strategy/supportResistance.cjs');

class BehaviorExtractor {

    /**
     * Extract all behaviors from candles around an event day
     * 
     * @param {Array} candles - Array of OHLCV candles
     * @param {number} eventDayIdx - Index of the event day candle
     * @returns {Object} Comprehensive behavior object
     */
    extractAll(candles, eventDayIdx) {
        if (!candles || candles.length < 10 || eventDayIdx < 0) {
            return this.getEmptyBehaviors();
        }

        const eventCandle = candles[eventDayIdx];
        const priorCandles = candles.slice(Math.max(0, eventDayIdx - 20), eventDayIdx);
        const afterCandles = candles.slice(eventDayIdx + 1, Math.min(candles.length, eventDayIdx + 10));

        // Combine all behavior categories
        return {
            // Core identifiers
            eventDayIdx,
            candleCount: candles.length,

            // Behavior categories
            ...this.extractPricePosition(eventCandle, priorCandles),
            ...this.extractCandleStructure(eventCandle),
            ...this.extractVolumePatterns(eventCandle, priorCandles),
            ...this.extractRangePatterns(eventCandle, priorCandles),
            ...this.extractStructuralInteraction(priorCandles),
            ...this.extractBreakoutPatterns(eventCandle, priorCandles),
            ...this.extractMomentumPatterns(eventCandle, priorCandles),
            ...this.extractFollowThrough(eventCandle, afterCandles),
            ...this.extractConsolidationPatterns(eventCandle, priorCandles)
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 1: PRICE POSITION
    // Where is price relative to recent structure?
    // =================================================================
    extractPricePosition(eventCandle, priorCandles) {
        if (!priorCandles.length) return {};

        const recentHighs = priorCandles.map(c => c.high);
        const recentLows = priorCandles.map(c => c.low);
        const recentCloses = priorCandles.map(c => c.close);

        const recentHigh = Math.max(...recentHighs);
        const recentLow = Math.min(...recentLows);
        const range = recentHigh - recentLow;

        // Where is current close in the recent range?
        const positionInRange = range > 0
            ? (eventCandle.close - recentLow) / range
            : 0.5;

        return {
            // Distance metrics (as percentages)
            distanceToRecentHigh: ((recentHigh - eventCandle.close) / eventCandle.close) * 100,
            distanceToRecentLow: ((eventCandle.close - recentLow) / eventCandle.close) * 100,

            // Boolean flags
            nearRecentHigh: ((recentHigh - eventCandle.close) / eventCandle.close) < 0.02,
            nearRecentLow: ((eventCandle.close - recentLow) / eventCandle.close) < 0.02,
            atNewHigh: eventCandle.high > recentHigh,
            atNewLow: eventCandle.low < recentLow,

            // Position score (0 = at low, 1 = at high)
            positionInRange: positionInRange,
            inUpperHalf: positionInRange > 0.5,
            inLowerHalf: positionInRange < 0.5,

            // Trend context
            abovePriorClose: eventCandle.close > (recentCloses[recentCloses.length - 1] || eventCandle.close),
            gapUp: eventCandle.low > (priorCandles[priorCandles.length - 1]?.high || 0),
            gapDown: eventCandle.high < (priorCandles[priorCandles.length - 1]?.low || Infinity)
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 2: CANDLE STRUCTURE
    // What does the event day's candle tell us?
    // =================================================================
    extractCandleStructure(eventCandle) {
        const range = eventCandle.high - eventCandle.low;
        const body = Math.abs(eventCandle.close - eventCandle.open);
        const upperWick = eventCandle.high - Math.max(eventCandle.open, eventCandle.close);
        const lowerWick = Math.min(eventCandle.open, eventCandle.close) - eventCandle.low;

        const upperWickPct = range > 0 ? (upperWick / range) * 100 : 0;
        const lowerWickPct = range > 0 ? (lowerWick / range) * 100 : 0;
        const bodyPct = range > 0 ? (body / range) * 100 : 0;

        return {
            // Raw percentages
            upperWickPct,
            lowerWickPct,
            bodyPct,

            // Dominance (what's controlling the candle)
            wickDominance: lowerWickPct > 35 ? 'lower' : (upperWickPct > 35 ? 'upper' : 'neutral'),

            // Pattern classifications
            isBullish: eventCandle.close > eventCandle.open,
            isBearish: eventCandle.close < eventCandle.open,
            isDoji: bodyPct < 10,
            isHammer: lowerWickPct > 40 && upperWickPct < 15 && bodyPct < 40,
            isShootingStar: upperWickPct > 40 && lowerWickPct < 15 && bodyPct < 40,
            isMarubozu: bodyPct > 80, // Strong conviction

            // Rejection signals
            hasLongLowerWick: lowerWickPct > 30,
            hasLongUpperWick: upperWickPct > 30,
            showsBuyingPressure: lowerWickPct > 25 && eventCandle.close > eventCandle.open,
            showsSellingPressure: upperWickPct > 25 && eventCandle.close < eventCandle.open
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 3: VOLUME PATTERNS
    // What does volume tell us about conviction?
    // =================================================================
    extractVolumePatterns(eventCandle, priorCandles) {
        if (!priorCandles.length) return { volumeVsAvg: 1 };

        const volumes = priorCandles.map(c => c.volume).filter(v => v > 0);
        const avgVolume = volumes.length > 0
            ? volumes.reduce((a, b) => a + b, 0) / volumes.length
            : eventCandle.volume;

        const volumeVsAvg = avgVolume > 0 ? eventCandle.volume / avgVolume : 1;

        // Volume trend (is volume increasing or decreasing?)
        const recent5Vol = volumes.slice(-5);
        const prior5Vol = volumes.slice(-10, -5);
        const recent5Avg = recent5Vol.length > 0 ? recent5Vol.reduce((a, b) => a + b, 0) / recent5Vol.length : 0;
        const prior5Avg = prior5Vol.length > 0 ? prior5Vol.reduce((a, b) => a + b, 0) / prior5Vol.length : recent5Avg;
        const volumeTrend = prior5Avg > 0 ? recent5Avg / prior5Avg : 1;

        return {
            // Core metrics
            volumeVsAvg,
            volumeTrend,

            // Classifications
            volumeSpike: volumeVsAvg > 2.0,
            volumeExpansion: volumeVsAvg > 1.5,
            highVolume: volumeVsAvg > 1.2,
            normalVolume: volumeVsAvg >= 0.8 && volumeVsAvg <= 1.2,
            lowVolume: volumeVsAvg < 0.8,
            volumeExhaustion: volumeVsAvg < 0.6,

            // Trend-based
            volumeIncreasing: volumeTrend > 1.2,
            volumeDecreasing: volumeTrend < 0.8,
            volumeDryUp: volumeTrend < 0.5
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 4: RANGE PATTERNS
    // How does today's movement compare to normal?
    // =================================================================
    extractRangePatterns(eventCandle, priorCandles) {
        if (!priorCandles.length) return { rangeVsAvg: 1 };

        const eventRange = eventCandle.high - eventCandle.low;
        const priorRanges = priorCandles.map(c => c.high - c.low);
        const avgRange = priorRanges.reduce((a, b) => a + b, 0) / priorRanges.length;

        const rangeVsAvg = avgRange > 0 ? eventRange / avgRange : 1;

        // Range contraction pattern
        const last5Ranges = priorRanges.slice(-5);
        const prior5Ranges = priorRanges.slice(-10, -5);
        const last5AvgRange = last5Ranges.length > 0 ? last5Ranges.reduce((a, b) => a + b, 0) / last5Ranges.length : avgRange;
        const prior5AvgRange = prior5Ranges.length > 0 ? prior5Ranges.reduce((a, b) => a + b, 0) / prior5Ranges.length : last5AvgRange;
        const rangeContracting = last5AvgRange < prior5AvgRange * 0.7;

        return {
            rangeVsAvg,

            // Day type
            bigDay: rangeVsAvg > 1.5,
            wideRange: rangeVsAvg > 1.2,
            normalRange: rangeVsAvg >= 0.8 && rangeVsAvg <= 1.2,
            narrowRange: rangeVsAvg < 0.8,
            contractedDay: rangeVsAvg < 0.5,

            // Pattern detection
            rangeContracting,
            potentialSqueeze: rangeContracting && rangeVsAvg < 0.6,
            volatilityExplosion: rangeVsAvg > 2.0
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 5: STRUCTURAL INTERACTION
    // Is price interacting with support/resistance?
    // =================================================================
    extractStructuralInteraction(priorCandles) {
        if (!priorCandles.length) return {};

        const srContext = SupportResistanceCalculator.generateContext(priorCandles);

        return {
            nearSupport: srContext.nearSupport || false,
            nearResistance: srContext.nearResistance || false,
            resistanceTests: srContext.resistanceTests || 0,
            supportTests: srContext.supportTests || 0,
            distanceToSupport: srContext.distanceToSupport || null,
            distanceToResistance: srContext.distanceToResistance || null,

            // Multi-touch patterns
            multipleResistanceTests: (srContext.resistanceTests || 0) >= 2,
            multipleSupportTests: (srContext.supportTests || 0) >= 2,
            atKeyLevel: srContext.nearSupport || srContext.nearResistance
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 6: BREAKOUT PATTERNS
    // Is price attempting to break prior ranges?
    // =================================================================
    extractBreakoutPatterns(eventCandle, priorCandles) {
        if (!priorCandles.length) return {};

        // Different lookback periods
        const prior5 = priorCandles.slice(-5);
        const prior10 = priorCandles.slice(-10);
        const prior20 = priorCandles;

        const getHighLow = (candles) => ({
            high: candles.length > 0 ? Math.max(...candles.map(c => c.high)) : eventCandle.high,
            low: candles.length > 0 ? Math.min(...candles.map(c => c.low)) : eventCandle.low
        });

        const p5 = getHighLow(prior5);
        const p10 = getHighLow(prior10);
        const p20 = getHighLow(prior20);

        return {
            // Short-term (5-day)
            brokeAbove5Day: eventCandle.high > p5.high,
            brokeBelow5Day: eventCandle.low < p5.low,

            // Medium-term (10-day)
            brokeAbove10Day: eventCandle.high > p10.high,
            brokeBelow10Day: eventCandle.low < p10.low,

            // Long-term (20-day)
            brokeAbove20Day: eventCandle.high > p20.high,
            brokeBelow20Day: eventCandle.low < p20.low,

            // Aggregate classifications
            shortTermBreakoutUp: eventCandle.high > p5.high && eventCandle.close > (eventCandle.open + eventCandle.close) / 2,
            shortTermBreakoutDown: eventCandle.low < p5.low && eventCandle.close < (eventCandle.open + eventCandle.close) / 2,
            anyBreakoutAttempt: eventCandle.high > p5.high || eventCandle.low < p5.low
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 7: MOMENTUM PATTERNS
    // What is the short-term momentum?
    // =================================================================
    extractMomentumPatterns(eventCandle, priorCandles) {
        if (priorCandles.length < 3) return {};

        const closes = priorCandles.map(c => c.close);
        const recentCloses = closes.slice(-5);

        // Simple momentum: how many up days vs down days
        let upDays = 0;
        let downDays = 0;
        for (let i = 1; i < recentCloses.length; i++) {
            if (recentCloses[i] > recentCloses[i - 1]) upDays++;
            else downDays++;
        }

        // Consecutive days
        let consecutiveUp = 0;
        let consecutiveDown = 0;
        for (let i = closes.length - 1; i > 0; i--) {
            if (closes[i] > closes[i - 1]) {
                if (consecutiveDown === 0) consecutiveUp++;
                else break;
            } else {
                if (consecutiveUp === 0) consecutiveDown++;
                else break;
            }
        }

        return {
            recentUpDays: upDays,
            recentDownDays: downDays,
            consecutiveUpDays: consecutiveUp,
            consecutiveDownDays: consecutiveDown,

            // Momentum state
            momentumUp: upDays > downDays && consecutiveUp >= 2,
            momentumDown: downDays > upDays && consecutiveDown >= 2,
            extendedUp: consecutiveUp >= 4,
            extendedDown: consecutiveDown >= 4,
            choppy: upDays === downDays
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 8: FOLLOW-THROUGH
    // What happened after the event day?
    // =================================================================
    extractFollowThrough(eventCandle, afterCandles) {
        if (!afterCandles.length) {
            return {
                hasFollowThrough: null,
                followThroughStrength: null
            };
        }

        const isBullish = eventCandle.close > eventCandle.open;
        const nextDay = afterCandles[0];

        // Did next day continue in same direction?
        const bullishFollowThrough = isBullish && nextDay.close > eventCandle.close;
        const bearishFollowThrough = !isBullish && nextDay.close < eventCandle.close;
        const hasFollowThrough = bullishFollowThrough || bearishFollowThrough;

        // 3-day follow through
        let daysContinued = 0;
        for (const candle of afterCandles.slice(0, 3)) {
            if (isBullish && candle.close > eventCandle.close) daysContinued++;
            else if (!isBullish && candle.close < eventCandle.close) daysContinued++;
            else break;
        }

        return {
            hasFollowThrough,
            nextDayFollowThrough: hasFollowThrough,
            nextDayRejection: !hasFollowThrough,
            followThroughDays: daysContinued,
            strongFollowThrough: daysContinued >= 2,

            // Specific patterns
            immediateReversal: !hasFollowThrough && afterCandles.length > 0,
            gapAndGo: hasFollowThrough && (nextDay.low > eventCandle.close || nextDay.high < eventCandle.close)
        };
    }

    // =================================================================
    // BEHAVIOR CATEGORY 9: CONSOLIDATION PATTERNS
    // Is price in a consolidation phase?
    // =================================================================
    extractConsolidationPatterns(eventCandle, priorCandles) {
        if (priorCandles.length < 5) return {};

        // Check for range-bound price action
        const last10 = priorCandles.slice(-10);
        const last10High = Math.max(...last10.map(c => c.high));
        const last10Low = Math.min(...last10.map(c => c.low));
        const last10Range = last10High - last10Low;
        const avgPrice = (last10High + last10Low) / 2;
        const consolidationPct = avgPrice > 0 ? (last10Range / avgPrice) * 100 : 0;

        // Count how many days closed within the range
        let daysInRange = 0;
        for (const c of last10) {
            const range25 = last10Low + (last10Range * 0.25);
            const range75 = last10Low + (last10Range * 0.75);
            if (c.close >= range25 && c.close <= range75) daysInRange++;
        }

        return {
            consolidationRange: consolidationPct,
            isTightConsolidation: consolidationPct < 5,
            isLooseConsolidation: consolidationPct >= 5 && consolidationPct < 10,
            isRangebound: daysInRange >= 6,
            daysInConsolidation: daysInRange,

            // Breakout readiness
            readyForBreakout: consolidationPct < 5 && daysInRange >= 4
        };
    }

    // =================================================================
    // HELPERS
    // =================================================================
    getEmptyBehaviors() {
        return {
            eventDayIdx: -1,
            candleCount: 0,
            valid: false,
            reason: 'insufficient_data'
        };
    }

    /**
     * Get a feature vector suitable for similarity calculations
     * Normalizes numeric values to 0-1 range
     */
    toFeatureVector(behaviors) {
        return [
            behaviors.positionInRange || 0.5,
            behaviors.volumeVsAvg ? Math.min(behaviors.volumeVsAvg / 3, 1) : 0.5,
            behaviors.rangeVsAvg ? Math.min(behaviors.rangeVsAvg / 3, 1) : 0.5,
            behaviors.nearResistance ? 1 : 0,
            behaviors.nearSupport ? 1 : 0,
            behaviors.multipleResistanceTests ? 1 : 0,
            behaviors.multipleSupportTests ? 1 : 0,
            behaviors.anyBreakoutAttempt ? 1 : 0,
            behaviors.hasLongLowerWick ? 1 : 0,
            behaviors.hasLongUpperWick ? 1 : 0,
            behaviors.volumeExpansion ? 1 : 0,
            behaviors.volumeExhaustion ? 1 : 0,
            behaviors.bigDay ? 1 : 0,
            behaviors.contractedDay ? 1 : 0,
            behaviors.momentumUp ? 1 : 0,
            behaviors.momentumDown ? 1 : 0
        ];
    }
}

module.exports = new BehaviorExtractor();
