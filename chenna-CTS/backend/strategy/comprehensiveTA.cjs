/**
 * Comprehensive Technical Analysis Library
 * Implements all indicators like a 20-year veteran trader
 */

class TechnicalAnalysis {

    // ==================== MOVING AVERAGES ====================

    /**
     * Simple Moving Average
     */
    static SMA(data, period) {
        if (data.length < period) return null;
        const sum = data.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    }

    /**
     * Exponential Moving Average
     */
    static EMA(data, period) {
        if (data.length < period) return null;

        const k = 2 / (period + 1);
        let ema = this.SMA(data.slice(0, period), period);

        for (let i = period; i < data.length; i++) {
            ema = (data[i] * k) + (ema * (1 - k));
        }

        return ema;
    }

    /**
     * Weighted Moving Average
     */
    static WMA(data, period) {
        if (data.length < period) return null;

        const slice = data.slice(-period);
        const weights = Array.from({ length: period }, (_, i) => i + 1);
        const weightSum = weights.reduce((a, b) => a + b, 0);

        const wma = slice.reduce((sum, val, i) => sum + (val * weights[i]), 0) / weightSum;
        return wma;
    }

    // ==================== MOMENTUM INDICATORS ====================

    /**
     * Relative Strength Index
     */
    static RSI(candles, period = 14) {
        if (candles.length < period + 1) return null;

        const changes = [];
        for (let i = 1; i < candles.length; i++) {
            changes.push(candles[i].close - candles[i - 1].close);
        }

        const gains = changes.map(c => c > 0 ? c : 0);
        const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);

        const avgGain = this.EMA(gains, period);
        const avgLoss = this.EMA(losses, period);

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));

        return rsi;
    }

    /**
     * MACD (Moving Average Convergence Divergence)
     */
    static MACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (candles.length < slowPeriod) return null;

        const closes = candles.map(c => c.close);

        const fastEMA = this.EMA(closes, fastPeriod);
        const slowEMA = this.EMA(closes, slowPeriod);

        if (!fastEMA || !slowEMA) return null;

        const macdLine = fastEMA - slowEMA;

        // Signal line is EMA of MACD line
        const macdHistory = [];
        for (let i = slowPeriod; i < candles.length; i++) {
            const slicedCloses = candles.slice(0, i + 1).map(c => c.close);
            const f = this.EMA(slicedCloses, fastPeriod);
            const s = this.EMA(slicedCloses, slowPeriod);
            macdHistory.push(f - s);
        }

        const signalLine = this.EMA(macdHistory, signalPeriod);
        const histogram = macdLine - (signalLine || 0);

        return {
            macd: macdLine,
            signal: signalLine,
            histogram: histogram
        };
    }

    /**
     * Stochastic Oscillator
     */
    static Stochastic(candles, kPeriod = 14, dPeriod = 3, smooth = 3) {
        if (candles.length < kPeriod) return null;

        const slice = candles.slice(-kPeriod);

        const currentClose = candles[candles.length - 1].close;
        const lowestLow = Math.min(...slice.map(c => c.low));
        const highestHigh = Math.max(...slice.map(c => c.high));

        const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

        // Calculate %D (SMA of %K)
        const kHistory = [];
        for (let i = kPeriod; i < candles.length; i++) {
            const s = candles.slice(i - kPeriod, i);
            const close = candles[i].close;
            const low = Math.min(...s.map(c => c.low));
            const high = Math.max(...s.map(c => c.high));
            kHistory.push(((close - low) / (high - low)) * 100);
        }

        const d = this.SMA(kHistory, dPeriod);

        return { k, d };
    }

    // ==================== VOLATILITY INDICATORS ====================

    /**
     * Bollinger Bands
     */
    static BollingerBands(candles, period = 20, stdDev = 2) {
        if (candles.length < period) return null;

        const closes = candles.slice(-period).map(c => c.close);
        const sma = this.SMA(closes, period);

        // Calculate standard deviation
        const squaredDiffs = closes.map(c => Math.pow(c - sma, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const std = Math.sqrt(variance);

        return {
            upper: sma + (std * stdDev),
            middle: sma,
            lower: sma - (std * stdDev),
            bandwidth: ((sma + (std * stdDev)) - (sma - (std * stdDev))) / sma
        };
    }

    /**
     * Average True Range
     */
    static ATR(candles, period = 14) {
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

        return this.SMA(trueRanges, period);
    }

    // ==================== TREND INDICATORS ====================

    /**
     * Average Directional Index (ADX)
     */
    static ADX(candles, period = 14) {
        if (candles.length < period + 1) return null;

        const dmPlus = [];
        const dmMinus = [];
        const trueRanges = [];

        for (let i = 1; i < candles.length; i++) {
            const highDiff = candles[i].high - candles[i - 1].high;
            const lowDiff = candles[i - 1].low - candles[i].low;

            dmPlus.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
            dmMinus.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

            const tr = Math.max(
                candles[i].high - candles[i].low,
                Math.abs(candles[i].high - candles[i - 1].close),
                Math.abs(candles[i].low - candles[i - 1].close)
            );
            trueRanges.push(tr);
        }

        const avgDmPlus = this.EMA(dmPlus, period);
        const avgDmMinus = this.EMA(dmMinus, period);
        const avgTR = this.EMA(trueRanges, period);

        const diPlus = (avgDmPlus / avgTR) * 100;
        const diMinus = (avgDmMinus / avgTR) * 100;

        const dx = (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100;

        // ADX is smoothed DX
        const adx = this.EMA([dx], period);

        return {
            adx: adx || 0,
            diPlus,
            diMinus,
            trend: diPlus > diMinus ? 'BULLISH' : 'BEARISH',
            strength: adx > 25 ? 'STRONG' : adx > 20 ? 'MODERATE' : 'WEAK'
        };
    }

    // ==================== VOLUME INDICATORS ====================

    /**
     * On-Balance Volume
     */
    static OBV(candles) {
        if (candles.length < 2) return null;

        let obv = 0;

        for (let i = 1; i < candles.length; i++) {
            if (candles[i].close > candles[i - 1].close) {
                obv += candles[i].volume;
            } else if (candles[i].close < candles[i - 1].close) {
                obv -= candles[i].volume;
            }
        }

        return obv;
    }

    /**
     * Volume Weighted Average Price (VWAP)
     */
    static VWAP(candles) {
        if (candles.length === 0) return null;

        let totalPV = 0;
        let totalVolume = 0;

        for (const candle of candles) {
            const typicalPrice = (candle.high + candle.low + candle.close) / 3;
            totalPV += typicalPrice * candle.volume;
            totalVolume += candle.volume;
        }

        return totalVolume > 0 ? totalPV / totalVolume : null;
    }

    // ==================== HELPER METHODS ====================

    /**
     * Calculate all indicators at once
     */
    static calculateAll(candles) {
        if (!candles || candles.length < 50) {
            return null;
        }

        return {
            // Moving Averages
            sma10: this.SMA(candles.map(c => c.close), 10),
            sma20: this.SMA(candles.map(c => c.close), 20),
            sma50: this.SMA(candles.map(c => c.close), 50),
            sma100: this.SMA(candles.map(c => c.close), 100),
            sma200: this.SMA(candles.map(c => c.close), 200),

            ema10: this.EMA(candles.map(c => c.close), 10),
            ema20: this.EMA(candles.map(c => c.close), 20),
            ema50: this.EMA(candles.map(c => c.close), 50),

            // Momentum
            rsi14: this.RSI(candles, 14),
            rsi21: this.RSI(candles, 21),
            macd: this.MACD(candles),
            stochastic: this.Stochastic(candles),

            // Volatility
            bb: this.BollingerBands(candles),
            atr: this.ATR(candles),

            // Trend
            adx: this.ADX(candles),

            // Volume
            obv: this.OBV(candles),
            vwap: this.VWAP(candles)
        };
    }

    /**
     * Get current price relative to indicators
     */
    static getMarketContext(candles) {
        const indicators = this.calculateAll(candles);
        if (!indicators) return null;

        const currentPrice = candles[candles.length - 1].close;

        return {
            ...indicators,

            // Trend context
            aboveSMA20: currentPrice > indicators.sma20,
            aboveSMA50: currentPrice > indicators.sma50,
            aboveSMA200: currentPrice > indicators.sma200,

            // RSI levels
            rsiOversold: indicators.rsi14 < 30,
            rsiOverbought: indicators.rsi14 > 70,

            // MACD signal
            macdBullish: indicators.macd && indicators.macd.histogram > 0,

            // Bollinger position
            nearUpperBB: indicators.bb && currentPrice > indicators.bb.upper * 0.98,
            nearLowerBB: indicators.bb && currentPrice < indicators.bb.lower * 1.02,

            // ADX trend strength
            strongTrend: indicators.adx && indicators.adx.adx > 25
        };
    }
}

module.exports = TechnicalAnalysis;
