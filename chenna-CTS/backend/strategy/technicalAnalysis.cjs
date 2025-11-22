// Technical Analysis Library
// Candlestick patterns, indicators, and price action analysis

class TechnicalAnalysis {

    // ========== CANDLESTICK PATTERNS ==========

    static isHammer(candle, prevCandles = []) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const upperWick = candle.high - Math.max(candle.open, candle.close);

        // Hammer: small body at top, long lower wick (2x body), minimal upper wick
        const isHammer =
            body < range * 0.3 &&        // Small body
            lowerWick > body * 2 &&      // Long lower shadow
            upperWick < body * 0.3;      // Minimal upper shadow

        return isHammer;
    }

    static isShootingStar(candle, prevCandles = []) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const upperWick = candle.high - Math.max(candle.open, candle.close);

        // Shooting star: small body at bottom, long upper wick, minimal lower wick
        const isShootingStar =
            body < range * 0.3 &&        // Small body
            upperWick > body * 2 &&      // Long upper shadow
            lowerWick < body * 0.3;      // Minimal lower shadow

        return isShootingStar;
    }

    static isEngulfing(candle, prevCandle, bullish = true) {
        if (!prevCandle) return false;

        const currentBody = Math.abs(candle.close - candle.open);
        const prevBody = Math.abs(prevCandle.close - prevCandle.open);

        if (bullish) {
            // Bullish engulfing: green candle engulfs previous red candle
            return (
                candle.close > candle.open &&              // Current is bullish
                prevCandle.close < prevCandle.open &&      // Previous was bearish
                candle.open < prevCandle.close &&          // Opens below prev close
                candle.close > prevCandle.open &&          // Closes above prev open
                currentBody > prevBody * 1.2               // Significantly larger
            );
        } else {
            // Bearish engulfing: red candle engulfs previous green candle
            return (
                candle.close < candle.open &&              // Current is bearish
                prevCandle.close > prevCandle.open &&      // Previous was bullish
                candle.open > prevCandle.close &&          // Opens above prev close
                candle.close < prevCandle.open &&          // Closes below prev open
                currentBody > prevBody * 1.2               // Significantly larger
            );
        }
    }

    static isDoji(candle) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;

        // Doji: very small body (<10% of range)
        return body < range * 0.1;
    }

    // ========== INDICATORS ==========

    static calculateSMA(candles, period) {
        if (candles.length < period) return null;

        const sum = candles.slice(-period).reduce((acc, c) => acc + c.close, 0);
        return sum / period;
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

    static calculateMACD(candles) {
        if (candles.length < 26) return null;

        const ema12 = this.calculateEMA(candles, 12);
        const ema26 = this.calculateEMA(candles, 26);

        if (!ema12 || !ema26) return null;

        const macd = ema12 - ema26;
        // Signal line would require storing previous MACD values
        // Simplified: return MACD value only
        return { macd, signal: null, histogram: null };
    }

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

        // Average of last 'period' true ranges
        const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
        return atr;
    }

    // ========== VOLUME ANALYSIS ==========

    static getAverageVolume(candles, period = 20) {
        if (candles.length < period) return null;

        const sum = candles.slice(-period).reduce((acc, c) => acc + (c.volume || 0), 0);
        return sum / period;
    }

    static isVolumeSpike(candle, candles, multiplier = 2) {
        const avgVol = this.getAverageVolume(candles, 20);
        if (!avgVol) return false;

        return (candle.volume || 0) > avgVol * multiplier;
    }

    // ========== PRICE ACTION ==========

    static getSwingHighLow(candles, lookback = 5) {
        if (candles.length < lookback * 2 + 1) return { high: null, low: null };

        const recentCandles = candles.slice(-lookback * 2 - 1);

        // Swing high: higher than surrounding candles
        const swingHigh = recentCandles.reduce((max, c) => Math.max(max, c.high), 0);

        // Swing low: lower than surrounding candles
        const swingLow = recentCandles.reduce((min, c) =>
            min === null ? c.low : Math.min(min, c.low), null);

        return { high: swingHigh, low: swingLow };
    }

    static isFakeBreakout(candles, resistanceLevel) {
        if (candles.length < 3) return false;

        const [prev2, prev1, current] = candles.slice(-3);

        // Fake breakout: breaks above resistance but quickly reverses
        const broke = current.high > resistanceLevel;
        const reversed = current.close < resistanceLevel;
        const volumeDrop = current.volume < prev1.volume * 0.7;

        return broke && reversed && volumeDrop;
    }

    // ========== TREND DETECTION ==========

    static getTrend(candles, period = 20) {
        if (candles.length < period) return 'SIDEWAYS';

        const recentCandles = candles.slice(-period);
        const sma = this.calculateSMA(recentCandles, period);
        const currentPrice = recentCandles[recentCandles.length - 1].close;

        if (!sma) return 'SIDEWAYS';

        // Uptrend if price > SMA and SMA rising
        const oldSma = this.calculateSMA(candles.slice(-period - 5, -5), period);

        if (currentPrice > sma && sma > oldSma) return 'UPTREND';
        if (currentPrice < sma && sma < oldSma) return 'DOWNTREND';

        return 'SIDEWAYS';
    }

    static isConsolidating(candles, period = 10, threshold = 0.03) {
        if (candles.length < period) return false;

        const recentCandles = candles.slice(-period);
        const high = Math.max(...recentCandles.map(c => c.high));
        const low = Math.min(...recentCandles.map(c => c.low));
        const range = (high - low) / low;

        // Consolidating if range < threshold (e.g., 3%)
        return range < threshold;
    }
}

module.exports = TechnicalAnalysis;
