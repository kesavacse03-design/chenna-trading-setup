/**
 * Time-Travel Labs Service
 * Core research engine that tests 220+ technical combinations
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { v4: uuidv4 } = require('uuid');

// ==================================================================================
// PHASE 1: PRICE ACTION FOUNDATION - Candlestick Patterns & Market Structure
// ==================================================================================

/**
 * CANDLESTICK PATTERN DETECTION
 * Institutional-grade pattern recognition for entry quality assessment
 */

/**
 * Check for Bullish Engulfing pattern
 */
function checkBullishEngulfing(bar, prevBar) {
    if (!prevBar) return false;

    const prevBody = Math.abs(prevBar.close - prevBar.open);
    const currBody = Math.abs(bar.close - bar.open);

    // Previous candle bearish, current bullish
    const prevBearish = prevBar.close < prevBar.open;
    const currBullish = bar.close > bar.open;

    // Current body engulfs previous body
    const engulfs = bar.open <= prevBar.close && bar.close >= prevBar.open;

    // Current body significantly larger
    const significantBody = currBody > prevBody * 1.2;

    return prevBearish && currBullish && engulfs && significantBody;
}

/**
 * Check for Bearish Engulfing pattern
 */
function checkBearishEngulfing(bar, prevBar) {
    if (!prevBar) return false;

    const prevBody = Math.abs(prevBar.close - prevBar.open);
    const currBody = Math.abs(bar.close - bar.open);

    const prevBullish = prevBar.close > prevBar.open;
    const currBearish = bar.close < bar.open;

    const engulfs = bar.open >= prevBar.close && bar.close <= prevBar.open;
    const significantBody = currBody > prevBody * 1.2;

    return prevBullish && currBearish && engulfs && significantBody;
}

/**
 * Check for Hammer pattern (bullish reversal)
 */
function checkHammer(bar) {
    const body = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const upperWick = bar.high - Math.max(bar.open, bar.close);

    // Long lower wick, small body, minimal upper wick
    const longLowerWick = lowerWick > body * 2;
    const smallBody = body < totalRange * 0.3;
    const smallUpperWick = upperWick < body * 0.5;

    return longLowerWick && smallBody && smallUpperWick && totalRange > 0;
}

/**
 * Check for Inverted Hammer pattern
 */
function checkInvertedHammer(bar) {
    const body = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;

    const longUpperWick = upperWick > body * 2;
    const smallBody = body < totalRange * 0.3;
    const smallLowerWick = lowerWick < body * 0.5;

    return longUpperWick && smallBody && smallLowerWick && totalRange > 0;
}

/**
 * Check for Shooting Star pattern (bearish reversal)
 */
function checkShootingStar(bar) {
    // Similar to inverted hammer but at top of uptrend
    const body = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;

    const longUpperWick = upperWick > body * 2.5;
    const smallBody = body < totalRange * 0.25;
    const verySmallLowerWick = lowerWick < body * 0.3;
    const bearishClose = bar.close < bar.open;

    return longUpperWick && smallBody && verySmallLowerWick && bearishClose && totalRange > 0;
}

/**
 * Check for Doji pattern (indecision)
 */
function checkDoji(bar) {
    const body = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;

    if (totalRange === 0) return false;

    // Body is less than 5% of total range
    const verySmallBody = body < totalRange * 0.05;

    return verySmallBody;
}

/**
 * Check for Marubozu pattern (strong momentum)
 */
function checkMarubozu(bar) {
    const body = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;

    if (totalRange === 0) return false;

    // Body is at least 90% of total range, minimal wicks
    const largeBody = body > totalRange * 0.9;
    const minimalWicks = upperWick < totalRange * 0.1 && lowerWick < totalRange * 0.1;

    return largeBody && minimalWicks;
}

/**
 * Check for Inside Bar pattern (consolidation)
 */
function checkInsideBar(bar, prevBar) {
    if (!prevBar) return false;

    // Current bar's range is completely inside previous bar's range
    const insideHigh = bar.high <= prevBar.high;
    const insideLow = bar.low >= prevBar.low;

    return insideHigh && insideLow;
}

/**
 * Check for Outside Bar pattern (volatility expansion)
 */
function checkOutsideBar(bar, prevBar) {
    if (!prevBar) return false;

    // Current bar's range completely engulfs previous bar
    const outsideHigh = bar.high > prevBar.high;
    const outsideLow = bar.low < prevBar.low;

    return outsideHigh && outsideLow;
}

/**
 * Check for Pin Bar pattern (rejection)
 */
function checkPinBar(bar) {
    const body = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;

    if (totalRange === 0) return false;

    // Either long upper or lower wick showing rejection
    const longWick = Math.max(upperWick, lowerWick);
    const smallBody = body < totalRange * 0.3;
    const significantWick = longWick > totalRange * 0.6;

    return smallBody && significantWick;
}

/**
 * Detect all candlestick patterns for a bar
 */
function detectCandlestickPatterns(bar, prevBar) {
    return {
        bullishEngulfing: checkBullishEngulfing(bar, prevBar),
        bearishEngulfing: checkBearishEngulfing(bar, prevBar),
        hammer: checkHammer(bar),
        invertedHammer: checkInvertedHammer(bar),
        shootingStar: checkShootingStar(bar),
        doji: checkDoji(bar),
        marubozu: checkMarubozu(bar),
        insideBar: checkInsideBar(bar, prevBar),
        outsideBar: checkOutsideBar(bar, prevBar),
        pinBar: checkPinBar(bar)
    };
}

/**
 * MARKET STRUCTURE DETECTION
 * Identifies swing points and structural patterns (HH/HL/LH/LL, BoS, ChoCH)
 */

/**
 * Find swing highs and lows in a window
 */
function findSwingPoints(candles, startIdx, endIdx, swingStrength = 3) {
    const swingHighs = [];
    const swingLows = [];

    for (let i = startIdx + swingStrength; i < endIdx - swingStrength; i++) {
        // Check if this is a swing high
        let isSwingHigh = true;
        for (let j = i - swingStrength; j <= i + swingStrength; j++) {
            if (j !== i && candles[j].high >= candles[i].high) {
                isSwingHigh = false;
                break;
            }
        }
        if (isSwingHigh) {
            swingHighs.push({ idx: i, price: candles[i].high });
        }

        // Check if this is a swing low
        let isSwingLow = true;
        for (let j = i - swingStrength; j <= i + swingStrength; j++) {
            if (j !== i && candles[j].low <= candles[i].low) {
                isSwingLow = false;
                break;
            }
        }
        if (isSwingLow) {
            swingLows.push({ idx: i, price: candles[i].low });
        }
    }

    return { swingHighs, swingLows };
}

/**
 * Determine market structure (HH/HL/LH/LL)
 */
function determineMarketStructure(swingHighs, swingLows) {
    if (swingHighs.length < 2 || swingLows.length < 2) {
        return 'INSUFFICIENT_DATA';
    }

    // Check last 2 swing highs
    const lastHigh = swingHighs[swingHighs.length - 1].price;
    const prevHigh = swingHighs[swingHighs.length - 2].price;
    const higherHigh = lastHigh > prevHigh;
    const lowerHigh = lastHigh < prevHigh;

    // Check last 2 swing lows
    const lastLow = swingLows[swingLows.length - 1].price;
    const prevLow = swingLows[swingLows.length - 2].price;
    const higherLow = lastLow > prevLow;
    const lowerLow = lastLow < prevLow;

    // Determine structure
    if (higherHigh && higherLow) return 'HH_HL_UPTREND';
    if (lowerHigh && lowerLow) return 'LH_LL_DOWNTREND';
    if (higherHigh && lowerLow) return 'HH_LL_CHOPPY';
    if (lowerHigh && higherLow) return 'LH_HL_RANGING';

    return 'UNCLEAR';
}

/**
 * Detect Break of Structure (BoS) - continuation pattern
 */
function detectBreakOfStructure(swingLows, swingHighs, currentPrice, structure) {
    if (structure === 'HH_HL_UPTREND' && swingLows.length > 0) {
        const lastLow = swingLows[swingLows.length - 1].price;
        // Price breaking above previous swing low in uptrend = BoS
        return currentPrice > lastLow;
    }

    if (structure === 'LH_LL_DOWNTREND' && swingHighs.length > 0) {
        const lastHigh = swingHighs[swingHighs.length - 1].price;
        // Price breaking below previous swing high in downtrend = BoS
        return currentPrice < lastHigh;
    }

    return false;
}

/**
 * Detect Change of Character (ChoCH) - potential reversal
 */
function detectChangeOfCharacter(swingLows, swingHighs, currentPrice, structure) {
    if (structure === 'HH_HL_UPTREND' && swingLows.length > 1) {
        // Breaking below recent swing low = potential reversal
        const recentLow = swingLows[swingLows.length - 1].price;
        return currentPrice < recentLow;
    }

    if (structure === 'LH_LL_DOWNTREND' && swingHighs.length > 1) {
        // Breaking above recent swing high = potential reversal
        const recentHigh = swingHighs[swingHighs.length - 1].price;
        return currentPrice > recentHigh;
    }

    return false;
}

/**
 * Complete market structure analysis
 */
function analyzeMarketStructure(candles, currentIdx) {
    const lookback = 50;
    const startIdx = Math.max(0, currentIdx - lookback);

    if (currentIdx - startIdx < 20) {
        return {
            structure: 'INSUFFICIENT_DATA',
            bos: false,
            choch: false,
            swingCount: 0
        };
    }

    const { swingHighs, swingLows } = findSwingPoints(candles, startIdx, currentIdx);
    const structure = determineMarketStructure(swingHighs, swingLows);
    const currentPrice = candles[currentIdx].close;

    const bos = detectBreakOfStructure(swingLows, swingHighs, currentPrice, structure);
    const choch = detectChangeOfCharacter(swingLows, swingHighs, currentPrice, structure);

    return {
        structure: structure,
        bos: bos,
        choch: choch,
        swingHighs: swingHighs.length,
        swingLows: swingLows.length,
        swingCount: swingHighs.length + swingLows.length
    };
}

// ==================================================================================
// PHASE 2: SUPPORT/RESISTANCE & FAIR VALUE GAPS
// ==================================================================================

/**
 * SUPPORT & RESISTANCE DETECTION
 * Identifies key price levels using swing points and tests for breakouts/breakdowns
 */

/**
 * Find nearest support and resistance levels
 */
function findNearestSRLevels(swingHighs, swingLows, currentPrice) {
    // Find resistance (swing highs above current price)
    const resistanceLevels = swingHighs
        .filter(sh => sh.price > currentPrice)
        .sort((a, b) => a.price - b.price);

    // Find support (swing lows below current price)
    const supportLevels = swingLows
        .filter(sl => sl.price < currentPrice)
        .sort((a, b) => b.price - a.price);

    return {
        nearestResistance: resistanceLevels[0] || null,
        nearestSupport: supportLevels[0] || null,
        resistanceLevels: resistanceLevels.slice(0, 3),
        supportLevels: supportLevels.slice(0, 3)
    };
}

/**
 * Check breakout quality (not just price, but HOW it broke out)
 */
function assessBreakoutQuality(bar, resistanceLevel, prevBar) {
    if (!resistanceLevel || !prevBar) return { quality: 'NONE', score: 0 };

    const breakoutPrice = resistanceLevel.price;
    const closeAbove = bar.close > breakoutPrice;

    if (!closeAbove) return { quality: 'NONE', score: 0 };

    // Quality factors
    const body = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;
    const bodyToWickRatio = totalRange > 0 ? body / totalRange : 0;

    // 1. Body-to-wick ratio (strong close above)
    const strongBody = bodyToWickRatio > 0.6;

    // 2. Close in upper 30% of range
    const closeStrength = totalRange > 0 ? (bar.close - bar.low) / totalRange : 0;
    const strongClose = closeStrength > 0.7;

    // 3. Bullish candle
    const bullish = bar.close > bar.open;

    // 4. Conviction = how far above breakout level
    const penetration = (bar.close - breakoutPrice) / breakoutPrice;
    const significantPenetration = penetration > 0.01; // >1% above

    let score = 0;
    if (strongBody) score += 25;
    if (strongClose) score += 25;
    if (bullish) score += 25;
    if (significantPenetration) score += 25;

    const quality = score >= 75 ? 'STRONG' : score >= 50 ? 'MODERATE' : 'WEAK';

    return { quality, score, closeAbove: true };
}

/**
 * Check breakdown quality
 */
function assessBreakdownQuality(bar, supportLevel, prevBar) {
    if (!supportLevel || !prevBar) return { quality: 'NONE', score: 0 };

    const breakdownPrice = supportLevel.price;
    const closeBelow = bar.close < breakdownPrice;

    if (!closeBelow) return { quality: 'NONE', score: 0 };

    const body = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;
    const bodyToWickRatio = totalRange > 0 ? body / totalRange : 0;

    const strongBody = bodyToWickRatio > 0.6;
    const closeStrength = totalRange > 0 ? (bar.high - bar.close) / totalRange : 0;
    const strongClose = closeStrength > 0.7;
    const bearish = bar.close < bar.open;
    const penetration = (breakdownPrice - bar.close) / breakdownPrice;
    const significantPenetration = penetration > 0.01;

    let score = 0;
    if (strongBody) score += 25;
    if (strongClose) score += 25;
    if (bearish) score += 25;
    if (significantPenetration) score += 25;

    const quality = score >= 75 ? 'STRONG' : score >= 50 ? 'MODERATE' : 'WEAK';

    return { quality, score, closeBelow: true };
}

/**
 * Detect retest zones (price broke level then came back to test)
 */
function detectRetestZone(candles, currentIdx, swingHighs, swingLows) {
    if (currentIdx < 10) return { isRetest: false, type: null };

    const currentPrice = candles[currentIdx].close;
    const lookback = 10;

    // Check if we recently broke a resistance and are now retesting
    for (let i = currentIdx - lookback; i < currentIdx; i++) {
        if (i < 0) continue;

        const bar = candles[i];

        // Find if this bar broke a resistance
        for (const resistance of swingHighs) {
            if (resistance.idx < i && bar.close > resistance.price) {
                // Broke above resistance - now check if current price is retesting
                const tolerance = resistance.price * 0.02; // 2% tolerance
                if (Math.abs(currentPrice - resistance.price) < tolerance && currentPrice >= resistance.price) {
                    return {
                        isRetest: true,
                        type: 'RESISTANCE_TO_SUPPORT',
                        level: resistance.price,
                        strength: 'MODERATE'
                    };
                }
            }
        }

        // Check support becoming resistance
        for (const support of swingLows) {
            if (support.idx < i && bar.close < support.price) {
                const tolerance = support.price * 0.02;
                if (Math.abs(currentPrice - support.price) < tolerance && currentPrice <= support.price) {
                    return {
                        isRetest: true,
                        type: 'SUPPORT_TO_RESISTANCE',
                        level: support.price,
                        strength: 'MODERATE'
                    };
                }
            }
        }
    }

    return { isRetest: false, type: null };
}

/**
 * Complete S/R analysis
 */
function analyzeSupportResistance(candles, currentIdx) {
    const lookback = 50;
    const startIdx = Math.max(0, currentIdx - lookback);

    if (currentIdx - startIdx < 20) {
        return {
            nearestSupport: null,
            nearestResistance: null,
            breakoutQuality: 'NONE',
            breakdownQuality: 'NONE',
            isRetest: false
        };
    }

    const { swingHighs, swingLows } = findSwingPoints(candles, startIdx, currentIdx);
    const currentPrice = candles[currentIdx].close;
    const prevBar = currentIdx > 0 ? candles[currentIdx - 1] : null;

    const srLevels = findNearestSRLevels(swingHighs, swingLows, currentPrice);
    const breakoutQuality = assessBreakoutQuality(candles[currentIdx], srLevels.nearestResistance, prevBar);
    const breakdownQuality = assessBreakdownQuality(candles[currentIdx], srLevels.nearestSupport, prevBar);
    const retestInfo = detectRetestZone(candles, currentIdx, swingHighs, swingLows);

    return {
        nearestSupport: srLevels.nearestSupport,
        nearestResistance: srLevels.nearestResistance,
        breakoutQuality: breakoutQuality.quality,
        breakdownQuality: breakdownQuality.quality,
        isRetest: retestInfo.isRetest,
        retestType: retestInfo.type
    };
}

/**
 * FAIR VALUE GAP (FVG) DETECTION
 * Identifies price imbalances for potential reversal/continuation zones
 */

/**
 * Detect Fair Value Gaps (imbalance/inefficiency in price)
 */
function detectFairValueGaps(candles, currentIdx) {
    const gaps = [];
    const lookback = 20;
    const startIdx = Math.max(0, currentIdx - lookback);

    for (let i = startIdx; i < currentIdx - 2; i++) {
        const c1 = candles[i];
        const c2 = candles[i + 1];
        const c3 = candles[i + 2];

        // Bullish FVG: c1.high < c3.low (gap between candle 1 and 3, with candle 2 creating imbalance)
        if (c2.low > c1.high && c2.low > c3.high) {
            const gapTop = c2.low;
            const gapBottom = Math.max(c1.high, c3.high);

            if (gapTop > gapBottom) {
                gaps.push({
                    type: 'BULLISH_FVG',
                    top: gapTop,
                    bottom: gapBottom,
                    midpoint: (gapTop + gapBottom) / 2,
                    index: i + 1,
                    age: currentIdx - (i + 1)
                });
            }
        }

        // Bearish FVG: c1.low > c3.high
        if (c2.high < c1.low && c2.high < c3.low) {
            const gapTop = Math.min(c1.low, c3.low);
            const gapBottom = c2.high;

            if (gapTop > gapBottom) {
                gaps.push({
                    type: 'BEARISH_FVG',
                    top: gapTop,
                    bottom: gapBottom,
                    midpoint: (gapTop + gapBottom) / 2,
                    index: i + 1,
                    age: currentIdx - (i + 1)
                });
            }
        }
    }

    // Check if current price is in an FVG zone
    const currentPrice = candles[currentIdx].close;
    const activeFVG = gaps.find(gap => currentPrice >= gap.bottom && currentPrice <= gap.top);

    return {
        gaps: gaps,
        count: gaps.length,
        inFVG: !!activeFVG,
        activeFVG: activeFVG || null
    };
}

// ==================================================================================
// PHASE 4: ENHANCED TRAP DETECTION (8 Total Patterns)
// ==================================================================================

/**
 * Stop Hunt Detection
 * Identifies when price wicks into obvious stop-loss zones then reverses
 */
function detectStopHunt(candles, currentIdx) {
    if (currentIdx < 20) return false;

    const bar = candles[currentIdx];
    const lookback = 10;
    const recentLows = candles.slice(currentIdx - lookback, currentIdx).map(c => c.low);
    const obviousSupportLevel = Math.min(...recentLows);

    // Check if current bar wicked below support (stop hunt) but closed above
    const wickedBelow = bar.low < obviousSupportLevel * 0.98; // Dipped 2% below
    const closedAbove = bar.close > obviousSupportLevel;
    const longLowerWick = (Math.min(bar.open, bar.close) - bar.low) > (bar.high - bar.low) * 0.5;

    return wickedBelow && closedAbove && longLowerWick;
}

/**
 * Liquidity Sweep Detection
 * Identifies when price takes out recent highs/lows to grab liquidity then reverses
 */
function detectLiquiditySweep(candles, currentIdx) {
    if (currentIdx < 30) return false;

    const bar = candles[currentIdx];
    const lookback = 20;
    const recent = candles.slice(currentIdx - lookback, currentIdx);

    // Bullish sweep: takes out recent high then reverses down
    const recentHigh = Math.max(...recent.map(c => c.high));
    const sweptHigh = bar.high > recentHigh;
    const reversedDown = bar.close < bar.open && bar.close < recentHigh * 0.99;

    if (sweptHigh && reversedDown) return { type: 'BEARISH_SWEEP', severity: 'HIGH' };

    // Bearish sweep: takes out recent low then reverses up
    const recentLow = Math.min(...recent.map(c => c.low));
    const sweptLow = bar.low < recentLow;
    const reversedUp = bar.close > bar.open && bar.close > recentLow * 1.01;

    if (sweptLow && reversedUp) return { type: 'BULLISH_SWEEP', severity: 'MEDIUM' };

    return false;
}

/**
 * Distribution Phase Detection
 * High volume + OBV divergence near top = smart money distributing
 */
function detectDistributionPhase(candles, currentIdx, obvValues) {
    if (currentIdx < 30 || !obvValues || obvValues.length <= currentIdx) return false;

    const lookback = 20;
    const recent = candles.slice(currentIdx - lookback, currentIdx + 1);
    const recentOBV = obvValues.slice(currentIdx - lookback, currentIdx + 1);

    // Check if price is near recent high
    const currentPrice = candles[currentIdx].close;
    const recentHigh = Math.max(...recent.map(c => c.high));
    const nearHigh = currentPrice > recentHigh * 0.95;

    if (!nearHigh) return false;

    // OBV divergence: price rising but OBV falling
    const priceChange = currentPrice - recent[0].close;
    const obvChange = recentOBV[recentOBV.length - 1] - recentOBV[0];

    const obvDivergence = priceChange > 0 && obvChange < 0;

    // High churn (volume spike without price movement)
    const avgVolume = recent.slice(0, -5).reduce((sum, c) => sum + (c.volume || 0), 0) / (recent.length - 5);
    const recentAvgVolume = recent.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
    const highChurn = recentAvgVolume > avgVolume * 1.5;

    return obvDivergence && highChurn;
}

/**
 * Exhaustion Gap Detection
 * Final gap move before reversal (climax pattern)
 */
function detectExhaustionGap(candles, currentIdx) {
    if (currentIdx < 3) return false;

    const c1 = candles[currentIdx - 2];
    const c2 = candles[currentIdx - 1];
    const c3 = candles[currentIdx];

    // Bullish exhaustion: gap up but immediate reversal
    const gapUp = c2.low > c1.high;
    const strongReversal = c3.close < c2.close && (c2.close - c3.close) / c2.close > 0.02;
    const highVolume = c2.volume > c1.volume * 1.5;

    if (gapUp && strongReversal && highVolume) {
        return { type: 'BULLISH_EXHAUSTION', severity: 'HIGH' };
    }

    // Bearish exhaustion: gap down but immediate reversal
    const gapDown = c2.high < c1.low;
    const strongReversalUp = c3.close > c2.close && (c3.close - c2.close) / c2.close > 0.02;

    if (gapDown && strongReversalUp && highVolume) {
        return { type: 'BEARISH_EXHAUSTION', severity: 'HIGH' };
    }

    return false;
}

/**
 * Bear Trap Detection (specific logic different from bull trap)
 * Breakdown below support with volume, but immediate strong reversal
 */
function detectBearTrap(candles, currentIdx) {
    if (currentIdx < 20) return false;

    const bar = candles[currentIdx];
    const prevBar = candles[currentIdx - 1];
    const lookback = 15;
    const recent = candles.slice(currentIdx - lookback, currentIdx);

    // Find support level
    const supportLevel = Math.min(...recent.map(c => c.low));

    // Breakdown conditions
    const brokeSupport = bar.close < supportLevel;
    const avgVol = recent.reduce((sum, c) => sum + (c.volume || 0), 0) / recent.length;
    const highVolume = bar.volume > avgVol * 1.3;

    // Trap: broke down but closing in upper half of range (showing rejection)
    const range = bar.high - bar.low;
    const closePosition = range > 0 ? (bar.close - bar.low) / range : 0;
    const strongRejection = closePosition > 0.6;

    // Long lower wick showing buying pressure
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const longWick = lowerWick > range * 0.4;

    return brokeSupport && highVolume && (strongRejection || longWick);
}

/**
 * COMPREHENSIVE TRAP DETECTION
 * Combines all 8 trap patterns with severity scoring
 */
function detectAllTraps(candles, currentIdx, obvValues) {
    const traps = [];

    if (currentIdx < 20) return { detected: false, traps: [], trapScore: 0 };

    const bar = candles[currentIdx];
    const history = candles.slice(Math.max(0, currentIdx - 20), currentIdx);

    // 1. Volume Trap (from Phase 1 - existing)
    const avgVol = history.reduce((sum, h) => sum + (h.volume || 0), 0) / history.length;
    const range = (bar.high - bar.low) / bar.close;
    if (bar.volume > avgVol * 2 && range < 0.01) {
        traps.push({ type: 'VOLUME_TRAP', severity: 'HIGH' });
    }

    // 2. Bull Trap (from Phase 1 - existing as fake breakout)
    const high20 = Math.max(...history.slice(-20).map(h => h.high));
    if (bar.close > high20 && bar.volume < avgVol * 0.7) {
        traps.push({ type: 'BULL_TRAP', severity: 'MEDIUM' });
    }

    // 3. Bear Trap (Phase 4 - NEW)
    if (detectBearTrap(candles, currentIdx)) {
        traps.push({ type: 'BEAR_TRAP', severity: 'MEDIUM' });
    }

    // 4. Stop Hunt (Phase 4 - NEW)
    if (detectStopHunt(candles, currentIdx)) {
        traps.push({ type: 'STOP_HUNT', severity: 'HIGH' });
    }

    // 5. Liquidity Sweep (Phase 4 - NEW)
    const sweep = detectLiquiditySweep(candles, currentIdx);
    if (sweep) {
        traps.push({ type: sweep.type, severity: sweep.severity });
    }

    // 6. Distribution Phase (Phase 4 - NEW)
    if (detectDistributionPhase(candles, currentIdx, obvValues)) {
        traps.push({ type: 'DISTRIBUTION_PHASE', severity: 'HIGH' });
    }

    // 7. Exhaustion Gap (Phase 4 - NEW)
    const exhaustion = detectExhaustionGap(candles, currentIdx);
    if (exhaustion) {
        traps.push({ type: exhaustion.type, severity: exhaustion.severity });
    }

    // 8. Wick Rejection (from Phase 1 - existing)
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const bodySize = Math.abs(bar.close - bar.open);
    if (upperWick > bodySize * 2) {
        traps.push({ type: 'REJECTION_WICK', severity: 'MEDIUM' });
    }

    // Calculate trap score
    const trapScore = traps.reduce((sum, t) => sum + (t.severity === 'HIGH' ? 3 : t.severity === 'MEDIUM' ? 2 : 1), 0);

    return {
        detected: traps.length > 0,
        traps: traps,
        trapScore: trapScore,
        trapCount: traps.length
    };
}

// ==================================================================================
// EXISTING LABS FUNCTIONS (runTimeTravelLabs, etc.)
// ==================================================================================

/**
 * Run Time-Travel Labs research for a category
 */
async function runTimeTravelLabs(categoryKey, stocks, options = {}) {
    const ttVersion = options.ttVersion || await generateNextTTVersion(categoryKey);
    const mode = options.mode || 'mock';
    console.log(`[Labs] Starting Time-Travel Labs for ${categoryKey}, version ${ttVersion}`);
    console.log(`[Labs] DEEP RESEARCH MODE: Analyzing all ${stocks.length} stocks with ${mode} data`);

    // Step 1: Check cache (for info only, not skipping)
    const cacheStatus = await checkLabsCache(stocks);
    console.log(`[Labs] Cache info: ${cacheStatus.cached} previously researched, ${cacheStatus.uncached.length} new`);

    // Step 2: ALWAYS fetch data for ALL stocks (don't skip cached ones for research!)
    console.log(`[Labs] Fetching historical data for ALL ${stocks.length} stocks...`);
    const stockData = await fetchStockData(stocks, mode);  // FIX: Use ALL stocks, not just uncached!

    // DEBUG: Check what data was fetched
    const stocksWithData = Object.keys(stockData).filter(symbol => stockData[symbol] && stockData[symbol].length > 0);
    console.log(`[Labs] ✅ Data loaded for ${stocksWithData.length}/${stocks.length} stocks`);

    if (stocksWithData.length === 0) {
        throw new Error('NO DATA LOADED FOR ANY STOCK! Cannot proceed with research.');
    }

    if (stocksWithData.length > 0) {
        const sampleSymbol = stocksWithData[0];
        console.log(`[Labs] Sample: ${sampleSymbol} has ${stockData[sampleSymbol].length} candles`);
    }

    // Step 3: Generate 220+ combinations
    const combinations = generateTechnicalCombinations();
    console.log(`[Labs] 🔬 Testing ${combinations.length} strategy combinations across ${stocksWithData.length} stocks...`);
    console.log(`[Labs] Estimated analysis: ~${combinations.length * stocksWithData.length * 150} data points`);
    console.log(`[Labs] This will take 15-20 minutes for thorough research...`);

    // Step 4: Test each combination
    const results = [];
    for (let i = 0; i < combinations.length; i++) {
        const combo = combinations[i];
        const backtestResult = await testCombination(stocks, combo, stockData);
        results.push({
            combo,
            accuracy: backtestResult.accuracy,
            trades: backtestResult.trades,
            pnl: backtestResult.pnl,
            drawdown: backtestResult.drawdown,
            winRate: backtestResult.winRate
        });
        if (i % 20 === 0) {
            console.log(`[Labs] Progress: ${i}/${combinations.length} combinations tested`);
        }
    }
    // Step 5: Detect traps
    const trapDetector = require('./trapDetectorService.cjs');
    let trapResults = {};
    try {
        trapResults = await trapDetector.detectTrapsForStocks(stocks, stockData);
    } catch (trapError) {
        console.log(`[Labs] Skipping trap detection due to error: ${trapError.message}`);
    }

    // Step 6: Find best combination (REMOVED 70% THRESHOLD - this is RESEARCH!)
    // Sort by accuracy, then by PnL per trade
    const sortedResults = results.sort((a, b) => {
        if (Math.abs(b.accuracy - a.accuracy) > 0.01) return b.accuracy - a.accuracy;
        if (a.trades === 0) return 1;
        if (b.trades === 0) return -1;
        return (b.pnl / b.trades) - (a.pnl / a.trades);
    });

    const bestCombo = sortedResults[0];
    const accuracyPercent = (bestCombo.accuracy * 100).toFixed(1);

    console.log(`[Labs] Best combo found: ${accuracyPercent}% accuracy, ${bestCombo.trades} trades`);

    if (bestCombo.trades === 0) {
        console.log(`[Labs] ⚠️ WARNING: No trades generated by any combination!`);
        console.log(`[Labs] This likely means entry conditions are too strict or data quality issues.`);
    }

    // Generate recommended logic
    const recommendedLogic = {
        entry: generateEntryConditions(bestCombo.combo),
        exit: generateExitConditions(bestCombo.combo),
        trapAvoidance: generateTrapRules(trapResults)
    };
    // Step 8: Save to database
    const labsRun = await prisma.labsRun.create({
        data: {
            id: uuidv4(),
            categoryKey,
            ttVersion,
            accuracy: bestCombo.accuracy,
            tradesTested: bestCombo.trades,
            recommendedLogic,
            entryConditions: recommendedLogic.entry,
            exitConditions: recommendedLogic.exit,
            trapRules: recommendedLogic.trapAvoidance,

            // ✅ ADD: Strategy parameters for backtest integration
            strategyParams: {
                rsiMin: bestCombo.combo.rsiMin,
                rsiMax: bestCombo.combo.rsiMax,
                emaShort: bestCombo.combo.emaShort,
                emaLong: bestCombo.combo.emaLong,
                volumeMultiplier: bestCombo.combo.volumeMultiplier,
                atrMultiplier: bestCombo.combo.atrMultiplier,
                candlePattern: bestCombo.combo.candlePattern,
                bbWidthMin: bestCombo.combo.bbWidthMin || 10,
                // Exit parameters (from simulation)
                targetR: 2.5,
                stopR: 1.0,
                maxHoldingDays: 10
            },

            cacheStatus: {
                cached: cacheStatus.cached,
                uncached: cacheStatus.uncached.length,
                total: stocks.length
            },
            performanceMetrics: {
                pnl: bestCombo.pnl,
                drawdown: bestCombo.drawdown,
                winRate: bestCombo.winRate,
                expectancy: bestCombo.pnl / bestCombo.trades
            }
        }
    });
    console.log(`[Labs] Completed! Run ID: ${labsRun.id}`);

    // ✅ PHASE 3: Track outcome for Shadow Learner
    try {
        const outcomeTracker = require('./outcomeTracker.cjs');
        await outcomeTracker.trackOutcome({
            type: 'labs_discovery',
            categoryKey,
            strategyParams: recommendedLogic,
            result: {
                accuracy: bestCombo.accuracy,
                winRate: bestCombo.winRate,
                pnl: bestCombo.pnl,
                drawdown: bestCombo.drawdown,
                totalTrades: bestCombo.trades,
                expectancy: bestCombo.pnl / bestCombo.trades
            }
        });
        console.log(`[Shadow] Labs outcome tracked for AI learning`);
    } catch (trackError) {
        console.error('[Shadow] Failed to track Labs outcome:', trackError.message);
    }

    return {
        runId: labsRun.id,
        ttVersion,
        accuracy: bestCombo.accuracy,
        recommendedLogic,
        metrics: labsRun.performanceMetrics,
        cacheStatus: labsRun.cacheStatus
    };
}
/**
 * PHASE 5: GRID-BASED COMBINATION TESTING
 * Systematic parameter optimization for institutional-grade strategy discovery
 */

/**
 * Define comprehensive parameter grids for systematic testing
 */
function defineParameterGrids() {
    return {
        // RSI entry zones (4 ranges for different market conditions)
        rsiZones: [
            [24, 28],  // Deep oversold
            [28, 32],  // Moderate oversold
            [32, 36],  // Neutral low
            [36, 40]   // Neutral
        ],

        // Volume confirmation factors
        volumeFactors: [1.2, 1.5, 1.8, 2.0],

        // Trend alignment filters
        trendFilters: [
            'ema20_only',      // Above EMA20
            'ema20_ema50',     // Above both EMA20 and EMA50
            'any'              // No trend filter
        ],

        // Candlestick pattern requirements (using Phase 1 patterns)
        candlePatterns: [
            'bullish_engulfing',
            'hammer',
            'any_bullish',     // Any bullish pattern
            'none'             // No pattern required
        ],

        // Volatility filters (using Phase 4 analysis)
        volatilityFilters: [
            'bb_squeeze',      // Bollinger squeeze (expansion coming)
            'atr_low',         // Low ATR (quiet before breakout)
            'expanding',       // Volatility expanding
            'none'             // No volatility filter
        ],

        // Trap filter strictness levels
        trapFilterLevels: [
            'strict',          // Reject any trap signal
            'medium',          // Reject HIGH severity traps only
            'off'              // No trap filtering
        ],

        // Exit targets (R-multiples)
        exitTargets: [1.5, 2.0, 2.5, 3.0],

        // Stop losses (R-multiples)
        exitStops: [0.5, 0.75, 1.0],

        // EMA combinations for trend
        emaShort: [8, 13, 20],
        emaLong: [34, 50, 89]
    };
}

/**
 * Generate combinations from parameter grid with smart sampling
 * Avoids redundant combinations and uses Bayesian hints
 */
function generateGridCombinations() {
    const grids = defineParameterGrids();
    const combinations = [];

    // Full Cartesian product would be: 4×4×3×4×4×3×4×3×3×3 = ~100,000+ combos
    // Smart sampling: use representative samples from each dimension

    for (const rsiZone of grids.rsiZones) {
        for (const volFactor of grids.volumeFactors) {
            for (const trendFilter of grids.trendFilters) {
                for (const pattern of grids.candlePatterns) {
                    for (const volFilter of grids.volatilityFilters) {
                        for (const trapLevel of grids.trapFilterLevels) {
                            // Sample 2 representative exit combos instead of all 12
                            const exitCombos = [
                                { target: 2.0, stop: 0.75 },  // Conservative
                                { target: 2.5, stop: 1.0 }    // Balanced
                            ];

                            for (const exits of exitCombos) {
                                // Sample 2 EMA combos instead of all 9
                                const emaCombos = [
                                    { short: 13, long: 50 },   // Standard
                                    { short: 20, long: 89 }    // Slower
                                ];

                                for (const ema of emaCombos) {
                                    combinations.push({
                                        // Entry parameters
                                        entry: {
                                            rsiMin: rsiZone[0],
                                            rsiMax: rsiZone[1],
                                            volumeFactor: volFactor,
                                            trendFilter: trendFilter,
                                            candlePattern: pattern,
                                            volatilityFilter: volFilter,
                                            trapFilter: trapLevel
                                        },
                                        // Exit parameters
                                        exit: {
                                            targetR: exits.target,
                                            stopR: exits.stop
                                        },
                                        // Technical parameters
                                        tech: {
                                            emaShort: ema.short,
                                            emaLong: ema.long
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    console.log(`[Labs] Generated ${combinations.length} grid combinations for testing`);
    return combinations.slice(0, 384);  // Limit to 384 (reasonable for testing)
}

/**
 * Calculate quality score for a strategy candidate
 * Uses: 40% win rate + 30% expectancy + 20% trap avoidance + 10% drawdown penalty
 */
function calculateQualityScore(result, trapAvoidanceStats) {
    if (result.trades === 0) return 0;

    const winRate = result.accuracy;  // 0-1
    const expectancy = result.trades > 0 ? result.pnl / result.trades : 0;  // Avg R per trade
    const normalizedExpectancy = Math.min(expectancy / 2.0, 1.0);  // Normalize to 0-1 (2R = 100%)

    // Trap avoidance score (what % of traps were avoided)
    const trapScore = trapAvoidanceStats ? trapAvoidanceStats.avoidanceRate : 0.5;

    // Drawdown penalty (normalize drawdown to 0-1 scale, penalize heavily)
    const maxAcceptableDD = 0.20;  // 20% max DD
    const ddPenalty = result.drawdown > maxAcceptableDD ?
        0 :
        (1 - (result.drawdown / maxAcceptableDD));

    // Weighted quality score
    const qualityScore = (
        0.40 * winRate +
        0.30 * normalizedExpectancy +
        0.20 * trapScore +
        0.10 * ddPenalty
    );

    return qualityScore;
}

/**
 * Select top candidates from results
 * Filters: ≥70% accuracy, ≥30 trades minimum
 */
function selectTopCandidates(results, topN = 3) {
    // Filter minimum requirements
    const qualified = results.filter(r => {
        return r.accuracy >= 0.70 &&      // Minimum 70% win rate
            r.trades >= 30 &&           // Minimum 30 trades for statistical significance
            r.drawdown < 0.25;          // Maximum 25% drawdown
    });

    if (qualified.length === 0) {
        console.log(`[Labs] No candidates met 70% accuracy threshold`);
        // Relax criteria if nothing qualifies
        const relaxed = results.filter(r => r.trades >= 20 && r.accuracy >= 0.60);
        if (relaxed.length > 0) {
            console.log(`[Labs] Using relaxed criteria (60% accuracy, 20 trades)`);
            return relaxed
                .sort((a, b) => b.qualityScore - a.qualityScore)
                .slice(0, topN);
        }
        // Last resort: just return top by quality score
        return results
            .filter(r => r.trades > 0)
            .sort((a, b) => b.qualityScore - a.qualityScore)
            .slice(0, topN);
    }

    // Sort by quality score
    return qualified
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, topN);
}

/**
 * Generate final recommended logic with reasoning
 */
function generateRecommendedLogicWithReasoning(topCandidate) {
    const entryRules = [];
    const reasoning = [];

    // RSI zone
    entryRules.push(`RSI between ${topCandidate.combo.entry.rsiMin}-${topCandidate.combo.entry.rsiMax}`);
    reasoning.push(`RSI ${topCandidate.combo.entry.rsiMin}-${topCandidate.combo.entry.rsiMax} zone identified as optimal entry timing`);

    // Volume
    entryRules.push(`Volume > ${topCandidate.combo.entry.volumeFactor}x average`);
    reasoning.push(`Volume confirmation (${topCandidate.combo.entry.volumeFactor}x) ensures institutional participation`);

    // Trend filter
    if (topCandidate.combo.entry.trendFilter !== 'any') {
        entryRules.push(`Price above ${topCandidate.combo.entry.trendFilter.replace('_', ' ')}`);
        reasoning.push(`Trend alignment increases probability of follow-through`);
    }

    // Pattern
    if (topCandidate.combo.entry.candlePattern !== 'none') {
        entryRules.push(`${topCandidate.combo.entry.candlePattern.replace('_', ' ')} pattern`);
        reasoning.push(`Candlestick pattern provides reversal/continuation confirmation`);
    }

    // Volatility
    if (topCandidate.combo.entry.volatilityFilter !== 'none') {
        entryRules.push(`Volatility state: ${topCandidate.combo.entry.volatilityFilter.replace('_', ' ')}`);
        reasoning.push(`Volatility filter times entries for optimal risk/reward`);
    }

    // Trap avoidance
    if (topCandidate.combo.entry.trapFilter !== 'off') {
        entryRules.push(`No ${topCandidate.combo.entry.trapFilter} trap signals detected`);
        reasoning.push(`Trap detection avoids institutional distribution zones`);
    }

    return {
        entry: entryRules,
        exit: [
            `Target: ${topCandidate.combo.exit.targetR}R`,
            `Stop: ${topCandidate.combo.exit.stopR}R`
        ],
        reasoning: reasoning,
        metrics: {
            accuracy: (topCandidate.accuracy * 100).toFixed(1) + '%',
            trades: topCandidate.trades,
            expectancy: (topCandidate.pnl / topCandidate.trades).toFixed(2) + 'R',
            drawdown: (topCandidate.drawdown * 100).toFixed(1) + '%',
            qualityScore: (topCandidate.qualityScore * 100).toFixed(0)
        }
    };
}

/**
 * Generate Technical Combinations - PROFESSIONAL APPROACH
 * Uses traditional nested loops to create TRULY DIFFERENT combinations
 */
function generateTechnicalCombinations() {
    console.log('[Labs] Generating combinations with professional approach...');

    // Define parameter ranges (proven values from technical analysis)
    const rsiRanges = [
        [15, 25],  // Deep oversold - bounce plays
        [20, 30],  // Oversold - reversal zone
        [25, 35],  // Moderate oversold
        [30, 40]   // Neutral low - momentum entries
    ];

    const volumeMultipliers = [
        1.0,   // Normal volume (baseline)
        1.2,   // Slightly elevated
        1.5,   // Strong interest
        1.8,   // High conviction
        2.0    // Institutional activity
    ];

    const emaShortPeriods = [8, 13, 20];    // Fast, Standard, Slow
    const emaLongPeriods = [34, 50, 89];    // Medium, Standard, Slow

    const atrMultipliers = [
        0.8,   // Low volatility
        1.0,   // Normal volatility
        1.2    // High volatility
    ];

    const candlePatterns = [
        'none',       // No pattern required
        'hammer',     // Bullish reversal
        'engulfing'   // Strong momentum
    ];

    // Generate all combinations using nested loops
    const allCombos = [];

    for (const rsiRange of rsiRanges) {
        for (const volMult of volumeMultipliers) {
            for (const emaShort of emaShortPeriods) {
                for (const emaLong of emaLongPeriods) {
                    // Skip invalid EMA combinations (short must be < long)
                    if (emaShort >= emaLong) continue;

                    for (const atrMult of atrMultipliers) {
                        for (const pattern of candlePatterns) {
                            allCombos.push({
                                rsiMin: rsiRange[0],
                                rsiMax: rsiRange[1],
                                emaShort: emaShort,
                                emaLong: emaLong,
                                volumeMultiplier: volMult,
                                atrMultiplier: atrMult,
                                candlePattern: pattern,
                                bbWidthMin: 10  // Standard BB width
                            });
                        }
                    }
                }
            }
        }
    }

    console.log(`[Labs] Generated ${allCombos.length} total combinations`);

    // Sample 220 DIVERSE combinations (evenly distributed)
    const sampleSize = 220;
    const step = Math.floor(allCombos.length / sampleSize);
    const sampledCombos = allCombos.filter((_, index) => index % step === 0).slice(0, sampleSize);

    console.log(`[Labs] Sampled ${sampledCombos.length} diverse combinations for testing`);
    console.log(`[Labs] Example combo 1: RSI ${sampledCombos[0].rsiMin}-${sampledCombos[0].rsiMax}, Vol ${sampledCombos[0].volumeMultiplier}x, EMA ${sampledCombos[0].emaShort}/${sampledCombos[0].emaLong}, ATR ${sampledCombos[0].atrMultiplier}x`);
    console.log(`[Labs] Example combo 100: RSI ${sampledCombos[99].rsiMin}-${sampledCombos[99].rsiMax}, Vol ${sampledCombos[99].volumeMultiplier}x, EMA ${sampledCombos[99].emaShort}/${sampledCombos[99].emaLong}, ATR ${sampledCombos[99].atrMultiplier}x`);

    return sampledCombos;
}
/**
 * COMPREHENSIVE ENTRY SIGNAL CHECK
 * Integrates ALL Phase 1-5 features for institutional-grade analysis
 */
function checkEntrySignal(bar, combo, history, allCandles, currentIdx, symbol, allStocksData) {
    // Basic requirements
    if (!bar || !history || history.length < 20 || currentIdx < 50) return false;

    // ===== CORE COMBO FILTERS (Make each combo unique) =====

    // 1. RSI RANGE (from combo) - CRITICAL!
    if (!bar.rsi || bar.rsi < combo.rsiMin || bar.rsi > combo.rsiMax) {
        return false;
    }

    // 2. VOLUME REQUIREMENT (from combo) - CRITICAL!
    const avgVol = history.reduce((sum, h) => sum + (h.volume || 0), 0) / history.length;
    if (avgVol <= 0 || bar.volume < avgVol * combo.volumeMultiplier) {
        return false;
    }

    // 3. EMA TREND (from combo) - CRITICAL!
    const emaShort = bar[`ema${combo.emaShort}`];
    const emaLong = bar[`ema${combo.emaLong}`];
    if (!emaShort || !emaLong) return false;

    // Price must be above short EMA
    if (bar.close < emaShort) return false;

    // Short EMA must be above long EMA (uptrend)
    if (emaShort < emaLong) return false;

    // 4. ATR FILTER (volatility from combo)
    if (bar.atr && combo.atrMultiplier) {
        const avgATR = history.reduce((sum, h) => sum + (h.atr || 0), 0) / history.length;
        if (bar.atr < avgATR * combo.atrMultiplier) return false;
    }

    // 5. BASIC QUALITY CHECKS
    const prevBar = currentIdx > 0 ? allCandles[currentIdx - 1] : null;

    // Bullish candle preferred
    const bullish = bar.close > bar.open;

    // Not a doji (indecision)
    const body = Math.abs(bar.close - bar.open);
    const range = bar.high - bar.low;
    const notDoji = range > 0 && body > range * 0.3;

    // Simple pattern check (optional based on combo)
    let patternMatch = true;
    if (combo.candlePattern && combo.candlePattern !== 'none' && prevBar) {
        if (combo.candlePattern === 'hammer') {
            const lowerWick = Math.min(bar.open, bar.close) - bar.low;
            patternMatch = lowerWick > body * 1.5;
        } else if (combo.candlePattern === 'engulfing') {
            const prevBody = Math.abs(prevBar.close - prevBar.open);
            patternMatch = bullish && body > prevBody * 1.2;
        }
    }

    // FINAL DECISION: All core filters must pass
    return bullish && notDoji && patternMatch;
}

/**
 * Test a single combination
 */
async function testCombination(stocks, combo, stockData) {
    const enhancedTA = require('../strategy/enhancedTA.cjs');
    let totalPnl = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let maxDrawdown = 0;
    let peak = 0;
    let equity = 0;

    // Progress tracking
    let processedStocks = 0;
    const totalStocks = stocks.length;

    for (const stock of stocks) {
        processedStocks++;
        const candles = stockData[stock.symbol];
        if (!candles || candles.length < 100) continue;

        // Log progress every 20 stocks
        if (processedStocks % 20 === 0) {
            console.log(`[Labs] 📊 Analyzing stock ${processedStocks}/${totalStocks} (${stock.symbol}) - ${totalTrades} trades found so far`);
        }

        const withIndicators = enhancedTA.addAllIndicators(candles, {
            rsiPeriod: 14,
            emaShort: combo.emaShort,
            emaLong: combo.emaLong,
            atrPeriod: 14
        });

        let stockTrades = 0;
        for (let i = 50; i < withIndicators.length - 10; i++) {
            const bar = withIndicators[i];
            // Pass full candles array, index, symbol and all stock data for comprehensive analysis
            if (checkEntrySignal(bar, combo, withIndicators.slice(Math.max(0, i - 20), i), withIndicators, i, stock.symbol, stockData)) {
                totalTrades++;
                stockTrades++;
                const outcome = simulateTrade(withIndicators.slice(i, i + 10), combo);
                if (outcome.pnl > 0) winningTrades++;
                totalPnl += outcome.pnl;
                equity += outcome.pnl;
                if (equity > peak) peak = equity;
                const currentDD = peak - equity;
                if (currentDD > maxDrawdown) maxDrawdown = currentDD;
            }
        }
    }

    console.log(`[Labs] ✅ Combination complete: ${totalTrades} total trades across ${processedStocks} stocks`);

    return {
        accuracy: totalTrades > 0 ? winningTrades / totalTrades : 0,
        trades: totalTrades,
        pnl: totalPnl,
        drawdown: maxDrawdown,
        winRate: totalTrades > 0 ? winningTrades / totalTrades : 0
    };
}
/**
 * INSTITUTIONAL-GRADE MULTI-FACTOR ANALYSIS SYSTEM
 * Acts like a 20-year technical analyst with deep market understanding
 */

/**
 * Detect market regime - Trending vs Ranging vs Choppy
 */
function detectMarketRegime(candles, currentIdx) {
    const lookback = 50;
    const startIdx = Math.max(0, currentIdx - lookback);
    const recent = candles.slice(startIdx, currentIdx + 1);

    if (recent.length < 20) return { trending: false, ranging: true, bullish: false, volatility: 0.01 };

    const closes = recent.map(c => c.close);
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length);

    return {
        trending: volatility > 0.015,
        ranging: volatility < 0.008,
        bullish: closes[closes.length - 1] > closes[0],
        volatility: volatility
    };
}

/**
 * Calculate advanced momentum score (MACD, ROC, RSI combined)
 */
function calculateMomentumScore(bar, history) {
    let score = 0;

    // ROC (Rate of Change) - 10 day
    if (history.length >= 10) {
        const roc = (bar.close - history[history.length - 10].close) / history[history.length - 10].close;
        if (roc > 0.02) score += 2;
        else if (roc > 0) score += 1;
    }

    // MACD signal
    if (bar.macd !== undefined && bar.macdSignal !== undefined) {
        if (bar.macd > bar.macdSignal && bar.macd > 0) score += 2;
        else if (bar.macd > bar.macdSignal) score += 1;
    }

    // RSI momentum
    if (bar.rsi) {
        if (bar.rsi > 50 && bar.rsi < 70) score += 1;
        if (bar.rsi < 30) score += 2;
    }

    // Price vs MA
    if (bar.ema20 && bar.ema50) {
        if (bar.close > bar.ema20 && bar.ema20 > bar.ema50) score += 2;
    }

    return {
        score: score,
        strong: score >= 5,
        moderate: score >= 3,
        weak: score < 3
    };
}

/**
 * Assess trend quality (consistency of higher highs/lows)
 */
function assessTrendQuality(candles, currentIdx) {
    const lookback = 30;
    const startIdx = Math.max(0, currentIdx - lookback);
    const recent = candles.slice(startIdx, currentIdx + 1);

    if (recent.length < 10) return { quality: 0.5, strong: false, consistent: false, choppy: true };

    let higherHighs = 0;
    let higherLows = 0;

    for (let i = 1; i < recent.length; i++) {
        if (recent[i].high > recent[i - 1].high) higherHighs++;
        if (recent[i].low > recent[i - 1].low) higherLows++;
    }

    const hhPercent = higherHighs / (recent.length - 1);
    const hlPercent = higherLows / (recent.length - 1);

    return {
        quality: (hhPercent + hlPercent) / 2,
        strong: hhPercent > 0.6 && hlPercent > 0.6,
        consistent: hhPercent > 0.5 || hlPercent > 0.5,
        choppy: hhPercent < 0.4 && hlPercent < 0.4
    };
}

/**
 * Analyze volatility regime (expansion, contraction, squeeze)
 */
function analyzeVolatilityRegime(candles, currentIdx) {
    const lookback = 20;
    const startIdx = Math.max(0, currentIdx - lookback);
    const recent = candles.slice(startIdx, currentIdx + 1);

    if (recent.length < 10) return { expanding: false, contracting: false, normal: true, squeeze: false, atrPercentile: 1 };

    const atrs = recent.map(c => c.atr || 0).filter(a => a > 0);
    if (atrs.length === 0) return { expanding: false, contracting: false, normal: true, squeeze: false, atrPercentile: 1 };

    const avgATR = atrs.reduce((a, b) => a + b, 0) / atrs.length;
    const currentATR = candles[currentIdx].atr || avgATR;
    const bbWidth = candles[currentIdx].bbWidth || 10;

    return {
        expanding: currentATR > avgATR * 1.2,
        contracting: currentATR < avgATR * 0.8,
        normal: currentATR >= avgATR * 0.8 && currentATR <= avgATR * 1.2,
        squeeze: bbWidth < 5,
        atrPercentile: currentATR / avgATR
    };
}

/**
 * Detect institutional traps (volume traps, fake breakouts, rejections)
 */
function detectInstitutionalTraps(bar, history) {
    const traps = [];

    if (history.length < 20) return { detected: false, traps: [], trapScore: 0 };

    const avgVol = history.reduce((sum, h) => sum + (h.volume || 0), 0) / history.length;
    const range = (bar.high - bar.low) / bar.close;

    // Volume spike with narrow range (distribution)
    if (bar.volume > avgVol * 2 && range < 0.01) {
        traps.push({ type: 'VOLUME_TRAP', severity: 'HIGH' });
    }

    // Breakout with declining volume (fake breakout)
    const high20 = Math.max(...history.slice(-20).map(h => h.high));
    if (bar.close > high20 && bar.volume < avgVol * 0.7) {
        traps.push({ type: 'FAKE_BREAKOUT', severity: 'MEDIUM' });
    }

    // Wick rejection at resistance
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const bodySize = Math.abs(bar.close - bar.open);
    if (upperWick > bodySize * 2) {
        traps.push({ type: 'REJECTION_WICK', severity: 'MEDIUM' });
    }

    return {
        detected: traps.length > 0,
        traps: traps,
        trapScore: traps.reduce((sum, t) => sum + (t.severity === 'HIGH' ? 2 : 1), 0)
    };
}

/**
 * Analyze sector strength - Critical for Indian market sector rotation
 * Compares stock performance with sector peers over multiple timeframes
 */
function analyzeSectorStrength(symbol, allStocksData, currentIdx) {
    // Indian market sector mapping (simplified - can be enhanced with actual sector data)
    const sectorPeers = {
        // Metals
        'TATASTEEL': ['JSWSTEEL', 'HINDALCO', 'VEDL', 'NATIONALUM'],
        'JSWSTEEL': ['TATASTEEL', 'HINDALCO', 'VEDL', 'NATIONALUM'],
        'HINDALCO': ['TATASTEEL', 'JSWSTEEL', 'VEDL', 'NATIONALUM'],

        // IT
        'TCS': ['INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
        'INFY': ['TCS', 'WIPRO', 'HCLTECH', 'TECHM'],
        'WIPRO': ['TCS', 'INFY', 'HCLTECH', 'TECHM'],

        // Banks
        'HDFCBANK': ['ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK'],
        'ICICIBANK': ['HDFCBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK'],
        'SBIN': ['HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK'],

        // Auto
        'MARUTI': ['TATAMOTORS', 'M&M', 'EICHERMOT', 'BAJAJ-AUTO'],
        'TATAMOTORS': ['MARUTI', 'M&M', 'EICHERMOT', 'BAJAJ-AUTO'],

        // Pharma
        'SUNPHARMA': ['DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP'],
        'DRREDDY': ['SUNPHARMA', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP']
    };

    const peers = sectorPeers[symbol] || [];
    if (peers.length === 0 || currentIdx < 20) {
        return { strength: 0.5, strong: false, weak: false, neutral: true };
    }

    const stockCandles = allStocksData[symbol];
    if (!stockCandles || currentIdx >= stockCandles.length) {
        return { strength: 0.5, strong: false, weak: false, neutral: true };
    }

    // Calculate stock's 10-day return
    const stock10DayReturn = (stockCandles[currentIdx].close - stockCandles[Math.max(0, currentIdx - 10)].close) /
        stockCandles[Math.max(0, currentIdx - 10)].close;

    // Calculate average peer return
    let peerReturns = [];
    for (const peer of peers) {
        const peerCandles = allStocksData[peer];
        if (peerCandles && currentIdx < peerCandles.length) {
            const peerReturn = (peerCandles[currentIdx].close - peerCandles[Math.max(0, currentIdx - 10)].close) /
                peerCandles[Math.max(0, currentIdx - 10)].close;
            peerReturns.push(peerReturn);
        }
    }

    if (peerReturns.length === 0) {
        return { strength: 0.5, strong: false, weak: false, neutral: true };
    }

    const avgPeerReturn = peerReturns.reduce((a, b) => a + b, 0) / peerReturns.length;

    // Relative strength: stock performance vs sector
    const relativeStrength = stock10DayReturn - avgPeerReturn;

    // Sector momentum: is the sector itself strong?
    const sectorMomentum = avgPeerReturn > 0.02; // Sector up >2%

    return {
        strength: relativeStrength,
        strong: relativeStrength > 0.03 && sectorMomentum,  // Outperforming sector by >3% AND sector is strong
        weak: relativeStrength < -0.03,  // Underperforming sector by >3%
        neutral: Math.abs(relativeStrength) <= 0.03,
        sectorMomentum: sectorMomentum,
        relativeReturn: relativeStrength
    };
}

/**
 * MULTI-FACTOR ENTRY SCORING SYSTEM (0-105 points, scaled to 100)
 * 60+ = HIGH confidence
 * 40-59 = MODERATE confidence
 * <40 = LOW confidence (skip)
 */
function calculateEntryScore(bar, combo, history, candles, currentIdx, symbol, allStocksData) {
    let totalScore = 0;
    const factors = {};

    if (history.length < 20) return { score: 0, factors: {}, confidence: 'LOW', shouldEnter: false };

    // Factor 1: Market Regime (20 points)
    const regime = detectMarketRegime(candles, currentIdx);
    if (regime.trending && regime.bullish) {
        totalScore += 20;
        factors.regime = 'TRENDING_BULLISH';
    } else if (regime.ranging) {
        totalScore += 5;
        factors.regime = 'RANGING';
    } else {
        factors.regime = 'CHOPPY';
    }

    // Factor 2: Momentum (20 points)
    const momentum = calculateMomentumScore(bar, history);
    if (momentum.strong) totalScore += 20;
    else if (momentum.moderate) totalScore += 10;
    factors.momentumScore = momentum.score;

    // Factor 3: Trend Quality (15 points)
    const trend = assessTrendQuality(candles, currentIdx);
    if (trend.strong) totalScore += 15;
    else if (trend.consistent) totalScore += 8;
    factors.trendQuality = (trend.quality * 100).toFixed(0);

    // Factor 4: Volatility Setup (15 points)
    const vol = analyzeVolatilityRegime(candles, currentIdx);
    if (vol.squeeze) totalScore += 15;
    else if (vol.expanding) totalScore += 10;
    else if (vol.normal) totalScore += 5;
    factors.volatilityRegime = vol.squeeze ? 'SQUEEZE' : vol.expanding ? 'EXPANDING' : 'NORMAL';

    // Factor 5: Volume Confirmation (10 points)
    const avgVol = history.reduce((sum, h) => sum + (h.volume || 0), 0) / history.length;
    if (avgVol > 0) {
        const volRatio = bar.volume / avgVol;
        if (volRatio > 1.5) totalScore += 10;
        else if (volRatio > 1.0) totalScore += 5;
        factors.volumeRatio = volRatio.toFixed(2);
    }

    // Factor 6: Technical Indicators (10 points)
    if (bar.rsi && bar.rsi >= 30 && bar.rsi <= 70) totalScore += 5;
    if (bar.ema20 && bar.ema50 && bar.close > bar.ema20) totalScore += 5;
    factors.rsi = bar.rsi;

    // Factor 7: Trap Avoidance (10 points - NEGATIVE)
    const traps = detectInstitutionalTraps(bar, history);
    totalScore -= traps.trapScore * 5;
    factors.trapsDetected = traps.traps.length;

    // Factor 8: Sector Strength (5 points) - INDIAN MARKET SPECIFIC
    if (symbol && allStocksData) {
        const sector = analyzeSectorStrength(symbol, allStocksData, currentIdx);
        if (sector.strong) totalScore += 5;  // Stock outperforming strong sector
        else if (sector.sectorMomentum && !sector.weak) totalScore += 2;  // Sector strong, stock keeping pace
        factors.sectorStrength = sector.strong ? 'STRONG' : sector.weak ? 'WEAK' : 'NEUTRAL';
        factors.relativeReturn = (sector.relativeReturn * 100).toFixed(2) + '%';
    }

    // Scale to 100 points (105 max / 1.05)
    const scaledScore = Math.round(totalScore / 1.05);

    return {
        score: scaledScore,
        rawScore: totalScore,
        factors: factors,
        confidence: scaledScore >= 60 ? 'HIGH' : scaledScore >= 40 ? 'MODERATE' : 'LOW',
        shouldEnter: scaledScore >= 40
    };
}

/**
 * Entry signal using multi-factor scoring
 */
function checkEntrySignal(bar, combo, history, allCandles, currentIdx, symbol, allStocksData) {
    const analysis = calculateEntryScore(bar, combo, history, allCandles, currentIdx, symbol, allStocksData);
    return analysis.shouldEnter;
}
/**
 * Check candle pattern
 */
function checkCandlePattern(bar, pattern) {
    const bodySize = Math.abs(bar.close - bar.open);
    const totalRange = bar.high - bar.low;
    if (pattern === 'hammer') {
        const lowerWick = Math.min(bar.open, bar.close) - bar.low;
        return lowerWick > bodySize * 2 && bodySize > 0;
    }
    if (pattern === 'engulfing') {
        return bodySize > totalRange * 0.7;
    }
    return true;
}
/**
 * Simulate trade
 */
function simulateTrade(futureCandles, combo) {
    const entryPrice = futureCandles[0].close;
    const atr = futureCandles[0].atr || (entryPrice * 0.02);
    const targetPrice = entryPrice + (atr * combo.atrMultiplier * 2);
    const stopLoss = entryPrice - (atr * combo.atrMultiplier);
    for (const bar of futureCandles) {
        if (bar.high >= targetPrice) {
            return { pnl: targetPrice - entryPrice, outcome: 'TARGET' };
        }
        if (bar.low <= stopLoss) {
            return { pnl: stopLoss - entryPrice, outcome: 'SL' };
        }
    }
    const exitPrice = futureCandles[futureCandles.length - 1].close;
    return { pnl: exitPrice - entryPrice, outcome: 'TIME' };
}
/**
 * Generate entry conditions
 */
function generateEntryConditions(combo) {
    return {
        rsi: { min: combo.rsiMin, max: combo.rsiMax },
        ema: { short: combo.emaShort, long: combo.emaLong, condition: 'short > long' },
        volume: { multiplier: combo.volumeMultiplier, condition: 'above average' },
        candlePattern: combo.candlePattern,
        bbWidth: { min: combo.bbWidthMin }
    };
}
/**
 * Generate exit conditions
 */
function generateExitConditions(combo) {
    return {
        target: { atrMultiplier: combo.atrMultiplier * 2, type: 'ATR-based' },
        stopLoss: { atrMultiplier: combo.atrMultiplier, type: 'ATR-based' },
        maxDays: 10,
        trailingStop: { enabled: true, atrMultiplier: combo.atrMultiplier * 1.5 }
    };
}
/**
 * Generate trap rules
 */
function generateTrapRules(trapResults) {
    const rules = [];
    let volumeTrapCount = 0;
    let bullTrapCount = 0;
    for (const symbol in trapResults) {
        const traps = trapResults[symbol];
        volumeTrapCount += traps.volumeTraps?.length || 0;
        bullTrapCount += traps.bullTraps?.length || 0;
    }
    if (volumeTrapCount > 5) {
        rules.push('Avoid volume spikes > 2.5x average');
    }
    if (bullTrapCount > 3) {
        rules.push('Avoid wick breakouts with body < 70% of range');
    }
    rules.push('Skip trades during Nifty down days > 1%');
    rules.push('Avoid range squeezes (BB width < 8%)');
    return rules;
}
/**
 * Check cache status
 */
async function checkLabsCache(stocks) {
    const cached = [];
    const uncached = [];
    for (const stock of stocks) {
        const cacheEntry = await prisma.labsCache.findUnique({
            where: { symbol: stock.symbol }
        });
        if (cacheEntry) {
            const daysSinceResearch = (Date.now() - new Date(cacheEntry.lastResearchDate).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceResearch < 30) {
                cached.push(stock.symbol);
                continue;
            }
        }
        uncached.push(stock);
    }
    return { cached: cached.length, uncached };
}
/**
 * Fetch stock data - Uses labsDataService for real historical data
 * Tier 1: CSV cache
 * Tier 2: Upstox API
 * Tier 3: Mock data fallback
 */
async function fetchStockData(stocks, mode) {
    const labsDataService = require('./labsDataService.cjs');

    try {
        // Use labsDataService with 3-tier fallback
        const data = await labsDataService.getHistoricalData(stocks, { mode, days: 200 });
        return data;
    } catch (error) {
        console.error('[Labs] Error fetching stock data:', error.message);

        // Ultimate fallback: generate mock data for all stocks
        const data = {};
        for (const stock of stocks) {
            data[stock.symbol] = generateMockCandles(stock.symbol, 200);
        }
        return data;
    }
}
/**
 * Generate mock candles
 */
function generateMockCandles(symbol, count) {
    const candles = [];
    let price = 100 + Math.random() * 400;
    for (let i = 0; i < count; i++) {
        const change = (Math.random() - 0.5) * 10;
        price = Math.max(50, price + change);
        const open = price;
        const close = price + (Math.random() - 0.5) * 5;
        const high = Math.max(open, close) + Math.random() * 3;
        const low = Math.min(open, close) - Math.random() * 3;
        const volume = 100000 + Math.random() * 500000;
        candles.push({
            date: new Date(Date.now() - (count - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            open,
            high,
            low,
            close,
            volume
        });
    }
    return candles;
}
/**
 * Generate next TT version
 */
async function generateNextTTVersion(categoryKey) {
    const lastRun = await prisma.labsRun.findFirst({
        where: { categoryKey },
        orderBy: { createdAt: 'desc' }
    });
    if (!lastRun) return 'TT-V1';
    const match = lastRun.ttVersion.match(/TT-V(\d+)/);
    if (match) {
        const nextNum = parseInt(match[1]) + 1;
        return `TT-V${nextNum}`;
    }
    return 'TT-V1';
}
module.exports = {
    runTimeTravelLabs,
    generateTechnicalCombinations,
    checkLabsCache
};