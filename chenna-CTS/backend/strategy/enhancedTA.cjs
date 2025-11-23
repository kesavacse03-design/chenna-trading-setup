// Enhanced Technical Analysis with More Patterns
// Adds additional candlestick patterns for comprehensive testing

const TA = require('./technicalAnalysis.cjs');

class EnhancedTA {

    // All original TA methods available through delegation
    static isHammer(...args) { return TA.isHammer(...args); }
    static isShootingStar(...args) { return TA.isShootingStar(...args); }
    static isEngulfing(...args) { return TA.isEngulfing(...args); }
    static isDoji(...args) { return TA.isDoji(...args); }
    static calculateSMA(...args) { return TA.calculateSMA(...args); }
    static calculateEMA(...args) { return TA.calculateEMA(...args); }
    static calculateRSI(...args) { return TA.calculateRSI(...args); }
    static calculateMACD(...args) { return TA.calculateMACD(...args); }
    static calculateATR(...args) { return TA.calculateATR(...args); }
    static getAverageVolume(...args) { return TA.getAverageVolume(...args); }
    static isVolumeSpike(...args) { return TA.isVolumeSpike(...args); }
    static getSwingHighLow(...args) { return TA.getSwingHighLow(...args); }
    static isFakeBreakout(...args) { return TA.isFakeBreakout(...args); }
    static getTrend(...args) { return TA.getTrend(...args); }
    static isConsolidating(...args) { return TA.isConsolidating(...args); }

    // ========== NEW PATTERNS ==========

    // Morning Star (bullish reversal)
    static isMorningStar(candles, idx) {
        if (idx < 2) return false;

        const c1 = candles[idx - 2]; // Long bearish
        const c2 = candles[idx - 1]; // Small body (star)
        const c3 = candles[idx];     // Long bullish

        const body1 = Math.abs(c1.close - c1.open);
        const body2 = Math.abs(c2.close - c2.open);
        const body3 = Math.abs(c3.close - c3.open);
        const range1 = c1.high - c1.low;
        const range3 = c3.high - c3.low;

        return (
            c1.close < c1.open &&           // First is bearish
            body2 < body1 * 0.3 &&          // Middle is small
            c3.close > c3.open &&           // Last is bullish
            body3 > body1 * 0.8 &&          // Last is large
            c3.close > (c1.open + c1.close) / 2  // Closes above midpoint of first
        );
    }

    // Evening Star (bearish reversal)
    static isEveningStar(candles, idx) {
        if (idx < 2) return false;

        const c1 = candles[idx - 2];
        const c2 = candles[idx - 1];
        const c3 = candles[idx];

        const body1 = Math.abs(c1.close - c1.open);
        const body2 = Math.abs(c2.close - c2.open);
        const body3 = Math.abs(c3.close - c3.open);

        return (
            c1.close > c1.open &&           // First is bullish
            body2 < body1 * 0.3 &&          // Middle is small
            c3.close < c3.open &&           // Last is bearish
            body3 > body1 * 0.8 &&          // Last is large
            c3.close < (c1.open + c1.close) / 2  // Closes below midpoint of first
        );
    }

    // Piercing Pattern (bullish)
    static isPiercingPattern(candle, prevCandle) {
        if (!prevCandle) return false;

        const prevBody = Math.abs(prevCandle.close - prevCandle.open);
        const currBody = Math.abs(candle.close - candle.open);

        return (
            prevCandle.close < prevCandle.open &&  // Previous bearish
            candle.close > candle.open &&          // Current bullish
            candle.open < prevCandle.low &&        // Opens below prev low
            candle.close > (prevCandle.open + prevCandle.close) / 2 && // Closes above midpoint
            candle.close < prevCandle.open         // But below prev open
        );
    }

    // Dark Cloud Cover (bearish)
    static isDarkCloudCover(candle, prevCandle) {
        if (!prevCandle) return false;

        return (
            prevCandle.close > prevCandle.open &&  // Previous bullish
            candle.close < candle.open &&          // Current bearish
            candle.open > prevCandle.high &&       // Opens above prev high
            candle.close < (prevCandle.open + prevCandle.close) / 2 && // Closes below midpoint
            candle.close > prevCandle.open         // But above prev open
        );
    }

    // Harami (bullish or bearish)
    static isHarami(candle, prevCandle, bullish = true) {
        if (!prevCandle) return false;

        const prevBody = Math.abs(prevCandle.close - prevCandle.open);
        const currBody = Math.abs(candle.close - candle.open);

        const insideBody =
            candle.open > Math.min(prevCandle.open, prevCandle.close) &&
            candle.close < Math.max(prevCandle.open, prevCandle.close);

        if (bullish) {
            return (
                prevCandle.close < prevCandle.open &&  // Previous bearish
                candle.close > candle.open &&          // Current bullish
                currBody < prevBody * 0.5 &&           // Small body
                insideBody                              // Inside previous body
            );
        } else {
            return (
                prevCandle.close > prevCandle.open &&  // Previous bullish
                candle.close < candle.open &&          // Current bearish
                currBody < prevBody * 0.5 &&           // Small body
                insideBody                              // Inside previous body
            );
        }
    }

    // Three White Soldiers (strong bullish)
    static isThreeWhiteSoldiers(candles, idx) {
        if (idx < 2) return false;

        const c1 = candles[idx - 2];
        const c2 = candles[idx - 1];
        const c3 = candles[idx];

        return (
            c1.close > c1.open &&
            c2.close > c2.open &&
            c3.close > c3.open &&
            c2.close > c1.close &&
            c3.close > c2.close &&
            c2.open > c1.open && c2.open < c1.close &&
            c3.open > c2.open && c3.open < c2.close
        );
    }

    // Three Black Crows (strong bearish)
    static isThreeBlackCrows(candles, idx) {
        if (idx < 2) return false;

        const c1 = candles[idx - 2];
        const c2 = candles[idx - 1];
        const c3 = candles[idx];

        return (
            c1.close < c1.open &&
            c2.close < c2.open &&
            c3.close < c3.open &&
            c2.close < c1.close &&
            c3.close < c2.close &&
            c2.open < c1.open && c2.open > c1.close &&
            c3.open < c2.open && c3.open > c2.close
        );
    }

    // Tweezer Bottom (bullish)
    static isTweezerBottom(candle, prevCandle) {
        if (!prevCandle) return false;

        const lowMatch = Math.abs(candle.low - prevCandle.low) / prevCandle.low < 0.002;

        return (
            prevCandle.close < prevCandle.open &&  // Previous bearish
            candle.close > candle.open &&          // Current bullish
            lowMatch                                // Similar lows
        );
    }

    // Tweezer Top (bearish)
    static isTweezerTop(candle, prevCandle) {
        if (!prevCandle) return false;

        const highMatch = Math.abs(candle.high - prevCandle.high) / prevCandle.high < 0.002;

        return (
            prevCandle.close > prevCandle.open &&  // Previous bullish
            candle.close < candle.open &&          // Current bearish
            highMatch                               // Similar highs
        );
    }

    // Breakout Detection (for LONGTERM SWING BO UP)
    static isBreakout(candles, idx, lookback = 20) {
        if (idx < lookback) return null;

        const currentCandle = candles[idx];
        const recentCandles = candles.slice(idx - lookback, idx);

        // Find resistance level (highest high in lookback period)
        const resistance = Math.max(...recentCandles.map(c => c.high));

        // Breakout conditions
        const brokeResistance = currentCandle.close > resistance;
        const strongVolume = this.isVolumeSpike(currentCandle, recentCandles, 1.5);
        const bullishCandle = currentCandle.close > currentCandle.open;

        if (brokeResistance && strongVolume && bullishCandle) {
            return {
                type: 'BREAKOUT',
                resistance,
                breakoutPrice: currentCandle.close,
                volumeRatio: currentCandle.volume / this.getAverageVolume(recentCandles, 20)
            };
        }

        return null;
    }

    // Consolidation Breakout (tight range then break)
    static isConsolidationBreakout(candles, idx, consolidationPeriod = 10) {
        if (idx < consolidationPeriod + 5) return null;

        const consolidationCandles = candles.slice(idx - consolidationPeriod, idx);
        const currentCandle = candles[idx];

        // Check if was consolidating
        const high = Math.max(...consolidationCandles.map(c => c.high));
        const low = Math.min(...consolidationCandles.map(c => c.low));
        const range = (high - low) / low;

        const wasConsolidating = range < 0.05; // Within 5% range

        if (!wasConsolidating) return null;

        // Check for breakout
        const brokeHigh = currentCandle.close > high;
        const strongVolume = this.isVolumeSpike(currentCandle, consolidationCandles, 2.0);

        if (brokeHigh && strongVolume) {
            return {
                type: 'CONSOLIDATION_BREAKOUT',
                consolidationHigh: high,
                consolidationLow: low,
                breakoutPrice: currentCandle.close,
                consolidationDays: consolidationPeriod
            };
        }

        return null;
    }

    // Get all bullish patterns for a candle
    static getAllBullishPatterns(candles, idx) {
        const patterns = [];
        const candle = candles[idx];
        const prevCandle = idx > 0 ? candles[idx - 1] : null;

        if (this.isHammer(candle, candles.slice(0, idx))) patterns.push('HAMMER');
        if (this.isEngulfing(candle, prevCandle, true)) patterns.push('BULLISH_ENGULFING');
        if (this.isDoji(candle)) patterns.push('DOJI');
        if (this.isMorningStar(candles, idx)) patterns.push('MORNING_STAR');
        if (this.isPiercingPattern(candle, prevCandle)) patterns.push('PIERCING_PATTERN');
        if (this.isHarami(candle, prevCandle, true)) patterns.push('BULLISH_HARAMI');
        if (this.isThreeWhiteSoldiers(candles, idx)) patterns.push('THREE_WHITE_SOLDIERS');
        if (this.isTweezerBottom(candle, prevCandle)) patterns.push('TWEEZER_BOTTOM');

        const breakout = this.isBreakout(candles, idx);
        if (breakout) patterns.push('BREAKOUT');

        const consolidationBreakout = this.isConsolidationBreakout(candles, idx);
        if (consolidationBreakout) patterns.push('CONSOLIDATION_BREAKOUT');

        return patterns;
    }
}

module.exports = EnhancedTA;
