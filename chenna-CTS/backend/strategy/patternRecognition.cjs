/**
 * Pattern Recognition Library
 * 
 * Detects candlestick patterns, price action setups, and volume patterns
 * Used by auto-strategy generation engine
 */

/**
 * Candlestick Pattern Detection
 */
const CandlestickPatterns = {
    /**
     * Bullish Engulfing Pattern
     * Previous: Red candle, Current: Green candle that completely engulfs previous
     */
    isBullishEngulfing(prev, curr) {
        if (!prev || !curr) return false;

        const prevBearish = prev.close < prev.open;
        const currBullish = curr.close > curr.open;

        const fullyEngulfs = curr.open <= prev.close &&
            curr.close >= prev.open;

        return prevBearish && currBullish && fullyEngulfs;
    },

    /**
     * Bearish Engulfing Pattern
     */
    isBearishEngulfing(prev, curr) {
        if (!prev || !curr) return false;

        const prevBullish = prev.close > prev.open;
        const currBearish = curr.close < curr.open;

        const fullyEngulfs = curr.open >= prev.close &&
            curr.close <= prev.open;

        return prevBullish && currBearish && fullyEngulfs;
    },

    /**
     * Hammer Pattern (Bullish reversal)
     * Small body, long lower shadow, minimal upper shadow
     */
    isHammer(candle) {
        if (!candle) return false;

        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
        const upperShadow = candle.high - Math.max(candle.open, candle.close);

        // Body is less than 1/3 of range
        const smallBody = body < (range / 3);

        // Lower shadow is at least 2x the body
        const longLowerShadow = lowerShadow > (body * 2);

        // Upper shadow is minimal
        const minimalUpperShadow = upperShadow < (body * 0.5);

        return smallBody && longLowerShadow && minimalUpperShadow;
    },

    /**
     * Shooting Star Pattern (Bearish reversal)
     * Small body, long upper shadow, minimal lower shadow
     */
    isShootingStar(candle) {
        if (!candle) return false;

        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        const upperShadow = candle.high - Math.max(candle.open, candle.close);
        const lowerShadow = Math.min(candle.open, candle.close) - candle.low;

        const smallBody = body < (range / 3);
        const longUpperShadow = upperShadow > (body * 2);
        const minimalLowerShadow = lowerShadow < (body * 0.5);

        return smallBody && longUpperShadow && minimalLowerShadow;
    },

    /**
     * Doji Pattern (Indecision)
     * Open and close are very close
     */
    isDoji(candle) {
        if (!candle) return false;

        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;

        // Body is less than 5% of range
        return body < (range * 0.05);
    },

    /**
     * Morning Star (Bullish reversal - 3 candle pattern)
     */
    isMorningStar(candles, index) {
        if (index < 2) return false;

        const first = candles[index - 2];
        const second = candles[index - 1];
        const third = candles[index];

        // First: Large bearish
        const firstBearish = first.close < first.open;
        const firstLarge = Math.abs(first.close - first.open) > (first.high - first.low) * 0.6;

        // Second: Small body (doji-like)
        const secondSmall = Math.abs(second.close - second.open) < (second.high - second.low) * 0.3;

        // Third: Large bullish
        const thirdBullish = third.close > third.open;
        const thirdLarge = Math.abs(third.close - third.open) > (third.high - third.low) * 0.6;

        // Third closes above midpoint of first
        const closesAboveMidpoint = third.close > (first.open + first.close) / 2;

        return firstBearish && firstLarge && secondSmall && thirdBullish && thirdLarge && closesAboveMidpoint;
    },

    /**
     * Evening Star (Bearish reversal - 3 candle pattern)
     */
    isEveningStar(candles, index) {
        if (index < 2) return false;

        const first = candles[index - 2];
        const second = candles[index - 1];
        const third = candles[index];

        const firstBullish = first.close > first.open;
        const firstLarge = Math.abs(first.close - first.open) > (first.high - first.low) * 0.6;
        const secondSmall = Math.abs(second.close - second.open) < (second.high - second.low) * 0.3;
        const thirdBearish = third.close < third.open;
        const thirdLarge = Math.abs(third.close - third.open) > (third.high - third.low) * 0.6;
        const closesBelowMidpoint = third.close < (first.open + first.close) / 2;

        return firstBullish && firstLarge && secondSmall && thirdBearish && thirdLarge && closesBelowMidpoint;
    },

    /**
     * Piercing Line (Bullish reversal)
     */
    isPiercingLine(prev, curr) {
        if (!prev || !curr) return false;

        const prevBearish = prev.close < prev.open;
        const currBullish = curr.close > curr.open;

        // Current opens below previous close
        const gapsDown = curr.open < prev.close;

        // Current closes above midpoint of previous
        const closesAboveMidpoint = curr.close > (prev.open + prev.close) / 2;

        // Current doesn't close above previous open
        const doesntExceed = curr.close < prev.open;

        return prevBearish && currBullish && gapsDown && closesAboveMidpoint && doesntExceed;
    },

    /**
     * Dark Cloud Cover (Bearish reversal)
     */
    isDarkCloudCover(prev, curr) {
        if (!prev || !curr) return false;

        const prevBullish = prev.close > prev.open;
        const currBearish = curr.close < curr.open;
        const gapsUp = curr.open > prev.close;
        const closesBelowMidpoint = curr.close < (prev.open + prev.close) / 2;
        const doesntExceed = curr.close > prev.open;

        return prevBullish && currBearish && gapsUp && closesBelowMidpoint && doesntExceed;
    }
};

/**
 * Technical Indicators
 */
const Indicators = {
    /**
     * Calculate RSI (Relative Strength Index)
     */
    calculateRSI(candles, period = 14) {
        if (candles.length < period + 1) return null;

        let gains = 0;
        let losses = 0;

        // First average gain/loss
        for (let i = 1; i <= period; i++) {
            const change = candles[i].close - candles[i - 1].close;
            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Calculate RSI for each subsequent candle
        const rsiValues = [];

        for (let i = period; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));

            rsiValues.push({ index: i, value: rsi });
        }

        return rsiValues;
    },

    /**
     * Calculate EMA (Exponential Moving Average)
     */
    calculateEMA(candles, period) {
        if (candles.length < period) return null;

        const multiplier = 2 / (period + 1);
        const emaValues = [];

        // Start with SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += candles[i].close;
        }
        let ema = sum / period;
        emaValues.push({ index: period - 1, value: ema });

        // Calculate EMA for rest
        for (let i = period; i < candles.length; i++) {
            ema = (candles[i].close - ema) * multiplier + ema;
            emaValues.push({ index: i, value: ema });
        }

        return emaValues;
    },

    /**
     * Calculate SMA (Simple Moving Average)
     */
    calculateSMA(candles, period) {
        if (candles.length < period) return null;

        const smaValues = [];

        for (let i = period - 1; i < candles.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += candles[i - j].close;
            }
            smaValues.push({ index: i, value: sum / period });
        }

        return smaValues;
    },

    /**
     * Calculate MACD
     */
    calculateMACD(candles) {
        const ema12 = this.calculateEMA(candles, 12);
        const ema26 = this.calculateEMA(candles, 26);

        if (!ema12 || !ema26) return null;

        const macdLine = [];
        for (let i = 0; i < Math.min(ema12.length, ema26.length); i++) {
            macdLine.push({
                index: ema26[i].index,
                value: ema12[ema12.length - ema26.length + i].value - ema26[i].value
            });
        }

        // Calculate signal line (9-day EMA of MACD)
        const signalValues = [];
        if (macdLine.length >= 9) {
            const multiplier = 2 / 10;
            let sum = 0;
            for (let i = 0; i < 9; i++) {
                sum += macdLine[i].value;
            }
            let signal = sum / 9;
            signalValues.push({ index: macdLine[8].index, value: signal });

            for (let i = 9; i < macdLine.length; i++) {
                signal = (macdLine[i].value - signal) * multiplier + signal;
                signalValues.push({ index: macdLine[i].index, value: signal });
            }
        }

        return { macdLine, signalLine: signalValues };
    },

    /**
     * Detect volume surge
     */
    isVolumeSurge(candles, index, multiplier = 1.5) {
        if (index < 20) return false;

        // Calculate average volume over last 20 days
        let sum = 0;
        for (let i = index - 20; i < index; i++) {
            sum += candles[i].volume || 0;
        }
        const avgVolume = sum / 20;

        const currentVolume = candles[index].volume || 0;
        return currentVolume > (avgVolume * multiplier);
    },

    /**
     * Check if price is above EMA
     */
    isPriceAboveEMA(price, emaValue) {
        return price > emaValue;
    },

    /**
     * Detect RSI oversold/overbought
     */
    isRSIOversold(rsi, threshold = 30) {
        return rsi < threshold;
    },

    isRSIOverbought(rsi, threshold = 70) {
        return rsi > threshold;
    }
};

/**
 * Pattern Analysis Utilities
 */
const PatternAnalysis = {
    /**
     * Scan all candles and detect patterns
     */
    scanPatterns(candles) {
        const patterns = [];

        for (let i = 2; i < candles.length; i++) {
            const curr = candles[i];
            const prev = candles[i - 1];

            // Check each pattern
            if (CandlestickPatterns.isBullishEngulfing(prev, curr)) {
                patterns.push({ index: i, type: 'bullish_engulfing', bullish: true });
            }

            if (CandlestickPatterns.isBearishEngulfing(prev, curr)) {
                patterns.push({ index: i, type: 'bearish_engulfing', bullish: false });
            }

            if (CandlestickPatterns.isHammer(curr)) {
                patterns.push({ index: i, type: 'hammer', bullish: true });
            }

            if (CandlestickPatterns.isShootingStar(curr)) {
                patterns.push({ index: i, type: 'shooting_star', bullish: false });
            }

            if (CandlestickPatterns.isDoji(curr)) {
                patterns.push({ index: i, type: 'doji', bullish: null });
            }

            if (CandlestickPatterns.isMorningStar(candles, i)) {
                patterns.push({ index: i, type: 'morning_star', bullish: true });
            }

            if (CandlestickPatterns.isEveningStar(candles, i)) {
                patterns.push({ index: i, type: 'evening_star', bullish: false });
            }

            if (CandlestickPatterns.isPiercingLine(prev, curr)) {
                patterns.push({ index: i, type: 'piercing_line', bullish: true });
            }

            if (CandlestickPatterns.isDarkCloudCover(prev, curr)) {
                patterns.push({ index: i, type: 'dark_cloud_cover', bullish: false });
            }
        }

        return patterns;
    },

    /**
     * Get indicator values at specific index
     */
    getIndicatorsAtIndex(candles, index) {
        const rsiValues = Indicators.calculateRSI(candles.slice(0, index + 1));
        const ema20 = Indicators.calculateEMA(candles.slice(0, index + 1), 20);
        const ema50 = Indicators.calculateEMA(candles.slice(0, index + 1), 50);
        const macd = Indicators.calculateMACD(candles.slice(0, index + 1));

        return {
            rsi: rsiValues ? rsiValues[rsiValues.length - 1]?.value : null,
            ema20: ema20 ? ema20[ema20.length - 1]?.value : null,
            ema50: ema50 ? ema50[ema50.length - 1]?.value : null,
            macd: macd ? {
                macd: macd.macdLine[macd.macdLine.length - 1]?.value,
                signal: macd.signalLine[macd.signalLine.length - 1]?.value
            } : null,
            volumeSurge: Indicators.isVolumeSurge(candles, index),
            price: candles[index].close
        };
    },

    /**
     * Check if pattern led to profitable trade
     * Looks ahead 5-10 days for 2-3% gain
     */
    wasPatternProfitable(candles, patternIndex, targetPercent = 2.5, stopLossPercent = 1.5, maxDays = 10) {
        if (patternIndex + maxDays >= candles.length) return null; // Not enough data

        const entryPrice = candles[patternIndex].close;
        const targetPrice = entryPrice * (1 + targetPercent / 100);
        const stopLoss = entryPrice * (1 - stopLossPercent / 100);

        for (let i = patternIndex + 1; i <= patternIndex + maxDays; i++) {
            if (i >= candles.length) break;

            const candle = candles[i];

            // Check if hit target
            if (candle.high >= targetPrice) {
                return {
                    success: true,
                    days: i - patternIndex,
                    exitPrice: targetPrice,
                    pnlPercent: targetPercent
                };
            }

            // Check if hit stop loss
            if (candle.low <= stopLoss) {
                return {
                    success: false,
                    days: i - patternIndex,
                    exitPrice: stopLoss,
                    pnlPercent: -stopLossPercent,
                    reason: 'stop_loss'
                };
            }
        }

        // Sideways - no target hit within max days
        return {
            success: false,
            days: maxDays,
            exitPrice: candles[patternIndex + maxDays]?.close || entryPrice,
            pnlPercent: ((candles[patternIndex + maxDays]?.close || entryPrice) - entryPrice) / entryPrice * 100,
            reason: 'sideways'
        };
    }
};

module.exports = {
    CandlestickPatterns,
    Indicators,
    PatternAnalysis
};
