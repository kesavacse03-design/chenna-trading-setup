/**
 * Pattern Discoverer Service
 * 
 * PURPOSE: Discover ALL patterns present on a stock's addedDate
 * 
 * This service identifies:
 * 1. Candle Patterns (Hammer, Engulfing, Doji, Morning Star, etc.)
 * 2. Volume Patterns (Spike, Dry-up, Accumulation, Distribution)
 * 3. Technical Patterns (RSI Divergence, MACD Cross, BB Squeeze)
 * 4. Structural Patterns (S/R Break, Failed Breakdown, Consolidation)
 * 
 * Each pattern found is tagged for later testing
 */

const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');

class PatternDiscoverer {

    constructor() {
        // Pattern definitions
        this.patternDefinitions = {
            candle: [
                'Hammer',
                'InvertedHammer',
                'BullishEngulfing',
                'BearishEngulfing',
                'Doji',
                'MorningStar',
                'EveningStar',
                'DragonFlyDoji',
                'GravestoneDoji'
            ],
            volume: [
                'VolumeSpike',
                'VolumeDryUp',
                'Accumulation',
                'Distribution'
            ],
            technical: [
                'RSI_Oversold',
                'RSI_Overbought',
                'RSI_Divergence',
                'MACD_BullishCross',
                'MACD_BearishCross',
                'BB_LowerTouch',
                'BB_UpperTouch',
                'BB_Squeeze'
            ],
            structural: [
                'ResistanceBreak',
                'SupportBreak',
                'FailedBreakdown',
                'FailedBreakout',
                'HigherLow',
                'LowerHigh',
                'Consolidation'
            ]
        };
    }

    /**
     * Discover all patterns on the event day
     */
    discoverAll(candles, eventDayIndex = null) {
        const idx = eventDayIndex || candles.length - 1;

        if (candles.length < 50 || idx < 20) {
            return { patterns: [], error: 'Insufficient data' };
        }

        const discovered = [];

        // 1. Candle Patterns
        const candlePatterns = this.discoverCandlePatterns(candles, idx);
        discovered.push(...candlePatterns);

        // 2. Volume Patterns
        const volumePatterns = this.discoverVolumePatterns(candles, idx);
        discovered.push(...volumePatterns);

        // 3. Technical Patterns
        const technicalPatterns = this.discoverTechnicalPatterns(candles, idx);
        discovered.push(...technicalPatterns);

        // 4. Structural Patterns
        const structuralPatterns = this.discoverStructuralPatterns(candles, idx);
        discovered.push(...structuralPatterns);

        return {
            patterns: discovered,
            summary: {
                total: discovered.length,
                byCategory: {
                    candle: candlePatterns.length,
                    volume: volumePatterns.length,
                    technical: technicalPatterns.length,
                    structural: structuralPatterns.length
                }
            },
            eventDay: {
                index: idx,
                date: candles[idx].timestamp,
                close: candles[idx].close
            }
        };
    }

    // ============================================================
    // CANDLE PATTERNS
    // ============================================================

    discoverCandlePatterns(candles, idx) {
        const patterns = [];
        const current = candles[idx];
        const prev = candles[idx - 1];
        const prev2 = candles[idx - 2];

        const body = Math.abs(current.close - current.open);
        const range = current.high - current.low;
        const lowerWick = Math.min(current.open, current.close) - current.low;
        const upperWick = current.high - Math.max(current.open, current.close);
        const isBullish = current.close > current.open;

        // Hammer (long lower wick, small body at top)
        if (range > 0 && lowerWick / range > 0.6 && body / range < 0.3) {
            patterns.push({
                name: 'Hammer',
                category: 'candle',
                signal: 'bullish',
                confidence: lowerWick / range,
                details: { lowerWickRatio: (lowerWick / range).toFixed(2) }
            });
        }

        // Inverted Hammer / Shooting Star
        if (range > 0 && upperWick / range > 0.6 && body / range < 0.3) {
            patterns.push({
                name: isBullish ? 'InvertedHammer' : 'ShootingStar',
                category: 'candle',
                signal: isBullish ? 'bullish' : 'bearish',
                confidence: upperWick / range,
                details: { upperWickRatio: (upperWick / range).toFixed(2) }
            });
        }

        // Bullish Engulfing
        if (prev.close < prev.open && isBullish &&
            current.open < prev.close && current.close > prev.open) {
            patterns.push({
                name: 'BullishEngulfing',
                category: 'candle',
                signal: 'bullish',
                confidence: 0.8,
                details: { prevClose: prev.close, currClose: current.close }
            });
        }

        // Bearish Engulfing
        if (prev.close > prev.open && !isBullish &&
            current.open > prev.close && current.close < prev.open) {
            patterns.push({
                name: 'BearishEngulfing',
                category: 'candle',
                signal: 'bearish',
                confidence: 0.8,
                details: { prevClose: prev.close, currClose: current.close }
            });
        }

        // Doji (very small body relative to range)
        if (range > 0 && body / range < 0.1) {
            patterns.push({
                name: 'Doji',
                category: 'candle',
                signal: 'neutral',
                confidence: 1 - (body / range),
                details: { bodyRatio: (body / range).toFixed(3) }
            });
        }

        // Morning Star (3-candle pattern)
        if (idx >= 2 && prev2.close < prev2.open && // First: bearish
            Math.abs(prev.close - prev.open) / prev.close < 0.01 && // Second: small body
            isBullish && current.close > (prev2.open + prev2.close) / 2) { // Third: bullish > midpoint
            patterns.push({
                name: 'MorningStar',
                category: 'candle',
                signal: 'bullish',
                confidence: 0.9,
                details: { threeCandle: true }
            });
        }

        // Evening Star (3-candle pattern)
        if (idx >= 2 && prev2.close > prev2.open && // First: bullish
            Math.abs(prev.close - prev.open) / prev.close < 0.01 && // Second: small body
            !isBullish && current.close < (prev2.open + prev2.close) / 2) { // Third: bearish < midpoint
            patterns.push({
                name: 'EveningStar',
                category: 'candle',
                signal: 'bearish',
                confidence: 0.9,
                details: { threeCandle: true }
            });
        }

        // Strong Close (closing in upper 25% of range - bullish)
        const closePosition = range > 0 ? (current.close - current.low) / range : 0.5;
        if (closePosition > 0.75) {
            patterns.push({
                name: 'StrongClose',
                category: 'candle',
                signal: 'bullish',
                confidence: closePosition,
                details: { closePosition: (closePosition * 100).toFixed(0) + '%' }
            });
        }

        // Weak Close (closing in lower 25% of range - bearish)
        if (closePosition < 0.25) {
            patterns.push({
                name: 'WeakClose',
                category: 'candle',
                signal: 'bearish',
                confidence: 1 - closePosition,
                details: { closePosition: (closePosition * 100).toFixed(0) + '%' }
            });
        }

        return patterns;
    }

    // ============================================================
    // VOLUME PATTERNS
    // ============================================================

    discoverVolumePatterns(candles, idx) {
        const patterns = [];
        const current = candles[idx];

        // Calculate average volume
        const lookback = candles.slice(idx - 20, idx);
        const avgVolume = lookback.reduce((s, c) => s + c.volume, 0) / lookback.length;
        const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 1;

        // Volume Spike (> 1.5x average)
        if (volumeRatio > 1.5) {
            patterns.push({
                name: 'VolumeSpike',
                category: 'volume',
                signal: current.close > current.open ? 'bullish' : 'bearish',
                confidence: Math.min(1, volumeRatio / 3),
                details: { volumeRatio: volumeRatio.toFixed(2) + 'x' }
            });
        }

        // Volume Dry-Up (< 0.6x average)
        if (volumeRatio < 0.6) {
            patterns.push({
                name: 'VolumeDryUp',
                category: 'volume',
                signal: 'neutral',
                confidence: 1 - volumeRatio,
                details: { volumeRatio: volumeRatio.toFixed(2) + 'x' }
            });
        }

        // Accumulation (volume spike on up day after decline)
        const recent5 = candles.slice(idx - 5, idx);
        const wasDecline = recent5[0].close > current.close * 0.95;
        if (volumeRatio > 1.3 && current.close > current.open && wasDecline) {
            patterns.push({
                name: 'Accumulation',
                category: 'volume',
                signal: 'bullish',
                confidence: 0.7,
                details: { volumeRatio: volumeRatio.toFixed(2) + 'x', afterDecline: true }
            });
        }

        // Distribution (volume spike on down day after rise)
        const wasRise = recent5[0].close < current.close * 1.05;
        if (volumeRatio > 1.3 && current.close < current.open && wasRise) {
            patterns.push({
                name: 'Distribution',
                category: 'volume',
                signal: 'bearish',
                confidence: 0.7,
                details: { volumeRatio: volumeRatio.toFixed(2) + 'x', afterRise: true }
            });
        }

        return patterns;
    }

    // ============================================================
    // TECHNICAL PATTERNS
    // ============================================================

    discoverTechnicalPatterns(candles, idx) {
        const patterns = [];
        const slicedCandles = candles.slice(0, idx + 1);

        // RSI
        const rsi = TechnicalAnalysis.RSI(slicedCandles, 14);
        if (rsi !== null) {
            if (rsi < 30) {
                patterns.push({
                    name: 'RSI_Oversold',
                    category: 'technical',
                    signal: 'bullish',
                    confidence: (30 - rsi) / 30,
                    details: { rsi: rsi.toFixed(1) }
                });
            }
            if (rsi > 70) {
                patterns.push({
                    name: 'RSI_Overbought',
                    category: 'technical',
                    signal: 'bearish',
                    confidence: (rsi - 70) / 30,
                    details: { rsi: rsi.toFixed(1) }
                });
            }

            // RSI Divergence (price makes lower low, RSI makes higher low)
            if (idx >= 10) {
                const prevRsi = TechnicalAnalysis.RSI(candles.slice(0, idx - 5), 14);
                const priceLL = candles[idx].low < Math.min(...candles.slice(idx - 10, idx).map(c => c.low));
                const rsiBullishDiv = prevRsi && rsi > prevRsi && priceLL;

                if (rsiBullishDiv) {
                    patterns.push({
                        name: 'RSI_BullishDivergence',
                        category: 'technical',
                        signal: 'bullish',
                        confidence: 0.8,
                        details: { rsi: rsi.toFixed(1), prevRsi: prevRsi?.toFixed(1) }
                    });
                }
            }
        }

        // MACD
        const macd = TechnicalAnalysis.MACD(slicedCandles);
        if (macd) {
            if (macd.histogram > 0) {
                patterns.push({
                    name: 'MACD_BullishCross',
                    category: 'technical',
                    signal: 'bullish',
                    confidence: Math.min(1, Math.abs(macd.histogram) / 5),
                    details: { histogram: macd.histogram.toFixed(2) }
                });
            }
            if (macd.histogram < 0) {
                patterns.push({
                    name: 'MACD_BearishCross',
                    category: 'technical',
                    signal: 'bearish',
                    confidence: Math.min(1, Math.abs(macd.histogram) / 5),
                    details: { histogram: macd.histogram.toFixed(2) }
                });
            }
        }

        // Bollinger Bands
        const bb = TechnicalAnalysis.BollingerBands(slicedCandles);
        if (bb) {
            const current = candles[idx];
            if (current.close <= bb.lower * 1.01) {
                patterns.push({
                    name: 'BB_LowerTouch',
                    category: 'technical',
                    signal: 'bullish',
                    confidence: 0.7,
                    details: { close: current.close.toFixed(2), lowerBB: bb.lower.toFixed(2) }
                });
            }
            if (current.close >= bb.upper * 0.99) {
                patterns.push({
                    name: 'BB_UpperTouch',
                    category: 'technical',
                    signal: 'bearish',
                    confidence: 0.7,
                    details: { close: current.close.toFixed(2), upperBB: bb.upper.toFixed(2) }
                });
            }
            // BB Squeeze (narrow bandwidth)
            if (bb.bandwidth < 0.1) {
                patterns.push({
                    name: 'BB_Squeeze',
                    category: 'technical',
                    signal: 'neutral',
                    confidence: 1 - bb.bandwidth * 5,
                    details: { bandwidth: bb.bandwidth.toFixed(3) }
                });
            }
        }

        // Stochastic
        const stoch = TechnicalAnalysis.Stochastic(slicedCandles);
        if (stoch) {
            if (stoch.k < 20) {
                patterns.push({
                    name: 'Stoch_Oversold',
                    category: 'technical',
                    signal: 'bullish',
                    confidence: (20 - stoch.k) / 20,
                    details: { k: stoch.k.toFixed(1), d: stoch.d?.toFixed(1) }
                });
            }
            if (stoch.k > 80) {
                patterns.push({
                    name: 'Stoch_Overbought',
                    category: 'technical',
                    signal: 'bearish',
                    confidence: (stoch.k - 80) / 20,
                    details: { k: stoch.k.toFixed(1), d: stoch.d?.toFixed(1) }
                });
            }
        }

        return patterns;
    }

    // ============================================================
    // STRUCTURAL PATTERNS
    // ============================================================

    discoverStructuralPatterns(candles, idx) {
        const patterns = [];
        const current = candles[idx];
        const lookback = candles.slice(idx - 20, idx);

        // Find resistance and support
        const highs = lookback.map(c => c.high);
        const lows = lookback.map(c => c.low);
        const recentHigh = Math.max(...highs);
        const recentLow = Math.min(...lows);

        // Resistance Break
        if (current.close > recentHigh) {
            patterns.push({
                name: 'ResistanceBreak',
                category: 'structural',
                signal: 'bullish',
                confidence: 0.8,
                details: { recentHigh: recentHigh.toFixed(2), close: current.close.toFixed(2) }
            });
        }

        // Support Break
        if (current.close < recentLow) {
            patterns.push({
                name: 'SupportBreak',
                category: 'structural',
                signal: 'bearish',
                confidence: 0.8,
                details: { recentLow: recentLow.toFixed(2), close: current.close.toFixed(2) }
            });
        }

        // Failed Breakdown (price went below support but recovered)
        if (current.low < recentLow && current.close > recentLow) {
            patterns.push({
                name: 'FailedBreakdown',
                category: 'structural',
                signal: 'bullish',
                confidence: 0.85,
                details: { low: current.low.toFixed(2), recentLow: recentLow.toFixed(2) }
            });
        }

        // Failed Breakout (price went above resistance but fell back)
        if (current.high > recentHigh && current.close < recentHigh) {
            patterns.push({
                name: 'FailedBreakout',
                category: 'structural',
                signal: 'bearish',
                confidence: 0.85,
                details: { high: current.high.toFixed(2), recentHigh: recentHigh.toFixed(2) }
            });
        }

        // Higher Low (current low > lowest of last 10 days - bullish structure)
        const recent10Lows = candles.slice(idx - 10, idx).map(c => c.low);
        if (current.low > Math.min(...recent10Lows)) {
            patterns.push({
                name: 'HigherLow',
                category: 'structural',
                signal: 'bullish',
                confidence: 0.6,
                details: { currentLow: current.low.toFixed(2) }
            });
        }

        // Lower High (current high < highest of last 10 days - bearish structure)
        const recent10Highs = candles.slice(idx - 10, idx).map(c => c.high);
        if (current.high < Math.max(...recent10Highs)) {
            patterns.push({
                name: 'LowerHigh',
                category: 'structural',
                signal: 'bearish',
                confidence: 0.6,
                details: { currentHigh: current.high.toFixed(2) }
            });
        }

        // Consolidation (range-bound for 5+ days)
        const consolidationCandles = candles.slice(idx - 5, idx + 1);
        const consHigh = Math.max(...consolidationCandles.map(c => c.high));
        const consLow = Math.min(...consolidationCandles.map(c => c.low));
        const consRange = ((consHigh - consLow) / consLow) * 100;

        if (consRange < 5) {
            patterns.push({
                name: 'Consolidation',
                category: 'structural',
                signal: 'neutral',
                confidence: 1 - (consRange / 10),
                details: { range: consRange.toFixed(1) + '%', days: 5 }
            });
        }

        return patterns;
    }
}

module.exports = new PatternDiscoverer();
