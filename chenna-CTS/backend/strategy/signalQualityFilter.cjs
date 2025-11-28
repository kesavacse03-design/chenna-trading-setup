/**
 * Signal Quality Filter (Institutional Grade)
 * Ensures only Top 1% signals are traded (gunshot accuracy)
 * 
 * Scoring: 0-100 scale
 * - 80+ = Top 1% quality (TRADE)
 * - 60-79 = Good but not excellent (SKIP for now)
 * - <60 = Weak signal (REJECT)
 */

const TechnicalAnalysis = require('./comprehensiveTA.cjs');

class SignalQualityFilter {

    /**
     * Score a signal from 0-100 (institutional grade)
     * Top 1% of signals = score >= 80
     */
    static scoreSignal(indicators, candles, context) {
        let totalScore = 0;

        // 1. Volume Confirmation (25%)
        const volumeScore = this.scoreVolume(candles);
        totalScore += volumeScore * 0.25;

        // 2. Trend Alignment (20%)
        const trendScore = this.scoreTrend(indicators);
        totalScore += trendScore * 0.20;

        // 3. Pattern Strength (20%)
        const patternScore = this.scorePattern(candles);
        totalScore += patternScore * 0.20;

        // 4. Trap Avoidance (20%)
        const trapScore = this.scoreTrapAvoidance(context.trapScan);
        totalScore += trapScore * 0.20;

        // 5. Risk/Reward (15%)
        const rrScore = this.scoreRiskReward(indicators, candles);
        totalScore += rrScore * 0.15;

        return totalScore;
    }

    /**
     * Volume Confirmation Score
     * Entry volume must be significantly above average
     */
    static scoreVolume(candles) {
        if (candles.length < 20) return 50; // Not enough data

        const currentCandle = candles[candles.length - 1];
        const avgVol = candles.slice(-20).reduce((sum, c) => sum + (c.volume || 0), 0) / 20;

        if (avgVol === 0) return 50; // No volume data

        const ratio = currentCandle.volume / avgVol;

        // Score: 0-100 based on volume ratio
        // 2.5x+ = 100, 2.0x = 80, 1.5x = 60, <1.2x = 0
        if (ratio >= 2.5) return 100;
        if (ratio >= 2.0) return 80;
        if (ratio >= 1.5) return 60;
        if (ratio >= 1.2) return 40;
        return 0; // Low volume = reject
    }

    /**
     * Trend Alignment Score
     * For longs: price > SMA50 > SMA200 = bullish alignment
     */
    static scoreTrend(indicators) {
        const price = indicators.currentPrice;
        const sma50 = indicators.sma50;
        const sma200 = indicators.sma200;

        if (!sma50 || !sma200) return 50; // Neutral if no data

        // Perfect alignment: price > SMA50 > SMA200
        if (price > sma50 && sma50 > sma200) return 100;

        // Good: price above SMA50 only
        if (price > sma50) return 70;

        // Acceptable: within 2% of SMA50 (support zone)
        if (price >= sma50 * 0.98) return 50;

        // Below SMA50 = reject for longs
        return 0;
    }

    /**
     * Pattern Strength Score
     * Strong bullish patterns get higher scores
     */
    static scorePattern(candles) {
        if (candles.length < 2) return 50;

        const currentCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];

        let score = 50; // Base score

        // Bullish Engulfing (very strong)
        if (currentCandle.close > currentCandle.open &&
            prevCandle.close < prevCandle.open &&
            currentCandle.close > prevCandle.open &&
            currentCandle.open < prevCandle.close) {
            const engulfRatio = Math.abs(currentCandle.close - currentCandle.open) /
                Math.abs(prevCandle.close - prevCandle.open);
            score = engulfRatio > 1.5 ? 95 : 85;
        }

        // Hammer at support (strong)
        const body = Math.abs(currentCandle.close - currentCandle.open);
        const range = currentCandle.high - currentCandle.low;
        const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;

        if (body < range * 0.3 && lowerWick > body * 2) {
            score = 80;
        }

        // Strong green candle with volume
        if (currentCandle.close > currentCandle.open &&
            currentCandle.volume > prevCandle.volume * 1.3) {
            score = Math.max(score, 75);
        }

        // Doji or indecision = lower score
        if (body < range * 0.1) {
            score = 30;
        }

        return score;
    }

    /**
     * Trap Avoidance Score
     * Institutional trap patterns reduce score
     */
    static scoreTrapAvoidance(trapScan) {
        if (!trapScan) return 50; // No trap data = neutral

        // If system recommends AVOID, hard reject
        if (trapScan.recommendation === 'AVOID') return 0;

        // Score based on trap count
        const trapCount = trapScan.trapsDetected || 0;

        if (trapCount === 0) return 100; // Clean signal
        if (trapCount === 1) return 70;  // Minor concern
        if (trapCount === 2) return 40;  // Multiple traps
        if (trapCount >= 3) return 10;   // Dangerous

        return 50;
    }

    /**
     * Risk/Reward Score
     * Based on ATR-adjusted stop vs target
     */
    static scoreRiskReward(indicators, candles) {
        const atr = TechnicalAnalysis.calculateATR(candles, 14);
        if (!atr) return 50; // No ATR data

        const entry = candles[candles.length - 1].close;

        // ATR-adjusted stop: 1.5x ATR
        const atrStop = entry - (atr * 1.5);
        const risk = entry - atrStop;

        // Standard target: 2.5% (can be adjusted)
        const target = entry * 1.025;
        const reward = target - entry;

        if (risk === 0) return 50;

        const rrRatio = reward / risk;

        // Score based on R:R ratio
        if (rrRatio >= 3.0) return 100; // Excellent 3:1
        if (rrRatio >= 2.5) return 90;  // Great 2.5:1
        if (rrRatio >= 2.0) return 80;  // Good 2:1
        if (rrRatio >= 1.5) return 60;  // Acceptable 1.5:1
        return 0; // Poor R:R = reject
    }

    /**
     * Get detailed breakdown of score
     * Useful for debugging and analysis
     */
    static getScoreBreakdown(indicators, candles, context) {
        return {
            volume: this.scoreVolume(candles),
            trend: this.scoreTrend(indicators),
            pattern: this.scorePattern(candles),
            trapAvoidance: this.scoreTrapAvoidance(context.trapScan),
            riskReward: this.scoreRiskReward(indicators, candles),
            total: this.scoreSignal(indicators, candles, context)
        };
    }
}

module.exports = SignalQualityFilter;
