// Advanced Technical Analysis Library
// Complete implementation of all major technical indicators

class AdvancedTA {

    // ========== MOVING AVERAGES ==========

    static calculateSMA(candles, period) {
        if (candles.length < period) return null;
        const sum = candles.slice(-period).reduce((acc, c) => acc + c.close, 0);
        return sum / period;
    }

    static calculateWMA(candles, period) {
        if (candles.length < period) return null;

        const recentCandles = candles.slice(-period);
        const weights = Array.from({ length: period }, (_, i) => i + 1);
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        const weightedSum = recentCandles.reduce((sum, candle, i) => {
            return sum + (candle.close * weights[i]);
        }, 0);

        return weightedSum / totalWeight;
    }

    static calculateEMA(candles, period) {
        if (candles.length < period) return null;

        const multiplier = 2 / (period + 1);
        let ema = this.calculateSMA(candles.slice(0, period), period);

        for (let i = period; i < candles.length; i++) {
            ema = (candles[i].close - ema) * multiplier + ema;
        }

        return ema;
    }

    // ========== MACD (Complete Implementation) ==========

    static calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (candles.length < slowPeriod + signalPeriod) return null;

        // Calculate MACD line for all candles
        const macdValues = [];
        for (let i = slowPeriod - 1; i < candles.length; i++) {
            const subset = candles.slice(0, i + 1);
            const ema12 = this.calculateEMA(subset, fastPeriod);
            const ema26 = this.calculateEMA(subset, slowPeriod);

            if (ema12 && ema26) {
                macdValues.push(ema12 - ema26);
            }
        }

        if (macdValues.length < signalPeriod) return null;

        // Calculate signal line (EMA of MACD)
        const macdCandles = macdValues.map(v => ({ close: v }));
        const signal = this.calculateEMA(macdCandles, signalPeriod);

        const macd = macdValues[macdValues.length - 1];
        const histogram = signal ? macd - signal : null;

        return { macd, signal, histogram };
    }

    // ========== BOLLINGER BANDS ==========

    static calculateBollingerBands(candles, period = 20, stdDev = 2) {
        if (candles.length < period) return null;

        const recentCandles = candles.slice(-period);
        const sma = this.calculateSMA(recentCandles, period);

        if (!sma) return null;

        // Calculate standard deviation
        const squaredDiffs = recentCandles.map(c => Math.pow(c.close - sma, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const stdDeviation = Math.sqrt(variance);

        const upper = sma + (stdDev * stdDeviation);
        const middle = sma;
        const lower = sma - (stdDev * stdDeviation);

        return { upper, middle, lower, bandwidth: (upper - lower) / middle };
    }

    // ========== STOCHASTIC OSCILLATOR ==========

    static calculateStochastic(candles, kPeriod = 14, dPeriod = 3) {
        if (candles.length < kPeriod) return null;

        const recentCandles = candles.slice(-kPeriod);
        const currentClose = candles[candles.length - 1].close;

        const lowestLow = Math.min(...recentCandles.map(c => c.low));
        const highestHigh = Math.max(...recentCandles.map(c => c.high));

        // %K = (Current Close - Lowest Low) / (Highest High - Lowest Low) * 100
        const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

        // %D = 3-period SMA of %K (simplified - need multiple K values for accurate D)
        // For now, return K only
        const d = null; // Would need to store previous K values

        return { k, d, overbought: k > 80, oversold: k < 20 };
    }

    // ========== FIBONACCI RETRACEMENT LEVELS ==========

    static calculateFibonacci(candles, lookback = 50) {
        if (candles.length < lookback) return null;

        const recentCandles = candles.slice(-lookback);
        const high = Math.max(...recentCandles.map(c => c.high));
        const low = Math.min(...recentCandles.map(c => c.low));
        const range = high - low;

        // Standard Fibonacci retracement levels
        return {
            level_0: high,                      // 0% (swing high)
            level_236: high - (range * 0.236),  // 23.6%
            level_382: high - (range * 0.382),  // 38.2%
            level_500: high - (range * 0.500),  // 50%
            level_618: high - (range * 0.618),  // 61.8% (golden ratio)
            level_786: high - (range * 0.786),  // 78.6%
            level_100: low,                     // 100% (swing low)
            // Extensions
            level_1272: high + (range * 0.272), // 127.2%
            level_1618: high + (range * 0.618), // 161.8%
        };
    }

    // ========== RSI (Relative Strength Index) ==========

    static calculateRSI(candles, period = 14) {
        if (candles.length < period + 1) return null;

        let gains = 0;
        let losses = 0;

        // Calculate initial average gain and loss
        for (let i = 1; i <= period; i++) {
            const change = candles[i].close - candles[i - 1].close;
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Smooth with remaining data
        for (let i = period + 1; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    // ========== ATR (Average True Range) ==========

    static calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return null;

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

        const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
        return atr;
    }

    // ========== ADVANCED VOLUME INDICATORS ==========

    static calculateOBV(candles) {
        // On-Balance Volume
        let obv = 0;
        for (let i = 1; i < candles.length; i++) {
            if (candles[i].close > candles[i - 1].close) {
                obv += candles[i].volume || 0;
            } else if (candles[i].close < candles[i - 1].close) {
                obv -= candles[i].volume || 0;
            }
        }
        return obv;
    }

    static calculateVWAP(candles) {
        // Volume Weighted Average Price
        if (candles.length === 0) return null;

        let cumVolPrice = 0;
        let cumVolume = 0;

        for (const candle of candles) {
            const typical = (candle.high + candle.low + candle.close) / 3;
            const vol = candle.volume || 0;
            cumVolPrice += typical * vol;
            cumVolume += vol;
        }

        return cumVolume > 0 ? cumVolPrice / cumVolume : null;
    }

    // ========== SUPPORT & RESISTANCE ==========

    static findSupportResistance(candles, lookback = 50, tolerance = 0.02) {
        if (candles.length < lookback) return { support: [], resistance: [] };

        const recentCandles = candles.slice(-lookback);
        const levels = [];

        // Find swing highs and lows
        for (let i = 5; i < recentCandles.length - 5; i++) {
            const candle = recentCandles[i];

            // Check if it's a swing high
            let isSwingHigh = true;
            for (let j = i - 5; j <= i + 5; j++) {
                if (j !== i && recentCandles[j].high > candle.high) {
                    isSwingHigh = false;
                    break;
                }
            }
            if (isSwingHigh) levels.push({ price: candle.high, type: 'resistance', touches: 1 });

            // Check if it's a swing low
            let isSwingLow = true;
            for (let j = i - 5; j <= i + 5; j++) {
                if (j !== i && recentCandles[j].low < candle.low) {
                    isSwingLow = false;
                    break;
                }
            }
            if (isSwingLow) levels.push({ price: candle.low, type: 'support', touches: 1 });
        }

        // Consolidate similar levels
        const consolidatedLevels = [];
        for (const level of levels) {
            const similar = consolidatedLevels.find(l =>
                Math.abs(l.price - level.price) < level.price * tolerance &&
                l.type === level.type
            );
            if (similar) {
                similar.touches++;
                similar.price = (similar.price + level.price) / 2; // Average
            } else {
                consolidatedLevels.push(level);
            }
        }

        return {
            support: consolidatedLevels.filter(l => l.type === 'support').sort((a, b) => b.touches - a.touches),
            resistance: consolidatedLevels.filter(l => l.type === 'resistance').sort((a, b) => b.touches - a.touches),
        };
    }

    // ========== TREND STRENGTH ==========

    static calculateADX(candles, period = 14) {
        // Average Directional Index - measures trend strength
        if (candles.length < period + 1) return null;

        const tr = [];
        const plusDM = [];
        const minusDM = [];

        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevHigh = candles[i - 1].high;
            const prevLow = candles[i - 1].low;
            const prevClose = candles[i - 1].close;

            // True Range
            tr.push(Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            ));

            // Directional Movement
            const upMove = high - prevHigh;
            const downMove = prevLow - low;

            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
        }

        // Smooth the values
        const atrValue = tr.slice(-period).reduce((a, b) => a + b, 0) / period;
        const plusDI = (plusDM.slice(-period).reduce((a, b) => a + b, 0) / period / atrValue) * 100;
        const minusDI = (minusDM.slice(-period).reduce((a, b) => a + b, 0) / period / atrValue) * 100;

        const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

        return { adx: dx, plusDI, minusDI, trend: dx > 25 ? 'STRONG' : 'WEAK' };
    }

    // ========== VOLATILITY ==========

    static calculateHistoricalVolatility(candles, period = 20) {
        if (candles.length < period + 1) return null;

        const returns = [];
        for (let i = 1; i <= period; i++) {
            const idx = candles.length - period + i - 1;
            returns.push(Math.log(candles[idx].close / candles[idx - 1].close));
        }

        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

        return volatility * 100; // As percentage
    }
}

module.exports = AdvancedTA;
