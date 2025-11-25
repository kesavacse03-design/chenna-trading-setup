/**
 * Institutional Trap Detectors
 * Detects all 10 types of market manipulation
 * Thinks like institutional operators to avoid retail traps
 */

class InstitutionalTrapDetector {

    constructor() {
        this.trapHistory = [];
    }

    // ==================== 1. LIQUIDITY GRAB / STOP-LOSS HUNTING ====================

    detectStopHunt(candles, support, resistance) {
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];

        const avgVolume = this.avgVolume(candles.slice(-20));

        // Bullish stop hunt: Wick below support, close above, high volume
        const bullishWick = lastCandle.low < support * 0.998;
        const bullishClose = lastCandle.close > support * 1.002;
        const highVolume = lastCandle.volume > avgVolume * 1.5;

        if (bullishWick && bullishClose && highVolume) {
            return {
                type: "STOP_HUNT_BULLISH",
                level: support,
                interpretation: "Grabbed sell-side liquidity at support, likely reversing up",
                action: "CONFIRM - Stop hunt complete, can enter long",
                confidence: 0.85
            };
        }

        // Bearish stop hunt: Wick above resistance, close below, high volume
        const bearishWick = lastCandle.high > resistance * 1.002;
        const bearishClose = lastCandle.close < resistance * 0.998;

        if (bearishWick && bearishClose && highVolume) {
            return {
                type: "STOP_HUNT_BEARISH",
                level: resistance,
                interpretation: "Grabbed buy-side liquidity at resistance, likely reversing down",
                action: "CONFIRM - Stop hunt complete, can enter short",
                confidence: 0.85
            };
        }

        return null;
    }

    // ==================== 2. FAKE BREAKOUTS ====================

    detectFakeBreakout(candles, level, direction = 'UP') {
        const breakoutCandle = candles[candles.length - 1];
        const avgVolume = this.avgVolume(candles.slice(-20));

        if (direction === 'UP') {
            const brokeResistance = breakoutCandle.close > level;
            const weakBody = (breakoutCandle.close - breakoutCandle.open) < (breakoutCandle.high - breakoutCandle.low) * 0.3;
            const largeUpperWick = (breakoutCandle.high - Math.max(breakoutCandle.open, breakoutCandle.close)) > (breakoutCandle.close - breakoutCandle.open) * 2;
            const lowVolume = breakoutCandle.volume < avgVolume * 0.8;

            if (brokeResistance && (weakBody || largeUpperWick || lowVolume)) {
                // Check next candle for quick reversal
                if (candles.length > 1) {
                    const nextCandle = candles[candles.length];
                    if (nextCandle && nextCandle.close < level) {
                        return {
                            type: "FAKE_BREAKOUT_BEARISH",
                            level,
                            interpretation: "Breakout failed - weak volume/body, upper wick rejection",
                            action: "AVOID - This is a trap, price will reverse down",
                            confidence: 0.90
                        };
                    }
                }

                return {
                    type: "POTENTIAL_FAKE_BREAKOUT",
                    level,
                    interpretation: "Breakout looks weak - monitor for reversal",
                    action: "WAIT - Don't enter yet",
                    confidence: 0.70
                };
            }
        }

        return null;
    }

    // ==================== 3. ORDER BOOK SPOOFING (Volume Absorption) ====================

    detectVolumeAbsorption(candles) {
        const candle = candles[candles.length - 1];
        const avgVolume = this.avgVolume(candles.slice(-50));

        // High volume but small candle body = absorption
        const bodySize = Math.abs(candle.close - candle.open);
        const bodyPercent = bodySize / candle.open;
        const volumeRatio = candle.volume / avgVolume;

        if (volumeRatio > 3.0 && bodyPercent < 0.004) {
            return {
                type: "VOLUME_ABSORPTION",
                interpretation: "Smart money absorbing retail orders - accumulation or distribution",
                action: "AVOID - Someone is hiding large position, wait for direction",
                details: {
                    volumeRatio: volumeRatio.toFixed(2),
                    bodyPercent: (bodyPercent * 100).toFixed(2) + '%'
                },
                confidence: 0.80
            };
        }

        // Sudden volume spike then drop = fake move
        if (candles.length >= 2) {
            const prevCandle = candles[candles.length - 2];
            if (candle.volume > prevCandle.volume * 5) {
                return {
                    type: "SPOOFING_SIGNATURE",
                    interpretation: "Artificial volume spike - likely manipulation",
                    action: "AVOID - Wait for genuine volume confirmation",
                    confidence: 0.75
                };
            }
        }

        return null;
    }

    // ==================== 4. PRE-MOVE ABSORPTION ZONES ====================

    detectAbsorptionZone(candles) {
        const last20 = candles.slice(-20);

        const avgVolume = this.avgVolume(last20);
        const normalVolume = this.avgVolume(candles.slice(-100));
        const priceRange = this.percentRange(last20);
        const avgBodySize = this.avgBodySize(last20);

        // Characteristics: High volume + small bodies + tight range
        const highVolume = avgVolume > normalVolume * 1.5;
        const tightRange = priceRange < 0.03;
        const smallBodies = avgBodySize < this.avgBodySize(candles.slice(-100)) * 0.6;

        if (highVolume && tightRange && smallBodies) {
            // Measure buy vs sell pressure
            const buyPressure = this.measureBuyPressure(last20);

            return {
                type: "ABSORPTION_ZONE",
                phase: buyPressure > 0.6 ? "ACCUMULATION" : "DISTRIBUTION",
                interpretation: buyPressure > 0.6
                    ? "Smart money quietly accumulating - expect upward breakout"
                    : "Smart money quietly distributing - expect downward breakdown",
                action: "WAIT for breakout confirmation",
                expectedMove: buyPressure > 0.6 ? "UP" : "DOWN",
                confidence: 0.75
            };
        }

        return null;
    }

    // ==================== 5. FALSE MOMENTUM CREATION ====================

    detectFalseMomentum(candles) {
        const last10 = candles.slice(-10);

        // Count consecutive green/red candles
        let consecutiveGreen = 0;
        for (let i = last10.length - 1; i >= 0; i--) {
            if (last10[i].close > last10[i].open) consecutiveGreen++;
            else break;
        }

        // Check if momentum is real or fake
        if (consecutiveGreen >= 5) {
            const avgVolume = this.avgVolume(candles.slice(-50));
            const recentVolume = this.avgVolume(last10);
            const volumeDecreasing = recentVolume < avgVolume * 0.7;

            // Fake momentum: Price rising but volume declining
            if (volumeDecreasing) {
                return {
                    type: "FALSE_MOMENTUM",
                    interpretation: "Artificial momentum - volume declining despite price rise",
                    action: "AVOID - Institutions creating FOMO, will dump soon",
                    confidence: 0.85
                };
            }
        }

        return null;
    }

    // ==================== 6. NEWS MANIPULATION / PRE-NEWS POSITIONING ====================

    detectPreNewsManipulation(candles, timestamp) {
        const hour = new Date(timestamp).getHours();
        const minute = new Date(timestamp).getMinutes();

        // Manipulation windows
        const isOpeningWindow = (hour === 9 && minute < 45);
        const isClosingWindow = (hour === 15 && minute > 15);

        if (isOpeningWindow || isClosingWindow) {
            const last5 = candles.slice(-5);
            const priceChange = Math.abs((last5[last5.length - 1].close - last5[0].close) / last5[0].close);
            const avgVolume = this.avgVolume(candles.slice(-50));
            const recentVolume = this.avgVolume(last5);

            // Unusual move on low volume = pre-news positioning
            if (priceChange > 0.015 && recentVolume < avgVolume * 0.7) {
                return {
                    type: "PRE_NEWS_POSITIONING",
                    interpretation: "Smart money front-running news - unusual move on low volume",
                    action: "AVOID entering - wait for news confirmation",
                    window: isOpeningWindow ? "OPENING" : "CLOSING",
                    confidence: 0.70
                };
            }
        }

        return null;
    }

    // ==================== 7. PATTERN MANIPULATION ====================

    detectPatternTrap(candles, pattern, patternStartIndex) {
        // Check if pattern was followed by instant reversal
        const candlesAfterPattern = candles.slice(patternStartIndex);

        if (candlesAfterPattern.length >= 3) {
            const entry = candlesAfterPattern[0].close;
            const day1 = candlesAfterPattern[1];
            const day2 = candlesAfterPattern[2];

            // Bullish pattern but instant reversal
            if (pattern.direction === 'BULLISH') {
                const instantDrop = day1.close < entry * 0.985 || day2.close < entry * 0.98;
                const highVolume = day1.volume > this.avgVolume(candles.slice(-20)) * 1.5;

                if (instantDrop && highVolume) {
                    return {
                        type: "PATTERN_TRAP",
                        pattern: pattern.name,
                        interpretation: "Bullish pattern failed immediately - institutions trapped retailers",
                        action: "AVOID - Pattern was manipulated",
                        confidence: 0.90
                    };
                }
            }
        }

        return null;
    }

    // ==================== 8. VOLUME DECEPTION ====================

    detectVolumeDeception(candles) {
        const last5 = candles.slice(-5);

        // Check for volume-price divergence
        let volumeIncreasing = true;
        let priceIncreasing = true;

        for (let i = 1; i < last5.length; i++) {
            if (last5[i].volume < last5[i - 1].volume) volumeIncreasing = false;
            if (last5[i].close < last5[i - 1].close) priceIncreasing = false;
        }

        // Volume increasing but price flat/declining = distribution
        if (volumeIncreasing && !priceIncreasing) {
            return {
                type: "VOLUME_DECEPTION",
                interpretation: "Volume rising but price not following - smart money distributing",
                action: "AVOID long entries - distribution in progress",
                confidence: 0.75
            };
        }

        return null;
    }

    // ==================== 9. ALGORITHMIC WHIPSAWS ====================

    detectAlgoWhipsaw(candles) {
        const last10 = candles.slice(-10);

        let wickPattern = [];
        for (const c of last10) {
            const upperWick = c.high - Math.max(c.open, c.close);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            const body = Math.abs(c.close - c.open);

            if (upperWick > body * 2) wickPattern.push('UPPER');
            else if (lowerWick > body * 2) wickPattern.push('LOWER');
            else wickPattern.push('BODY');
        }

        // Count alternations
        let alternations = 0;
        for (let i = 1; i < wickPattern.length; i++) {
            if (wickPattern[i] !== wickPattern[i - 1] &&
                wickPattern[i] !== 'BODY' &&
                wickPattern[i - 1] !== 'BODY') {
                alternations++;
            }
        }

        const range = this.calculateRange(last10);
        const avgRange = this.calculateRange(candles.slice(-50));

        // High alternations + tight range = algo whipsaw
        if (alternations > 5 && range < avgRange * 0.6) {
            return {
                type: "ALGO_WHIPSAW",
                interpretation: "HFT bots creating micro volatility - stop-loss hunting",
                action: "SKIP - Wait for range expansion",
                alternations,
                confidence: 0.80
            };
        }

        return null;
    }

    // ==================== 10. MARKET STRUCTURE SHIFTS (SMC) ====================

    detectLiquiditySweep(candles, support, resistance) {
        const lastCandle = candles[candles.length - 1];
        const avgVolume = this.avgVolume(candles.slice(-20));

        // Bullish sweep: Low below support, close above
        if (lastCandle.low < support * 0.998 && lastCandle.close > support * 1.002) {
            const highVolume = lastCandle.volume > avgVolume * 1.3;

            return {
                type: "LIQUIDITY_SWEEP_BULLISH",
                level: support,
                interpretation: "Swept sell-side liquidity, expect bullish continuation",
                action: "CONFIRM - Can enter long after BOS",
                volumeConfirmation: highVolume,
                confidence: highVolume ? 0.85 : 0.70
            };
        }

        // Bearish sweep: High above resistance, close below
        if (lastCandle.high > resistance * 1.002 && lastCandle.close < resistance * 0.998) {
            const highVolume = lastCandle.volume > avgVolume * 1.3;

            return {
                type: "LIQUIDITY_SWEEP_BEARISH",
                level: resistance,
                interpretation: "Swept buy-side liquidity, expect bearish continuation",
                action: "CONFIRM - Can enter short after BOS",
                volumeConfirmation: highVolume,
                confidence: highVolume ? 0.85 : 0.70
            };
        }

        return null;
    }

    detectBreakOfStructure(candles) {
        const last50 = candles.slice(-50);
        const recentHigh = Math.max(...last50.map(c => c.high));
        const recentLow = Math.min(...last50.map(c => c.low));

        const currentCandle = candles[candles.length - 1];
        const avgVolume = this.avgVolume(last50);

        // Bullish BOS
        if (currentCandle.close > recentHigh * 1.005 && currentCandle.volume > avgVolume * 1.5) {
            return {
                type: "BOS_BULLISH",
                interpretation: "Structure shift - trend changed to bullish",
                action: "CONFIRM - Long entries valid after pullback",
                confidence: 0.85
            };
        }

        // Bearish BOS
        if (currentCandle.close < recentLow * 0.995 && currentCandle.volume > avgVolume * 1.5) {
            return {
                type: "BOS_BEARISH",
                interpretation: "Structure shift - trend changed to bearish",
                action: "CONFIRM - Short entries valid after pullback",
                confidence: 0.85
            };
        }

        return null;
    }

    // ==================== COMPREHENSIVE TRAP SCAN ====================

    scanAllTraps(candles, context = {}) {
        const traps = [];

        // Run all detectors
        const detectors = [
            () => this.detectStopHunt(candles, context.support, context.resistance),
            () => this.detectFakeBreakout(candles, context.resistance, 'UP'),
            () => this.detectVolumeAbsorption(candles),
            () => this.detectAbsorptionZone(candles),
            () => this.detectFalseMomentum(candles),
            () => this.detectPreNewsManipulation(candles, context.timestamp),
            () => this.detectVolumeDeception(candles),
            () => this.detectAlgoWhipsaw(candles),
            () => this.detectLiquiditySweep(candles, context.support, context.resistance),
            () => this.detectBreakOfStructure(candles)
        ];

        for (const detector of detectors) {
            try {
                const result = detector();
                if (result) traps.push(result);
            } catch (e) {
                // Skip detector if error
            }
        }

        return {
            trapsDetected: traps.length,
            traps,
            isClean: traps.length === 0,
            recommendation: traps.length > 0 ? "AVOID" : "PROCEED_WITH_CAUTION"
        };
    }

    // ==================== HELPER METHODS ====================

    avgVolume(candles) {
        if (candles.length === 0) return 0;
        return candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
    }

    percentRange(candles) {
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const high = Math.max(...highs);
        const low = Math.min(...lows);
        return (high - low) / low;
    }

    avgBodySize(candles) {
        return candles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / candles.length;
    }

    measureBuyPressure(candles) {
        let buyScore = 0;
        for (const c of candles) {
            if (c.close > c.open) {
                const lowerWick = c.open - c.low;
                const body = c.close - c.open;
                buyScore += lowerWick > body ? 2 : 1;
            }
        }
        return buyScore / (candles.length * 2);
    }

    calculateRange(candles) {
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        return Math.max(...highs) - Math.min(...lows);
    }
}

module.exports = InstitutionalTrapDetector;
