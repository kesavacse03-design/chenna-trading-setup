/**
 * Technical Analysis Service
 * Provides technical indicator calculations and pattern recognition
 */

class TechnicalAnalysis {
    /**
     * Calculate Exponential Moving Average (EMA)
     */
    calculateEMA(data, period) {
        if (!data || data.length < period) return [];

        const k = 2 / (period + 1);
        const emaArray = [];

        // First EMA is SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i].close;
        }
        emaArray.push(sum / period);

        // Calculate subsequent EMAs
        for (let i = period; i < data.length; i++) {
            const ema = data[i].close * k + emaArray[emaArray.length - 1] * (1 - k);
            emaArray.push(ema);
        }

        return emaArray;
    }

    /**
     * Calculate Relative Strength Index (RSI)
     */
    calculateRSI(data, period = 14) {
        if (!data || data.length < period + 1) return [];

        const rsiArray = [];
        let gains = 0;
        let losses = 0;

        // Calculate initial average gain/loss
        for (let i = 1; i <= period; i++) {
            const change = data[i].close - data[i - 1].close;
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Calculate RSI values
        for (let i = period; i < data.length; i++) {
            const rs = avgGain / (avgLoss || 0.0001);
            const rsi = 100 - (100 / (1 + rs));
            rsiArray.push(rsi);

            // Update average gain/loss for next iteration
            const change = data[i].close - data[i - 1].close;
            const currentGain = change > 0 ? change : 0;
            const currentLoss = change < 0 ? Math.abs(change) : 0;

            avgGain = ((avgGain * (period - 1)) + currentGain) / period;
            avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;
        }

        return rsiArray;
    }

    /**
     * Calculate Average True Range (ATR)
     */
    calculateATR(data, period = 14) {
        if (!data || data.length < period + 1) return [];

        const trArray = [];

        // Calculate True Range for each candle
        for (let i = 1; i < data.length; i++) {
            const high = data[i].high;
            const low = data[i].low;
            const prevClose = data[i - 1].close;

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trArray.push(tr);
        }

        // Calculate ATR using smoothed average
        const atrArray = [];
        let atr = trArray.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
        atrArray.push(atr);

        for (let i = period; i < trArray.length; i++) {
            atr = ((atr * (period - 1)) + trArray[i]) / period;
            atrArray.push(atr);
        }

        return atrArray;
    }

    /**
     * Calculate MAC D (Moving Average Convergence Divergence)
     */
    calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        const fastEMA = this.calculateEMA(data, fastPeriod);
        const slowEMA = this.calculateEMA(data, slowPeriod);

        // MACD line
        const macdLine = [];
        const offset = slowPeriod - fastPeriod;
        for (let i = offset; i < fastEMA.length; i++) {
            macdLine.push(fastEMA[i] - slowEMA[i - offset]);
        }

        // Signal line (EMA of MACD)
        const signalLine = this.calculateEMAFromValues(macdLine, signalPeriod);

        // Histogram
        const histogram = [];
        for (let i = signalPeriod - 1; i < macdLine.length; i++) {
            histogram.push(macdLine[i] - signalLine[i - (signalPeriod - 1)]);
        }

        return { macdLine, signalLine, histogram };
    }

    /**
     * Calculate EMA from array of values (helper for MACD)
     */
    calculateEMAFromValues(values, period) {
        if (values.length < period) return [];

        const k = 2 / (period + 1);
        const emaArray = [];

        // First EMA is SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += values[i];
        }
        emaArray.push(sum / period);

        for (let i = period; i < values.length; i++) {
            const ema = values[i] * k + emaArray[emaArray.length - 1] * (1 - k);
            emaArray.push(ema);
        }

        return emaArray;
    }

    /**
     * Calculate Bollinger Bands
     */
    calculateBollingerBands(data, period = 20, stdDev = 2) {
        if (!data || data.length < period) return { upper: [], middle: [], lower: [] };

        const upper = [];
        const middle = [];
        const lower = [];

        for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            const sma = slice.reduce((sum, candle) => sum + candle.close, 0) / period;

            // Calculate standard deviation
            const variance = slice.reduce((sum, candle) => {
                return sum + Math.pow(candle.close - sma, 2);
            }, 0) / period;
            const sd = Math.sqrt(variance);

            middle.push(sma);
            upper.push(sma + (stdDev * sd));
            lower.push(sma - (stdDev * sd));
        }

        return { upper, middle, lower };
    }

    /**
     * Detect candlestick patterns
     */
    detectPatterns(candles) {
        if (!candles || candles.length < 3) return [];

        const patterns = [];
        const recent = candles.slice(-3);
        const [prev2, prev1, current] = recent;

        // Bullish Engulfing
        if (this.isBearish(prev1) && this.isBullish(current) &&
            current.open < prev1.close && current.close > prev1.open) {
            patterns.push({ type: 'bullish_engulfing', confidence: 0.75, direction: 'bullish' });
        }

        // Bearish Engulfing
        if (this.isBullish(prev1) && this.isBearish(current) &&
            current.open > prev1.close && current.close < prev1.open) {
            patterns.push({ type: 'bearish_engulfing', confidence: 0.75, direction: 'bearish' });
        }

        // Hammer (bullish reversal)
        const body = Math.abs(current.close - current.open);
        const lowerShadow = Math.min(current.open, current.close) - current.low;
        const upperShadow = current.high - Math.max(current.open, current.close);

        if (lowerShadow > body * 2 && upperShadow < body * 0.5) {
            patterns.push({ type: 'hammer', confidence: 0.65, direction: 'bullish' });
        }

        // Shooting Star (bearish reversal)
        if (upperShadow > body * 2 && lowerShadow < body * 0.5) {
            patterns.push({ type: 'shooting_star', confidence: 0.65, direction: 'bearish' });
        }

        // Doji (indecision)
        if (body < (current.high - current.low) * 0.1) {
            patterns.push({ type: 'doji', confidence: 0.5, direction: 'neutral' });
        }

        // Morning Star (bullish reversal - 3 candles)
        if (candles.length >= 3) {
            if (this.isBearish(prev2) && Math.abs(prev1.close - prev1.open) < Math.abs(prev2.close - prev2.open) * 0.5 &&
                this.isBullish(current) && current.close > (prev2.open + prev2.close) / 2) {
                patterns.push({ type: 'morning_star', confidence: 0.8, direction: 'bullish' });
            }
        }

        return patterns;
    }

    /**
     * Detect support and resistance levels
     */
    detectSupportResistance(candles, lookback = 50) {
        if (!candles || candles.length < lookback) return { support: [], resistance: [] };

        const recent = candles.slice(-lookback);
        const support = [];
        const resistance = [];

        // Find local highs and lows
        for (let i = 2; i < recent.length - 2; i++) {
            const current = recent[i];

            // Check if it's a local high (resistance)
            if (current.high > recent[i - 1].high && current.high > recent[i - 2].high &&
                current.high > recent[i + 1].high && current.high > recent[i + 2].high) {
                resistance.push({ price: current.high, strength: this.calculateLevelStrength(recent, current.high, 'resistance') });
            }

            // Check if it's a local low (support)
            if (current.low < recent[i - 1].low && current.low < recent[i - 2].low &&
                current.low < recent[i + 1].low && current.low < recent[i + 2].low) {
                support.push({ price: current.low, strength: this.calculateLevelStrength(recent, current.low, 'support') });
            }
        }

        // Cluster nearby levels
        return {
            support: this.clusterLevels(support),
            resistance: this.clusterLevels(resistance)
        };
    }

    /**
     * Calculate strength of support/resistance level
     */
    calculateLevelStrength(candles, price, type) {
        let touches = 0;
        const tolerance = price * 0.002; // 0.2% tolerance

        for (const candle of candles) {
            if (type === 'resistance' && Math.abs(candle.high - price) < tolerance) touches++;
            if (type === 'support' && Math.abs(candle.low - price) < tolerance) touches++;
        }

        return Math.min(touches / 5, 1); // Normalize to 0-1
    }

    /**
     * Cluster nearby support/resistance levels
     */
    clusterLevels(levels) {
        if (levels.length === 0) return [];

        levels.sort((a, b) => a.price - b.price);
        const clustered = [];
        let currentCluster = [levels[0]];

        for (let i = 1; i < levels.length; i++) {
            const prev = levels[i - 1];
            const current = levels[i];

            // If within 0.5% of previous, add to cluster
            if (Math.abs(current.price - prev.price) / prev.price < 0.005) {
                currentCluster.push(current);
            } else {
                // Save cluster and start new one
                clustered.push(this.averageCluster(currentCluster));
                currentCluster = [current];
            }
        }

        // Add last cluster
        if (currentCluster.length > 0) {
            clustered.push(this.averageCluster(currentCluster));
        }

        return clustered.sort((a, b) => b.strength - a.strength).slice(0, 5); // Top 5 levels
    }

    /**
     * Average a cluster of levels
     */
    averageCluster(cluster) {
        const avgPrice = cluster.reduce((sum, level) => sum + level.price, 0) / cluster.length;
        const maxStrength = Math.max(...cluster.map(l => l.strength));
        return { price: avgPrice, strength: maxStrength, touches: cluster.length };
    }

    /**
     * Check if candle is bullish
     */
    isBullish(candle) {
        return candle.close > candle.open;
    }

    /**
     * Check if candle is bearish
     */
    isBearish(candle) {
        return candle.close < candle.open;
    }

    /**
     * Calculate volume analysis
     */
    analyzeVolume(candles, period = 20) {
        if (!candles || candles.length < period) return null;

        const recent = candles.slice(-period);
        const avgVolume = recent.reduce((sum, c) => sum + (c.volume || 0), 0) / period;
        const currentVolume = candles[candles.length - 1].volume || 0;
        const volumeRatio = currentVolume / (avgVolume || 1);

        return {
            current: currentVolume,
            average: avgVolume,
            ratio: volumeRatio,
            isAboveAverage: volumeRatio > 1.5,
            isSignificant: volumeRatio > 2.0
        };
    }

    /**
     * Comprehensive technical analysis
     */
    analyze(candles, config = {}) {
        const {
            emaShort = 9,
            emaLong = 21,
            rsiPeriod = 14,
            atrPeriod = 14,
            bbPeriod = 20
        } = config;

        if (!candles || candles.length < 50) {
            return { error: 'Insufficient data for analysis' };
        }

        const emaShortValues = this.calculateEMA(candles, emaShort);
        const emaLongValues = this.calculateEMA(candles, emaLong);
        const rsi = this.calculateRSI(candles, rsiPeriod);
        const atr = this.calculateATR(candles, atrPeriod);
        const bb = this.calculateBollingerBands(candles, bbPeriod);
        const macd = this.calculateMACD(candles);
        const patterns = this.detectPatterns(candles);
        const srLevels = this.detectSupportResistance(candles);
        const volume = this.analyzeVolume(candles);

        // Current values (most recent)
        const current = candles[candles.length - 1];
        const currentEMAShort = emaShortValues[emaShortValues.length - 1];
        const currentEMALong = emaLongValues[emaLongValues.length - 1];
        const currentRSI = rsi[rsi.length - 1];
        const currentATR = atr[atr.length - 1];

        // Trend detection
        const trend = currentEMAShort > currentEMALong ? 'bullish' : 'bearish';
        const trendStrength = Math.abs(currentEMAShort - currentEMALong) / current.close;

        return {
            current: {
                price: current.close,
                emaShort: currentEMAShort,
                emaLong: currentEMALong,
                rsi: currentRSI,
                atr: currentATR
            },
            trend: {
                direction: trend,
                strength: trendStrength,
                emaAlignment: currentEMAShort > currentEMALong
            },
            indicators: {
                rsi: {
                    value: currentRSI,
                    overbought: currentRSI > 70,
                    oversold: currentRSI < 30
                },
                bollingerBands: {
                    upper: bb.upper[bb.upper.length - 1],
                    middle: bb.middle[bb.middle.length - 1],
                    lower: bb.lower[bb.lower.length - 1],
                    position: this.getBBPosition(current.close, bb)
                },
                macd: {
                    line: macd.macdLine[macd.macdLine.length - 1],
                    signal: macd.signalLine[macd.signalLine.length - 1],
                    histogram: macd.histogram[macd.histogram.length - 1]
                }
            },
            patterns,
            supportResistance: srLevels,
            volume,
            signals: this.generateSignals({
                trend,
                rsi: currentRSI,
                patterns,
                emaShort: currentEMAShort,
                emaLong: currentEMALong
            })
        };
    }

    /**
     * Get Bollinger Band position
     */
    getBBPosition(price, bb) {
        const upper = bb.upper[bb.upper.length - 1];
        const lower = bb.lower[bb.lower.length - 1];
        const middle = bb.middle[bb.middle.length - 1];

        if (price > upper) return 'above_upper';
        if (price < lower) return 'below_lower';
        if (price > middle) return 'upper_half';
        return 'lower_half';
    }

    /**
     * Generate trading signals based on technical analysis
     */
    generateSignals(data) {
        const signals = [];

        // EMA crossover
        if (data.emaShort > data.emaLong && data.trend === 'bullish') {
            signals.push({ type: 'ema_bullish', strength: 0.7, message: 'EMA bullish crossover' });
        } else if (data.emaShort < data.emaLong && data.trend === 'bearish') {
            signals.push({ type: 'ema_bearish', strength: 0.7, message: 'EMA bearish crossover' });
        }

        // RSI signals
        if (data.rsi < 30) {
            signals.push({ type: 'rsi_oversold', strength: 0.6, message: 'RSI oversold - potential reversal' });
        } else if (data.rsi > 70) {
            signals.push({ type: 'rsi_overbought', strength: 0.6, message: 'RSI overbought - potential reversal' });
        }

        // Pattern signals
        for (const pattern of data.patterns || []) {
            signals.push({
                type: `pattern_${pattern.type}`,
                strength: pattern.confidence,
                message: `${pattern.type} pattern detected`,
                direction: pattern.direction
            });
        }

        return signals;
    }
}

module.exports = new TechnicalAnalysis();
