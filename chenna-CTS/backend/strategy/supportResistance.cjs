/**
 * Support/Resistance Calculator
 * Calculates key price levels from candle data for pattern strategies
 * Used to provide context object to Labs pattern logic
 */

class SupportResistanceCalculator {

    /**
     * Calculate support and resistance levels from candles
     * @param {Array} candles - Array of OHLCV candles
     * @param {number} lookback - Number of candles to analyze
     * @returns {Object} { support, resistance, pivots }
     */
    static calculateLevels(candles, lookback = 20) {
        if (!candles || candles.length < lookback) {
            return { support: null, resistance: null, pivots: [] };
        }

        const recentCandles = candles.slice(-lookback);

        // Find swing lows (support)
        const swingLows = this.findSwingLows(recentCandles, 3);

        // Find swing highs (resistance)
        const swingHighs = this.findSwingHighs(recentCandles, 3);

        // Get the most relevant levels
        const currentPrice = candles[candles.length - 1].close;

        // Nearest support below current price
        const supportLevels = swingLows.filter(level => level < currentPrice);
        const support = supportLevels.length > 0 ? Math.max(...supportLevels) : null;

        // Nearest resistance above current price
        const resistanceLevels = swingHighs.filter(level => level > currentPrice);
        const resistance = resistanceLevels.length > 0 ? Math.min(...resistanceLevels) : null;

        return {
            support,
            resistance,
            pivots: {
                swingLows,
                swingHighs
            },
            distanceToSupport: support ? ((currentPrice - support) / currentPrice * 100) : null,
            distanceToResistance: resistance ? ((resistance - currentPrice) / currentPrice * 100) : null
        };
    }

    /**
     * Find swing low points (local minima)
     */
    static findSwingLows(candles, lookAround = 2) {
        const swingLows = [];

        for (let i = lookAround; i < candles.length - lookAround; i++) {
            const current = candles[i].low;
            let isSwingLow = true;

            // Check if current low is lower than surrounding lows
            for (let j = 1; j <= lookAround; j++) {
                if (candles[i - j].low < current || candles[i + j].low < current) {
                    isSwingLow = false;
                    break;
                }
            }

            if (isSwingLow) {
                swingLows.push(current);
            }
        }

        return swingLows;
    }

    /**
     * Find swing high points (local maxima)
     */
    static findSwingHighs(candles, lookAround = 2) {
        const swingHighs = [];

        for (let i = lookAround; i < candles.length - lookAround; i++) {
            const current = candles[i].high;
            let isSwingHigh = true;

            // Check if current high is higher than surrounding highs
            for (let j = 1; j <= lookAround; j++) {
                if (candles[i - j].high > current || candles[i + j].high > current) {
                    isSwingHigh = false;
                    break;
                }
            }

            if (isSwingHigh) {
                swingHighs.push(current);
            }
        }

        return swingHighs;
    }

    /**
     * Count resistance tests (for MULTI_RESISTANCE_BO)
     */
    static countResistanceTests(candles, tolerance = 0.02) {
        const swingHighs = this.findSwingHighs(candles, 3);
        if (swingHighs.length < 2) return 0;

        // Find cluster of similar highs
        const highestHigh = Math.max(...swingHighs);
        const resistanceZone = swingHighs.filter(
            h => Math.abs(h - highestHigh) / highestHigh < tolerance
        );

        return resistanceZone.length;
    }

    /**
     * Count support tests (for MULTI_SUPPORT_BO)
     */
    static countSupportTests(candles, tolerance = 0.02) {
        const swingLows = this.findSwingLows(candles, 3);
        if (swingLows.length < 2) return 0;

        // Find cluster of similar lows
        const lowestLow = Math.min(...swingLows);
        const supportZone = swingLows.filter(
            l => Math.abs(l - lowestLow) / lowestLow < tolerance
        );

        return supportZone.length;
    }

    /**
     * Check if price is near support
     */
    static isNearSupport(candles, tolerance = 0.02) {
        const { support } = this.calculateLevels(candles);
        if (!support) return false;

        const currentPrice = candles[candles.length - 1].close;
        return Math.abs(currentPrice - support) / currentPrice < tolerance;
    }

    /**
     * Check if price is near resistance
     */
    static isNearResistance(candles, tolerance = 0.02) {
        const { resistance } = this.calculateLevels(candles);
        if (!resistance) return false;

        const currentPrice = candles[candles.length - 1].close;
        return Math.abs(currentPrice - resistance) / currentPrice < tolerance;
    }

    /**
     * Generate full context object for Labs pattern strategies
     */
    static generateContext(candles) {
        const levels = this.calculateLevels(candles, 20);

        return {
            ...levels,
            resistanceTests: this.countResistanceTests(candles),
            supportTests: this.countSupportTests(candles),
            nearSupport: this.isNearSupport(candles),
            nearResistance: this.isNearResistance(candles)
        };
    }
}

module.exports = SupportResistanceCalculator;
