const TechnicalAnalysis = require('./TechnicalAnalysis.cjs');

/**
 * Market Regime Detector
 * Classifies the market environment into distinct regimes:
 * - TRENDING_BULLISH
 * - TRENDING_BEARISH
 * - RANGING (Sideways)
 * - VOLATILE (High risk)
 */
class MarketRegimeDetector {

    /**
     * Detect the current market regime
     * @param {Array} candles - OHLCV data
     * @returns {Object} Regime details
     */
    detectRegime(candles) {
        if (!candles || candles.length < 50) {
            return { regime: 'UNKNOWN', confidence: 0, details: 'Insufficient data' };
        }

        // 1. Calculate Indicators
        const adx = this.calculateADX(candles, 14);
        const currentADX = adx[adx.length - 1];

        const bb = TechnicalAnalysis.calculateBollingerBands(candles, 20, 2);
        const bbWidth = this.calculateBBWidth(bb);

        const atr = TechnicalAnalysis.calculateATR(candles, 14);
        const currentATR = atr[atr.length - 1];
        const avgATR = atr.slice(-20).reduce((a, b) => a + b, 0) / 20;

        const ema20 = TechnicalAnalysis.calculateEMA(candles, 20);
        const ema50 = TechnicalAnalysis.calculateEMA(candles, 50);
        const ema200 = TechnicalAnalysis.calculateEMA(candles, 200);

        const currentPrice = candles[candles.length - 1].close;
        const currentEMA20 = ema20[ema20.length - 1];
        const currentEMA50 = ema50[ema50.length - 1];
        const currentEMA200 = ema200[ema200.length - 1];

        // 2. Determine Regime
        let regime = 'RANGING';
        let confidence = 0.5;
        let reason = [];

        // Check for Volatility first
        const volatilityRatio = currentATR / avgATR;
        if (volatilityRatio > 1.5 || bbWidth > 0.15) { // Thresholds need tuning
            regime = 'VOLATILE';
            reason.push(`High Volatility (ATR Ratio: ${volatilityRatio.toFixed(2)})`);
        }

        // Check for Trend Strength (ADX)
        if (currentADX > 25) {
            // Strong Trend
            if (currentEMA20 > currentEMA50 && currentEMA50 > currentEMA200) {
                regime = 'TRENDING_BULLISH';
                confidence = Math.min(0.9, currentADX / 50);
                reason.push(`Strong Bullish Trend (ADX: ${currentADX.toFixed(1)})`);
            } else if (currentEMA20 < currentEMA50 && currentEMA50 < currentEMA200) {
                regime = 'TRENDING_BEARISH';
                confidence = Math.min(0.9, currentADX / 50);
                reason.push(`Strong Bearish Trend (ADX: ${currentADX.toFixed(1)})`);
            }
        } else {
            // Weak Trend / Ranging
            if (regime !== 'VOLATILE') {
                regime = 'RANGING';
                confidence = 1 - (currentADX / 30);
                reason.push(`Low ADX (${currentADX.toFixed(1)}) indicates ranging market`);

                // Check if consolidating (Squeeze)
                if (bbWidth < 0.05) {
                    reason.push('Bollinger Squeeze detected - Potential breakout soon');
                }
            }
        }

        return {
            regime,
            confidence: parseFloat(confidence.toFixed(2)),
            indicators: {
                adx: currentADX,
                atrRatio: volatilityRatio,
                bbWidth
            },
            reason: reason.join('. ')
        };
    }

    /**
     * Calculate Average Directional Index (ADX)
     * Simplified calculation for regime detection
     */
    calculateADX(candles, period = 14) {
        // Note: Full ADX calculation is complex (TR, +DM, -DM, DX, ADX). 
        // Implementing a simplified approximation or full version.
        // Let's implement a standard version.

        if (candles.length < period * 2) return new Array(candles.length).fill(0);

        const tr = [];
        const plusDM = [];
        const minusDM = [];

        for (let i = 1; i < candles.length; i++) {
            const curr = candles[i];
            const prev = candles[i - 1];

            const highDiff = curr.high - prev.high;
            const lowDiff = prev.low - curr.low;

            tr.push(Math.max(
                curr.high - curr.low,
                Math.abs(curr.high - prev.close),
                Math.abs(curr.low - prev.close)
            ));

            if (highDiff > lowDiff && highDiff > 0) plusDM.push(highDiff);
            else plusDM.push(0);

            if (lowDiff > highDiff && lowDiff > 0) minusDM.push(lowDiff);
            else minusDM.push(0);
        }

        // Smooth TR, +DM, -DM
        const smoothTR = this.wilderSmooth(tr, period);
        const smoothPlusDM = this.wilderSmooth(plusDM, period);
        const smoothMinusDM = this.wilderSmooth(minusDM, period);

        const dx = [];
        for (let i = 0; i < smoothTR.length; i++) {
            const pdi = (smoothPlusDM[i] / smoothTR[i]) * 100;
            const mdi = (smoothMinusDM[i] / smoothTR[i]) * 100;
            const diSum = pdi + mdi;
            const val = diSum === 0 ? 0 : Math.abs(pdi - mdi) / diSum * 100;
            dx.push(val);
        }

        // Smooth DX to get ADX
        return this.wilderSmooth(dx, period);
    }

    wilderSmooth(data, period) {
        const result = [];
        let sum = 0;

        // First value is SMA
        for (let i = 0; i < period; i++) sum += data[i];
        result.push(sum / period);

        // Subsequent values: (Previous * (n-1) + Current) / n
        for (let i = period; i < data.length; i++) {
            const val = (result[result.length - 1] * (period - 1) + data[i]) / period;
            result.push(val);
        }

        // Pad beginning to match input length
        const padding = new Array(data.length - result.length).fill(0);
        return [...padding, ...result];
    }

    calculateBBWidth(bb) {
        if (!bb.upper.length) return 0;
        const upper = bb.upper[bb.upper.length - 1];
        const lower = bb.lower[bb.lower.length - 1];
        const middle = bb.middle[bb.middle.length - 1];

        if (middle === 0) return 0;
        return (upper - lower) / middle;
    }
}

module.exports = new MarketRegimeDetector();
