/**
 * Confirmation Calculators for Labs
 * 
 * These calculate CONFIRMATION SCORES (0-100) rather than binary pass/fail.
 * Each confirmation is specific to what the category is designed to capture.
 * 
 * Labs uses these to discover WHAT confirms winners vs losers.
 */

class ConfirmationCalculators {

    // ==================== RSI EXHAUSTION (DOWNSIDE LOM) ====================

    /**
     * RSI Exhaustion Zone Detection
     * NOT a fixed "RSI < 40" rule, but adaptive exhaustion zone
     * Score higher when RSI shows exhaustion pattern (low, then stabilizing)
     */
    static rsiExhaustionScore(rsi14, history = []) {
        if (!rsi14 || rsi14 === 0) return 0;

        let score = 0;

        // Deep oversold zone
        if (rsi14 < 20) score += 40;
        else if (rsi14 < 30) score += 30;
        else if (rsi14 < 40) score += 20;
        else if (rsi14 < 45) score += 10;

        // Check for stabilization (RSI not making new lows)
        if (history.length >= 3) {
            const recent3 = history.slice(-3);
            const isStabilizing = recent3.every((r, i) => i === 0 || r >= recent3[i - 1]);
            if (isStabilizing) score += 25;
        }

        // Check for divergence setup (price lower, RSI higher)
        if (history.length >= 5) {
            const first = history[history.length - 5];
            const last = history[history.length - 1];
            if (first && last && last > first) {
                score += 20; // RSI making higher lows = divergence
            }
        }

        return Math.min(100, score);
    }

    // ==================== ATR SPIKE → CONTRACTION (VOLATILITY EXHAUSTION) ====================

    /**
     * ATR Spike then Contraction
     * Panic selling creates volatility spike, then volatility contracts
     * Score higher when recent ATR decreasing after a spike
     */
    static atrSpikeContractionScore(candles, lookback = 20) {
        if (!candles || candles.length < lookback) return 0;

        const recent = candles.slice(-lookback);
        const atrs = [];

        // Calculate ATR for each period
        for (let i = 1; i < recent.length; i++) {
            const tr = Math.max(
                recent[i].high - recent[i].low,
                Math.abs(recent[i].high - recent[i - 1].close),
                Math.abs(recent[i].low - recent[i - 1].close)
            );
            atrs.push(tr);
        }

        if (atrs.length < 10) return 0;

        const avgATR = atrs.reduce((a, b) => a + b, 0) / atrs.length;
        const recentATR = atrs.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const priorATR = atrs.slice(-15, -5).reduce((a, b) => a + b, 0) / 10;

        let score = 0;

        // Check for prior spike (priorATR significantly above average)
        if (priorATR > avgATR * 1.3) {
            score += 30; // There was a spike

            // Check for current contraction (recentATR below priorATR)
            if (recentATR < priorATR * 0.8) {
                score += 40; // Volatility contracting significantly
            } else if (recentATR < priorATR * 0.9) {
                score += 25; // Moderate contraction
            }
        }

        // Extra: Check if current ATR is normalizing
        if (recentATR < avgATR) {
            score += 20;
        }

        return Math.min(100, score);
    }

    // ==================== LOWER WICK DOMINANCE (BUYING AT LOWS) ====================

    /**
     * Lower Wick Dominance
     * When candles have significant lower wicks, buyers are absorbing
     * Score higher when recent candles show buying at lows
     */
    static lowerWickDominanceScore(candles, lookback = 5) {
        if (!candles || candles.length < lookback) return 0;

        const recent = candles.slice(-lookback);
        let score = 0;

        for (const candle of recent) {
            const totalRange = candle.high - candle.low;
            if (totalRange === 0) continue;

            const body = Math.abs(candle.close - candle.open);
            const lowerWick = Math.min(candle.open, candle.close) - candle.low;
            const upperWick = candle.high - Math.max(candle.open, candle.close);

            const lowerWickRatio = lowerWick / totalRange;
            const upperWickRatio = upperWick / totalRange;

            // Significant lower wick dominance
            if (lowerWickRatio > 0.4 && lowerWickRatio > upperWickRatio) {
                score += 20; // Strong buying wick
            } else if (lowerWickRatio > 0.25 && lowerWickRatio > upperWickRatio) {
                score += 10; // Moderate buying wick
            }
        }

        return Math.min(100, score);
    }

    // ==================== VOLUME DRYING AFTER SELLOFF ====================

    /**
     * Volume Drying After Selloff
     * Panic creates volume spike, then volume should dry up as selling exhausts
     */
    static volumeDryingScore(candles, lookback = 10) {
        if (!candles || candles.length < lookback + 5) return 0;

        const recent = candles.slice(-lookback);
        const prior = candles.slice(-(lookback + 10), -lookback);

        const recentVolume = recent.reduce((a, c) => a + (c.volume || 0), 0) / recent.length;
        const priorVolume = prior.reduce((a, c) => a + (c.volume || 0), 0) / prior.length;

        let score = 0;

        // Volume declining
        if (recentVolume < priorVolume * 0.5) {
            score += 50; // Volume cut in half
        } else if (recentVolume < priorVolume * 0.7) {
            score += 35; // Significant decline
        } else if (recentVolume < priorVolume * 0.85) {
            score += 20; // Moderate decline
        }

        // Check for progressive decline (lower volume each day)
        const recentVols = recent.map(c => c.volume || 0);
        let declining = 0;
        for (let i = 1; i < recentVols.length; i++) {
            if (recentVols[i] <= recentVols[i - 1]) declining++;
        }
        if (declining >= recentVols.length * 0.6) {
            score += 25; // Consistent decline pattern
        }

        return Math.min(100, score);
    }

    // ==================== PRICE HOLDING ABOVE RECENT LOW ====================

    /**
     * Price Holding Above Recent Low
     * After a bottom, price should hold above that low
     */
    static priceHoldingScore(candles, lookback = 10) {
        if (!candles || candles.length < lookback) return 0;

        const recent = candles.slice(-lookback);
        const recentLow = Math.min(...recent.map(c => c.low));
        const lastPrice = candles[candles.length - 1].close;

        let score = 0;

        // Distance from recent low
        const distanceFromLow = (lastPrice - recentLow) / recentLow * 100;

        if (distanceFromLow > 5) score += 30;
        else if (distanceFromLow > 2) score += 20;
        else if (distanceFromLow > 0.5) score += 10;

        // Check if low was made more than 2 sessions ago (stabilizing)
        const lowIndex = recent.findIndex(c => c.low === recentLow);
        if (lowIndex >= 0 && lowIndex < recent.length - 2) {
            score += 30; // Low was made at least 2 sessions ago
        }

        // Check for higher lows pattern
        const lows = recent.slice(-5).map(c => c.low);
        let higherLows = 0;
        for (let i = 1; i < lows.length; i++) {
            if (lows[i] >= lows[i - 1]) higherLows++;
        }
        if (higherLows >= 3) {
            score += 25; // Forming higher lows
        }

        return Math.min(100, score);
    }

    // ==================== BREAKOUT QUALITY (MULTI RESISTANCE BO) ====================

    /**
     * Breakout Candle Quality
     * Strong breakout: close near high of range, volume expansion
     */
    static breakoutCandleScore(candle, avgVolume) {
        if (!candle) return 0;

        let score = 0;
        const range = candle.high - candle.low;
        if (range === 0) return 0;

        // Where did it close in range?
        const closePosition = (candle.close - candle.low) / range;

        if (closePosition > 0.8) score += 35; // Closed near high
        else if (closePosition > 0.65) score += 25;
        else if (closePosition > 0.5) score += 10;

        // Volume expansion
        if (candle.volume > avgVolume * 2) score += 35;
        else if (candle.volume > avgVolume * 1.5) score += 25;
        else if (candle.volume > avgVolume * 1.2) score += 15;

        // Body to range ratio (strong body = strong conviction)
        const body = Math.abs(candle.close - candle.open);
        const bodyRatio = body / range;
        if (bodyRatio > 0.7) score += 20;
        else if (bodyRatio > 0.5) score += 10;

        return Math.min(100, score);
    }

    // ==================== RANGE TIGHTENING (COMPRESSION) ====================

    /**
     * Range Tightening Score
     * For breakout categories, range should tighten before expansion
     */
    static rangeTighteningScore(candles, lookback = 10) {
        if (!candles || candles.length < lookback) return 0;

        const recent = candles.slice(-lookback);
        const ranges = recent.map(c => c.high - c.low);

        const firstHalf = ranges.slice(0, Math.floor(lookback / 2));
        const secondHalf = ranges.slice(Math.floor(lookback / 2));

        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        let score = 0;

        if (avgSecond < avgFirst * 0.6) score += 50; // Significant tightening
        else if (avgSecond < avgFirst * 0.8) score += 35;
        else if (avgSecond < avgFirst * 0.9) score += 20;

        // Check for progressively smaller candles
        let shrinking = 0;
        for (let i = 1; i < ranges.length; i++) {
            if (ranges[i] <= ranges[i - 1]) shrinking++;
        }
        if (shrinking >= ranges.length * 0.6) {
            score += 25;
        }

        return Math.min(100, score);
    }

    // ==================== VWAP ANALYSIS (INTRADAY) ====================

    /**
     * VWAP Acceptance Score
     * For intraday categories, price should be accepting VWAP
     */
    static vwapAcceptanceScore(candles, currentPrice) {
        if (!candles || candles.length < 10) return 0;

        // Calculate simple VWAP approximation
        let cumulativeVP = 0;
        let cumulativeV = 0;

        for (const candle of candles) {
            const typicalPrice = (candle.high + candle.low + candle.close) / 3;
            cumulativeVP += typicalPrice * (candle.volume || 1);
            cumulativeV += (candle.volume || 1);
        }

        const vwap = cumulativeVP / cumulativeV;

        let score = 0;
        const distanceFromVWAP = (currentPrice - vwap) / vwap * 100;

        if (distanceFromVWAP > 0 && distanceFromVWAP < 2) {
            score += 50; // Right above VWAP, ideal
        } else if (distanceFromVWAP > 2) {
            score += 30; // Extended above
        } else if (distanceFromVWAP > -1) {
            score += 20; // Near VWAP
        }

        return Math.min(100, score);
    }

    // ==================== MASTER SCORE CALCULATOR ====================

    /**
     * Calculate all confirmation scores for a category
     * Returns object with individual scores and combined confidence
     */
    static calculateCategoryConfirmations(categoryKey, candles, indicators) {
        const confirmations = {};

        switch (categoryKey) {
            case 'DOWNSIDE_LOM_SWING':
                confirmations.rsiExhaustion = this.rsiExhaustionScore(indicators.rsi14);
                confirmations.atrSpikeContraction = this.atrSpikeContractionScore(candles);
                confirmations.lowerWickDominance = this.lowerWickDominanceScore(candles);
                confirmations.volumeDrying = this.volumeDryingScore(candles);
                confirmations.priceHolding = this.priceHoldingScore(candles);
                break;

            case 'UPSIDE_LOM_SWING':
                confirmations.rsiOverbought = 100 - this.rsiExhaustionScore(100 - (indicators.rsi14 || 50));
                confirmations.volumeDrying = this.volumeDryingScore(candles);
                confirmations.priceHolding = this.priceHoldingScore(candles);
                break;

            case 'MULTI_RESISTANCE_BO':
                confirmations.rangeTightening = this.rangeTighteningScore(candles);
                confirmations.volumeDrying = this.volumeDryingScore(candles); // Pre-breakout contraction
                const lastCandle = candles[candles.length - 1];
                const avgVol = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20;
                confirmations.breakoutQuality = this.breakoutCandleScore(lastCandle, avgVol);
                break;

            case 'HIGH_POWERED_STOCKS':
                confirmations.vwapAcceptance = this.vwapAcceptanceScore(candles, indicators.currentPrice);
                confirmations.lowerWickDominance = this.lowerWickDominanceScore(candles, 3);
                break;

            default:
                // Generic confirmations for other categories
                confirmations.volumeDrying = this.volumeDryingScore(candles);
                confirmations.priceHolding = this.priceHoldingScore(candles);
        }

        // Calculate combined confidence
        const scores = Object.values(confirmations);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        return {
            individual: confirmations,
            combinedConfidence: Math.round(avgScore),
            passedCount: scores.filter(s => s >= 50).length,
            totalConfirmations: scores.length
        };
    }
}

module.exports = ConfirmationCalculators;
