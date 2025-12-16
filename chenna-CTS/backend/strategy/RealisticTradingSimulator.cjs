/**
 * Realistic Trading Simulator - TIME-FORWARD REPLAY VERSION
 * 
 * KEY FIX: This version replays the market candle-by-candle, day-by-day.
 * Each state transition happens on a DIFFERENT trading day.
 * Signal Day ≠ Entry Day ≠ Exit Day
 * 
 * Simulates a real trading desk environment with:
 * 1. Stock Age Awareness - 10 days for swing, same day for intraday
 * 2. Signal → Entry Delay - Waits actual candles during delay
 * 3. Trade Lifecycle States - Transitions happen on different days
 * 4. Partial Exit & Trailing - Occurs on later candles, not same date
 * 5. Missed Trades Tracking - All non-executed signals
 * 6. Full Transparency - Every decision logged with reason
 */

const TechnicalAnalysis = require('./comprehensiveTA.cjs');
const { CategoryFilteredCatalogue } = require('./categoryFilteredCatalogue.cjs');
const { ShadowLearner } = require('./ShadowLearner.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Trade Lifecycle States
const TradeState = {
    WATCHING: 'WATCHING',
    SIGNAL_FORMING: 'SIGNAL_FORMING',
    SIGNAL_CONFIRMED: 'SIGNAL_CONFIRMED',
    WAITING_TO_ENTER: 'WAITING_TO_ENTER',
    ENTERED: 'ENTERED',
    PARTIAL_EXIT: 'PARTIAL_EXIT',
    TRAILING: 'TRAILING',
    FULL_EXIT: 'FULL_EXIT',
    STOPPED_OUT: 'STOPPED_OUT',
    INVALIDATED: 'INVALIDATED',
    EXPIRED: 'EXPIRED',
    TRAPPED: 'TRAPPED'
};

// Trade Outcome Categories
const TradeOutcome = {
    EXECUTED: 'EXECUTED',
    INVALIDATED: 'INVALIDATED',
    MISSED: 'MISSED',
    EXPIRED: 'EXPIRED',
    TRAPPED: 'TRAPPED'
};

class RealisticTradingSimulator {
    constructor(options = {}) {
        this.config = {
            swingValidityDays: options.swingValidityDays || 10,
            intradayValidityDays: options.intradayValidityDays || 0,
            swingDelayCandles: options.swingDelayCandles || 1, // Wait 1 candle after signal (next day for daily)
            intradayDelayCandles: options.intradayDelayCandles || 1,
            partialExitPercent: options.partialExitPercent || 80,
            trailingPositionPercent: options.trailingPositionPercent || 20,
            maxTrailDays: options.maxTrailDays || 5,
            trailingStepPercent: options.trailingStepPercent || 0.5,
            backtestMode: options.backtestMode || false,

            // ============================================
            // RESEARCH MODE: 2-Pass Comparison Config
            // ============================================
            researchPass: options.researchPass || null,
            applyRefinements: options.applyRefinements || false,
            shadowSuggestions: options.shadowSuggestions || []
        };
        // ============================================
        // RESEARCH MODE: Both passes run IDENTICAL logic
        // ============================================
        // CRITICAL INSIGHT from 20+ year senior trader:
        // "You cannot predict which trades will fail BEFORE they fail."
        // 
        // Any automatic filter applied in Pass 2 is EITHER:
        // 1. Random (filters both winners and losers equally) - useless
        // 2. Overfitting (uses future knowledge we don't have) - cheating
        //
        // THE CORRECT APPROACH:
        // - Pass 1: Run pure strategy, record results
        // - Shadow: OBSERVE failure patterns, generate SUGGESTIONS
        // - Pass 2: Run IDENTICAL logic (sanity check for consistency)
        // - Human: Review suggestions, decide what to implement
        // - Manual: Update strategy code based on insights
        // - Promote: Create V1.b1 with manual changes
        // - Test: Run fresh backtest on V1.b1 to see real improvement
        //
        // Pure data, pure execution. You cannot force accuracy.
        this.refinementConfig = null; // No automatic filtering

        if (this.config.researchPass === 1) {
            console.log('📋 [PASS 1] Running ORIGINAL logic (baseline)');
        } else if (this.config.researchPass === 2) {
            console.log('📋 [PASS 2] Running IDENTICAL logic (consistency check)');
            console.log('   NOTE: No automatic filtering. Shadow provides SUGGESTIONS only.');
            console.log('   To see improvement: Implement suggestions manually → Promote → Re-run');
        }

        this.executedTrades = [];
        this.invalidatedSignals = [];
        this.missedEntries = [];
        this.expiredStocks = [];
        this.trappedSignals = [];
        this.skippedSignals = [];  // Signals skipped due to symbol lock
        this.logs = [];
    }

    log(symbol, event, reason, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            symbol, event, reason, ...details
        };
        this.logs.push(entry);
        console.log(`📋 [${symbol}] ${event}: ${reason}`);
    }

    // ============================================
    // PROFESSIONAL TRADE QUALITY FILTERS
    // ============================================

    /**
     * Calculate Average True Range (ATR) for volatility-adjusted stops
     */
    calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return null;

        let atrSum = 0;
        for (let i = candles.length - period; i < candles.length; i++) {
            const current = candles[i];
            const prev = candles[i - 1];
            const tr = Math.max(
                current.high - current.low,
                Math.abs(current.high - prev.close),
                Math.abs(current.low - prev.close)
            );
            atrSum += tr;
        }
        return atrSum / period;
    }

    /**
     * Check if price is near a support level (structural confirmation)
     */
    isNearSupport(candles, currentPrice) {
        const lookback = Math.min(20, candles.length - 1);
        const recentCandles = candles.slice(-lookback);

        // Find recent swing lows
        const lows = recentCandles.map(c => c.low);
        const minLow = Math.min(...lows);
        const avgLow = lows.reduce((a, b) => a + b, 0) / lows.length;

        // Price should be within 3% of recent lows (near support)
        const nearMinLow = currentPrice <= minLow * 1.03;
        const nearAvgLow = currentPrice <= avgLow * 1.02;

        // Calculate 20 SMA as dynamic support
        const closes = recentCandles.map(c => c.close);
        const sma20 = closes.reduce((a, b) => a + b, 0) / closes.length;
        const nearSma = currentPrice <= sma20 * 1.02;

        return { nearSupport: nearMinLow || nearAvgLow || nearSma, minLow, sma20 };
    }

    /**
     * Check trend alignment - avoid trades against strong momentum
     */
    checkTrendAlignment(candles) {
        const last5 = candles.slice(-5);
        const last10 = candles.slice(-10);
        const last20 = candles.slice(-20);

        // Calculate short-term trend
        const shortTrend = (last5[last5.length - 1].close - last5[0].close) / last5[0].close * 100;

        // Count lower lows in last 5 candles (downtrend strength)
        let lowerLows = 0;
        for (let i = 1; i < last5.length; i++) {
            if (last5[i].low < last5[i - 1].low) lowerLows++;
        }

        // Check if recent candles are closing near lows (bearish momentum)
        const closingNearLows = last5.filter(c => {
            const range = c.high - c.low;
            if (range === 0) return false;
            const closePosition = (c.close - c.low) / range;
            return closePosition < 0.3; // Closing in lower 30%
        }).length;

        // Calculate momentum - compare last 3 vs prior 3 average ranges
        const last3Ranges = last5.slice(-3).map(c => c.high - c.low);
        const prior3Ranges = last5.slice(0, 3).map(c => c.high - c.low);
        const avgLast3 = last3Ranges.reduce((a, b) => a + b, 0) / 3;
        const avgPrior3 = prior3Ranges.reduce((a, b) => a + b, 0) / 3;
        const momentumIncreasing = avgLast3 > avgPrior3 * 1.3; // 30% larger bars

        // Strong downtrend signals to avoid
        const strongDowntrend = shortTrend < -5 && lowerLows >= 3;
        const bearishMomentum = closingNearLows >= 3 && momentumIncreasing;

        return {
            aligned: !strongDowntrend && !bearishMomentum,
            shortTrend,
            lowerLows,
            closingNearLows,
            reason: strongDowntrend ? 'Strong downtrend detected' :
                bearishMomentum ? 'Bearish momentum increasing' : null
        };
    }

    /**
     * Check for price stabilization (not just exhaustion signal)
     */
    checkPriceStabilization(candles) {
        const last3 = candles.slice(-3);
        const last5 = candles.slice(-5);

        // Find the lowest low in last 5 candles
        const lowestLow = Math.min(...last5.map(c => c.low));

        // Check if last 2 candles are holding above the lowest low
        const holdingAboveLow = last3.slice(-2).every(c => c.low >= lowestLow * 0.995);

        // Check if any candle closed in upper half of its range
        const hasUpperRangeClose = last3.some(c => {
            const range = c.high - c.low;
            if (range === 0) return false;
            const closePosition = (c.close - c.low) / range;
            return closePosition > 0.5;
        });

        // Check for volume declining on down moves (exhaustion confirmation)
        let volumeDeclining = false;
        if (last5.length >= 5) {
            const downCandles = last5.filter(c => c.close < c.open);
            if (downCandles.length >= 2) {
                // Sort by time (most recent last)
                const sortedDown = downCandles.slice().sort((a, b) =>
                    new Date(a.timestamp) - new Date(b.timestamp));
                if (sortedDown.length >= 2) {
                    const recentVol = sortedDown[sortedDown.length - 1].volume;
                    const priorVol = sortedDown[0].volume;
                    volumeDeclining = recentVol < priorVol * 0.8; // 20%+ decline
                }
            }
        }

        return {
            stabilized: holdingAboveLow && hasUpperRangeClose,
            holdingAboveLow,
            hasUpperRangeClose,
            volumeDeclining
        };
    }

    /**
     * Enhanced entry delay validation - acts as FILTER not just time gap
     */
    validateEntryWithStructure(signalPrice, delayCandle, stopPrice, candles) {
        // Basic stop check
        if (delayCandle.low <= stopPrice) {
            return {
                valid: false,
                reason: `Price dropped to ${delayCandle.low.toFixed(2)} during delay, below stop ${stopPrice.toFixed(2)}`
            };
        }

        // Gap down check (> 2% gap = danger)
        const gapPercent = ((signalPrice - delayCandle.open) / signalPrice) * 100;
        if (gapPercent > 2) {
            return {
                valid: false,
                reason: `Gap down ${gapPercent.toFixed(2)}% - market rejecting level`
            };
        }

        // NEW: Check if delay candle shows further weakness
        const range = delayCandle.high - delayCandle.low;
        if (range > 0) {
            const closePosition = (delayCandle.close - delayCandle.low) / range;
            // If closing in lower 25% of range = weakness continuing
            if (closePosition < 0.25 && delayCandle.close < signalPrice) {
                return {
                    valid: false,
                    reason: `Delay candle closing weak (${(closePosition * 100).toFixed(0)}% of range) - momentum continues`
                };
            }
        }

        // NEW: Check if delay candle made new low vs signal candle
        const signalCandle = candles[candles.length - 2]; // Previous candle was signal
        if (delayCandle.low < signalCandle.low * 0.99) { // 1% lower = new low
            return {
                valid: false,
                reason: 'New low made during delay - trend not reversing'
            };
        }

        return { valid: true, entryPrice: delayCandle.close };
    }

    /**
     * Calculate ATR-based stop that adapts to volatility
     */
    calculateVolatilityAdjustedStop(entryPrice, candles, baseStopPercent, multiplier = 1.5) {
        const atr = this.calculateATR(candles);
        if (!atr) return entryPrice * (1 - baseStopPercent / 100);

        const atrStopDistance = atr * multiplier;
        const atrStop = entryPrice - atrStopDistance;
        const fixedStop = entryPrice * (1 - baseStopPercent / 100);

        // Use the WIDER of the two stops (give trade more room)
        return Math.min(atrStop, fixedStop);
    }

    /**
     * Master quality check - combines all filters
     */
    meetsTradeQualityStandards(candles, signalPrice, indicators) {
        const reasons = [];
        let score = 0;
        const maxScore = 4;

        // 1. Structural confirmation - near support?
        const support = this.isNearSupport(candles, signalPrice);
        if (support.nearSupport) {
            score += 1;
        } else {
            reasons.push('Not near support level');
        }

        // 2. Trend alignment - not fighting strong momentum?
        const trend = this.checkTrendAlignment(candles);
        if (trend.aligned) {
            score += 1;
        } else {
            reasons.push(trend.reason);
        }

        // 3. Price stabilization - showing acceptance?
        const stability = this.checkPriceStabilization(candles);
        if (stability.stabilized) {
            score += 1;
        } else {
            reasons.push('No price stabilization yet');
        }

        // 4. Volume confirmation
        if (stability.volumeDeclining) {
            score += 1;
        }

        // Require at least 2 out of 4 confirmations
        const passesQuality = score >= 2;

        return {
            passes: passesQuality,
            score,
            maxScore,
            reasons: passesQuality ? [] : reasons
        };
    }


    /**
     * ============================================
     * SYMBOL-LEVEL LOCKING: One trade per stock at a time
     * ============================================
     * 
     * Tests ALL strategies together. If multiple strategies signal on the same day,
     * only the FIRST one wins. No new signals while a trade is active.
     */
    async simulateStockWithSymbolLock(stock, strategies, candles, categoryKey, startIndex = 50) {
        const trades = [];
        const invalidated = [];
        const skipped = [];

        // Current trade state for THIS STOCK (symbol lock)
        let activeTradeState = null;
        let cooldownUntilCandle = 0;  // After trade exit, wait before new signal

        // Process each candle as "today"
        for (let today = startIndex; today < candles.length; today++) {
            const todayCandle = candles[today];
            const todayDate = todayCandle.timestamp;
            const availableHistory = candles.slice(0, today + 1);

            const indicators = TechnicalAnalysis.getMarketContext(availableHistory);
            if (!indicators) continue;

            this.addExhaustionIndicators(indicators, availableHistory);

            // ======== SYMBOL LOCK CHECK ========
            if (activeTradeState) {
                // Stock is in active trade - process that trade, skip all new signals
                const tradeResult = this.processActiveTradeDay(
                    activeTradeState, today, todayCandle, todayDate, candles
                );

                if (tradeResult.completed) {
                    // Trade finished - collect result and release lock
                    if (tradeResult.trade) trades.push(tradeResult.trade);
                    if (tradeResult.invalidated) invalidated.push(tradeResult.invalidated);
                    activeTradeState = null;
                    cooldownUntilCandle = today + 1;  // 1 day cooldown after exit

                    this.log(stock.symbol, 'SYMBOL_UNLOCKED',
                        `Trade completed on ${todayDate}, symbol now available`);
                }
            } else if (today >= cooldownUntilCandle) {
                // Symbol is free - check all strategies for signals
                // FIRST strategy to signal AND pass quality filters wins
                for (const strategy of strategies) {
                    let hasSignal = false;
                    try {
                        hasSignal = strategy.entry(indicators, availableHistory);
                    } catch (e) {
                        continue;
                    }

                    if (hasSignal) {
                        // ======== PROFESSIONAL QUALITY FILTER ========
                        // Strategy signals, but we need structural confirmation
                        const qualityCheck = this.meetsTradeQualityStandards(
                            availableHistory,
                            todayCandle.close,
                            indicators
                        );

                        if (!qualityCheck.passes) {
                            // Signal rejected due to poor market structure
                            skipped.push({
                                symbol: stock.symbol,
                                strategy: strategy.name,
                                date: todayDate,
                                price: todayCandle.close,
                                reason: `Quality filter failed (${qualityCheck.score}/${qualityCheck.maxScore}): ${qualityCheck.reasons.join(', ')}`
                            });

                            this.log(stock.symbol, 'QUALITY_FILTER_REJECT',
                                `${strategy.name} signal rejected: ${qualityCheck.reasons.join(', ')}`);

                            continue; // Try next strategy
                        }

                        // Calculate volatility-adjusted stop (give trade room to breathe)
                        const atrStop = this.calculateVolatilityAdjustedStop(
                            todayCandle.close,
                            availableHistory,
                            strategy.exit.stop,
                            1.5 // 1.5x ATR
                        );

                        // Use the wider stop (more room)
                        const fixedStop = todayCandle.close * (1 - strategy.exit.stop / 100);
                        const effectiveStop = Math.min(atrStop, fixedStop);

                        // Quality passed - LOCK THE SYMBOL
                        activeTradeState = {
                            state: TradeState.SIGNAL_CONFIRMED,
                            symbol: stock.symbol,
                            strategy: strategy.name,
                            signalDate: todayDate,
                            signalPrice: todayCandle.close,
                            signalCandleIndex: today,
                            waitingUntilCandle: today + this.config.swingDelayCandles,
                            targetPercent: strategy.exit.target,
                            stopPercent: strategy.exit.stop,
                            targetPrice: todayCandle.close * (1 + strategy.exit.target / 100),
                            stopPrice: effectiveStop, // Now volatility-adjusted!
                            secondTargetPrice: todayCandle.close * (1 + (strategy.exit.target * 1.5) / 100),
                            qualityScore: qualityCheck.score,
                            stateHistory: [
                                { state: TradeState.WATCHING, date: todayDate, reason: 'Monitoring stock' },
                                {
                                    state: TradeState.SIGNAL_CONFIRMED, date: todayDate, price: todayCandle.close,
                                    reason: `Entry conditions met (Quality: ${qualityCheck.score}/${qualityCheck.maxScore})`
                                }
                            ]
                        };

                        this.log(stock.symbol, 'QUALITY_SIGNAL_ACCEPTED',
                            `${strategy.name} signal PASSED quality (${qualityCheck.score}/${qualityCheck.maxScore}), stop at ${effectiveStop.toFixed(2)}`);

                        // Log any other strategies that would have signaled (skipped due to lock)
                        for (const otherStrategy of strategies) {
                            if (otherStrategy.name !== strategy.name) {
                                try {
                                    if (otherStrategy.entry(indicators, availableHistory)) {
                                        skipped.push({
                                            symbol: stock.symbol,
                                            strategy: otherStrategy.name,
                                            date: todayDate,
                                            reason: `Symbol locked by ${strategy.name}`
                                        });
                                    }
                                } catch (e) { }
                            }
                        }

                        break;  // First strategy wins, stop checking others
                    }
                }
            }
        }

        return { trades, invalidated, skipped };
    }

    /**
     * Process a single day for an active trade
     */
    processActiveTradeDay(state, today, todayCandle, todayDate, candles) {
        // STATE: SIGNAL_CONFIRMED (waiting for delay)
        if (state.state === TradeState.SIGNAL_CONFIRMED) {
            if (today >= state.waitingUntilCandle) {
                // Delay period complete - validate entry with ENHANCED structural filter
                const availableHistory = candles.slice(0, today + 1);
                const entryValidation = this.validateEntryWithStructure(
                    state.signalPrice, todayCandle, state.stopPrice, availableHistory
                );

                if (!entryValidation.valid) {
                    // Entry INVALIDATED by structural filter
                    state.stateHistory.push({
                        state: TradeState.INVALIDATED,
                        date: todayDate,
                        reason: entryValidation.reason
                    });

                    return {
                        completed: true,
                        invalidated: {
                            symbol: state.symbol,
                            strategy: state.strategy,
                            signalDate: state.signalDate,
                            signalPrice: state.signalPrice,
                            invalidationDate: todayDate,
                            invalidationReason: entryValidation.reason,
                            lifecycle: state.stateHistory
                        }
                    };
                } else {
                    // ============================================
                    // PASS 2 REFINEMENT CHECKS (if enabled)
                    // ============================================
                    if (this.refinementConfig) {
                        // Check 1: Price Confirmation - close should be X% above signal price
                        if (this.refinementConfig.requirePriceConfirmation) {
                            const threshold = this.refinementConfig.priceConfirmationThreshold || 0.003;
                            const minConfirmPrice = state.signalPrice * (1 + threshold);

                            if (todayCandle.close < minConfirmPrice) {
                                this.log(state.symbol, 'PASS2_FILTER', 'Price not confirmed above signal', {
                                    signalPrice: state.signalPrice,
                                    closePrice: todayCandle.close,
                                    requiredMin: minConfirmPrice.toFixed(2)
                                });
                                state.stateHistory.push({
                                    state: TradeState.INVALIDATED,
                                    date: todayDate,
                                    reason: 'Refinement: Price confirmation failed'
                                });
                                return {
                                    completed: true,
                                    invalidated: {
                                        symbol: state.symbol,
                                        strategy: state.strategy,
                                        signalDate: state.signalDate,
                                        signalPrice: state.signalPrice,
                                        invalidationDate: todayDate,
                                        invalidationReason: 'Refinement: Price confirmation failed',
                                        lifecycle: state.stateHistory
                                    }
                                };
                            }
                        }

                        // Check 2: Candle Strength - close should be in upper portion of range
                        if (this.refinementConfig.minCandleStrength) {
                            const candleRange = todayCandle.high - todayCandle.low;
                            const closePosition = candleRange > 0
                                ? (todayCandle.close - todayCandle.low) / candleRange
                                : 0.5;

                            if (closePosition < this.refinementConfig.minCandleStrength) {
                                this.log(state.symbol, 'PASS2_FILTER', 'Weak candle structure', {
                                    closePosition: closePosition.toFixed(2),
                                    required: this.refinementConfig.minCandleStrength
                                });
                                state.stateHistory.push({
                                    state: TradeState.INVALIDATED,
                                    date: todayDate,
                                    reason: 'Refinement: Weak candle structure'
                                });
                                return {
                                    completed: true,
                                    invalidated: {
                                        symbol: state.symbol,
                                        strategy: state.strategy,
                                        signalDate: state.signalDate,
                                        signalPrice: state.signalPrice,
                                        invalidationDate: todayDate,
                                        invalidationReason: 'Refinement: Weak candle structure',
                                        lifecycle: state.stateHistory
                                    }
                                };
                            }
                        }

                        // Check 3: Skip Weak Bounces - today's low should not be too far below signal price
                        if (this.refinementConfig.skipWeakBounces) {
                            const threshold = this.refinementConfig.weakBounceThreshold || 0.985;
                            const bounceStrength = todayCandle.low / state.signalPrice;
                            if (bounceStrength < threshold) {
                                this.log(state.symbol, 'PASS2_FILTER', 'Weak bounce detected', {
                                    signalPrice: state.signalPrice,
                                    todayLow: todayCandle.low,
                                    bounceStrength: bounceStrength.toFixed(3),
                                    minRequired: threshold
                                });
                                state.stateHistory.push({
                                    state: TradeState.INVALIDATED,
                                    date: todayDate,
                                    reason: 'Refinement: Weak bounce'
                                });
                                return {
                                    completed: true,
                                    invalidated: {
                                        symbol: state.symbol,
                                        strategy: state.strategy,
                                        signalDate: state.signalDate,
                                        signalPrice: state.signalPrice,
                                        invalidationDate: todayDate,
                                        invalidationReason: 'Refinement: Weak bounce',
                                        lifecycle: state.stateHistory
                                    }
                                };
                            }
                        }
                    }

                    // Entry EXECUTED - update state
                    state.state = TradeState.ENTERED;
                    state.entryDate = todayDate;
                    state.entryPrice = entryValidation.entryPrice;
                    state.entryCandleIndex = today;
                    state.highestPriceSinceEntry = state.entryPrice;
                    state.partialExitDone = false;

                    // Recalculate ATR-based stop on actual entry price
                    const atrStop = this.calculateVolatilityAdjustedStop(
                        state.entryPrice, availableHistory, state.stopPercent, 1.5
                    );
                    const fixedStop = state.entryPrice * (1 - state.stopPercent / 100);

                    // Recalculate targets based on actual entry price
                    state.targetPrice = state.entryPrice * (1 + state.targetPercent / 100);
                    state.stopPrice = Math.min(atrStop, fixedStop); // Wider stop
                    state.secondTargetPrice = state.entryPrice * (1 + (state.targetPercent * 1.5) / 100);

                    state.stateHistory.push({
                        state: TradeState.WAITING_TO_ENTER,
                        date: state.signalDate,
                        reason: 'Delay period started'
                    });
                    state.stateHistory.push({
                        state: TradeState.ENTERED,
                        date: todayDate,
                        price: state.entryPrice,
                        reason: 'Entry validated and executed'
                    });

                    this.log(state.symbol, 'ENTRY_EXECUTED',
                        `Signal ${state.signalDate} → Entry ${todayDate} @ ${state.entryPrice.toFixed(2)}`);
                }
            }
            return { completed: false };
        }

        // STATE: ENTERED (before partial exit)
        if (state.state === TradeState.ENTERED) {
            state.highestPriceSinceEntry = Math.max(state.highestPriceSinceEntry, todayCandle.high);

            // Check STOP first
            if (todayCandle.low <= state.stopPrice) {
                state.stateHistory.push({
                    state: TradeState.STOPPED_OUT,
                    date: todayDate,
                    price: state.stopPrice,
                    pnl: -state.stopPercent,
                    reason: 'Stop loss hit'
                });

                const holdingDays = today - state.entryCandleIndex;
                return {
                    completed: true,
                    trade: this.buildTradeRecord(state, todayDate, state.stopPrice,
                        -state.stopPercent, holdingDays, 'STOP', 'LOSS')
                };
            }

            // Check TARGET (partial exit)
            if (todayCandle.high >= state.targetPrice) {
                state.state = TradeState.TRAILING;
                state.partialExitDone = true;
                state.partialExitDate = todayDate;
                state.partialExitPrice = state.targetPrice;
                state.partialPnl = state.targetPercent * (this.config.partialExitPercent / 100);
                state.trailingStopPrice = state.entryPrice;  // Breakeven
                state.trailStartCandle = today;

                state.stateHistory.push({
                    state: TradeState.PARTIAL_EXIT,
                    date: todayDate,
                    price: state.targetPrice,
                    pnl: state.partialPnl,
                    reason: `80% booked at target`
                });
                state.stateHistory.push({
                    state: TradeState.TRAILING,
                    date: todayDate,
                    reason: 'Trailing remaining 20%'
                });

                this.log(state.symbol, 'PARTIAL_EXIT',
                    `Entry ${state.entryDate} → 80% booked ${todayDate} @ ${state.targetPrice.toFixed(2)}`);
            }
            return { completed: false };
        }

        // STATE: TRAILING (20% position)
        if (state.state === TradeState.TRAILING) {
            state.highestPriceSinceEntry = Math.max(state.highestPriceSinceEntry, todayCandle.high);

            // Update trailing stop
            const newTrailingStop = state.highestPriceSinceEntry * (1 - this.config.trailingStepPercent / 100);
            state.trailingStopPrice = Math.max(state.trailingStopPrice, newTrailingStop);

            const daysSinceTrailStart = today - state.trailStartCandle;

            // Check SECOND TARGET
            if (todayCandle.high >= state.secondTargetPrice) {
                const trailingPnl = (state.targetPercent * 1.5) * (this.config.trailingPositionPercent / 100);
                const totalPnl = state.partialPnl + trailingPnl;

                state.stateHistory.push({
                    state: TradeState.FULL_EXIT,
                    date: todayDate,
                    price: state.secondTargetPrice,
                    pnl: trailingPnl,
                    reason: 'Second target hit'
                });

                const holdingDays = today - state.entryCandleIndex;
                return {
                    completed: true,
                    trade: this.buildTradeRecord(state, todayDate, state.secondTargetPrice,
                        totalPnl, holdingDays, 'SECOND_TARGET', 'WIN')
                };
            }

            // Check TRAILING STOP
            if (todayCandle.low <= state.trailingStopPrice) {
                const trailingPnl = ((state.trailingStopPrice - state.entryPrice) / state.entryPrice * 100)
                    * (this.config.trailingPositionPercent / 100);
                const totalPnl = state.partialPnl + trailingPnl;

                state.stateHistory.push({
                    state: TradeState.FULL_EXIT,
                    date: todayDate,
                    price: state.trailingStopPrice,
                    pnl: trailingPnl,
                    reason: 'Trailing stop hit'
                });

                const holdingDays = today - state.entryCandleIndex;
                return {
                    completed: true,
                    trade: this.buildTradeRecord(state, todayDate, state.trailingStopPrice,
                        totalPnl, holdingDays, 'TRAILING_STOP', 'WIN')
                };
            }

            // Check TIME EXPIRY
            if (daysSinceTrailStart >= this.config.maxTrailDays) {
                const trailingPnl = ((todayCandle.close - state.entryPrice) / state.entryPrice * 100)
                    * (this.config.trailingPositionPercent / 100);
                const totalPnl = state.partialPnl + trailingPnl;

                state.stateHistory.push({
                    state: TradeState.FULL_EXIT,
                    date: todayDate,
                    price: todayCandle.close,
                    pnl: trailingPnl,
                    reason: 'Trail time expiry'
                });

                const holdingDays = today - state.entryCandleIndex;
                return {
                    completed: true,
                    trade: this.buildTradeRecord(state, todayDate, todayCandle.close,
                        totalPnl, holdingDays, 'TIME_EXPIRY', totalPnl > 0 ? 'WIN' : 'LOSS')
                };
            }
        }

        return { completed: false };
    }

    /**
     * ============================================
     * CORE FIX: TIME-FORWARD MARKET REPLAY
     * ============================================
     * 
     * This function replays the market DAY-BY-DAY for a single stock.
     * Each candle is processed sequentially as if "today" is that candle's date.
     * State transitions happen on DIFFERENT trading days.
     */
    async simulateStockTimeline(stock, strategy, candles, categoryKey, startIndex = 50) {
        const trades = [];
        const invalidated = [];

        // Current trade state (one trade at a time)
        let tradeState = null;

        // Process each candle as "today"
        for (let today = startIndex; today < candles.length; today++) {
            const todayCandle = candles[today];
            const todayDate = todayCandle.timestamp;
            const availableHistory = candles.slice(0, today + 1); // Only past data

            // Calculate indicators using only data available "today"
            const indicators = TechnicalAnalysis.getMarketContext(availableHistory);
            if (!indicators) continue;

            this.addExhaustionIndicators(indicators, availableHistory);

            // ======== STATE MACHINE: Process based on current state ========

            if (!tradeState) {
                // STATE: WATCHING - Looking for entry signal
                let hasSignal = false;
                try {
                    hasSignal = strategy.entry(indicators, availableHistory);
                } catch (e) {
                    continue;
                }

                if (hasSignal) {
                    // Signal confirmed TODAY - transition to WAITING_TO_ENTER
                    tradeState = {
                        state: TradeState.SIGNAL_CONFIRMED,
                        symbol: stock.symbol,
                        strategy: strategy.name,
                        signalDate: todayDate,
                        signalPrice: todayCandle.close,
                        signalCandleIndex: today,
                        waitingUntilCandle: today + this.config.swingDelayCandles,
                        targetPrice: todayCandle.close * (1 + strategy.exit.target / 100),
                        stopPrice: todayCandle.close * (1 - strategy.exit.stop / 100),
                        secondTargetPrice: todayCandle.close * (1 + (strategy.exit.target * 1.5) / 100),
                        stateHistory: [
                            { state: TradeState.WATCHING, date: todayDate, reason: 'Monitoring stock' },
                            { state: TradeState.SIGNAL_CONFIRMED, date: todayDate, price: todayCandle.close, reason: 'Entry conditions met' }
                        ]
                    };

                    this.log(stock.symbol, 'SIGNAL_CONFIRMED',
                        `Signal on ${todayDate}, waiting until candle ${tradeState.waitingUntilCandle} for entry`);
                }
            }
            else if (tradeState.state === TradeState.SIGNAL_CONFIRMED) {
                // STATE: WAITING FOR DELAY - Check if delay period passed
                if (today >= tradeState.waitingUntilCandle) {
                    // Delay period complete - validate entry on TODAY's candle
                    const entryValidation = this.validateEntryOnCandle(
                        tradeState.signalPrice,
                        todayCandle,
                        tradeState.stopPrice
                    );

                    if (!entryValidation.valid) {
                        // Entry INVALIDATED - price moved beyond stop during delay
                        tradeState.stateHistory.push({
                            state: TradeState.INVALIDATED,
                            date: todayDate,
                            reason: entryValidation.reason
                        });

                        invalidated.push({
                            symbol: stock.symbol,
                            strategy: strategy.name,
                            signalDate: tradeState.signalDate,
                            signalPrice: tradeState.signalPrice,
                            invalidationDate: todayDate,
                            invalidationReason: entryValidation.reason,
                            lifecycle: tradeState.stateHistory
                        });

                        this.log(stock.symbol, 'ENTRY_INVALIDATED',
                            `Signal on ${tradeState.signalDate}, invalidated on ${todayDate}: ${entryValidation.reason}`);

                        tradeState = null; // Reset to look for new signal
                    } else {
                        // Entry VALIDATED - execute entry on TODAY
                        tradeState.state = TradeState.ENTERED;
                        tradeState.entryDate = todayDate;
                        tradeState.entryPrice = entryValidation.entryPrice;
                        tradeState.entryCandleIndex = today;
                        tradeState.highestPriceSinceEntry = tradeState.entryPrice;
                        tradeState.partialExitDone = false;

                        // Recalculate targets based on actual entry price
                        tradeState.targetPrice = tradeState.entryPrice * (1 + strategy.exit.target / 100);
                        tradeState.stopPrice = tradeState.entryPrice * (1 - strategy.exit.stop / 100);
                        tradeState.secondTargetPrice = tradeState.entryPrice * (1 + (strategy.exit.target * 1.5) / 100);

                        tradeState.stateHistory.push({
                            state: TradeState.WAITING_TO_ENTER,
                            date: tradeState.signalDate,
                            reason: 'Delay period started'
                        });
                        tradeState.stateHistory.push({
                            state: TradeState.ENTERED,
                            date: todayDate,
                            price: tradeState.entryPrice,
                            reason: 'Entry validated and executed'
                        });

                        this.log(stock.symbol, 'ENTRY_EXECUTED',
                            `Signal on ${tradeState.signalDate}, entered on ${todayDate} @ ${tradeState.entryPrice.toFixed(2)}`);
                    }
                }
            }
            else if (tradeState.state === TradeState.ENTERED) {
                // STATE: IN TRADE (before partial exit) - Check for target or stop
                tradeState.highestPriceSinceEntry = Math.max(tradeState.highestPriceSinceEntry, todayCandle.high);

                // Check STOP first
                if (todayCandle.low <= tradeState.stopPrice) {
                    // Stop hit - full loss
                    tradeState.stateHistory.push({
                        state: TradeState.STOPPED_OUT,
                        date: todayDate,
                        price: tradeState.stopPrice,
                        pnl: -strategy.exit.stop,
                        reason: 'Stop loss hit'
                    });

                    const holdingDays = today - tradeState.entryCandleIndex;
                    trades.push(this.buildTradeRecord(tradeState, todayDate, tradeState.stopPrice,
                        -strategy.exit.stop, holdingDays, 'STOP', 'LOSS'));

                    this.log(stock.symbol, 'STOPPED_OUT',
                        `Entry ${tradeState.entryDate}, stopped on ${todayDate}, held ${holdingDays} days`);

                    tradeState = null;
                }
                // Check TARGET (partial exit)
                else if (todayCandle.high >= tradeState.targetPrice) {
                    // First target hit - partial exit 80%
                    tradeState.state = TradeState.PARTIAL_EXIT;
                    tradeState.partialExitDone = true;
                    tradeState.partialExitDate = todayDate;
                    tradeState.partialExitPrice = tradeState.targetPrice;
                    tradeState.partialPnl = strategy.exit.target * (this.config.partialExitPercent / 100);

                    // Move stop to breakeven for trailing portion
                    tradeState.trailingStopPrice = tradeState.entryPrice;
                    tradeState.trailStartCandle = today;

                    tradeState.stateHistory.push({
                        state: TradeState.PARTIAL_EXIT,
                        date: todayDate,
                        price: tradeState.targetPrice,
                        pnl: tradeState.partialPnl,
                        reason: `80% booked at target, trailing 20% with breakeven stop`
                    });

                    this.log(stock.symbol, 'PARTIAL_EXIT',
                        `Entry ${tradeState.entryDate}, 80% booked on ${todayDate} @ ${tradeState.targetPrice.toFixed(2)}`);

                    // Immediately transition to TRAILING state
                    tradeState.state = TradeState.TRAILING;
                    tradeState.stateHistory.push({
                        state: TradeState.TRAILING,
                        date: todayDate,
                        reason: 'Trailing remaining 20%'
                    });
                }
            }
            else if (tradeState.state === TradeState.TRAILING) {
                // STATE: TRAILING (20% position) - Check for second target, trailing stop, or expiry
                tradeState.highestPriceSinceEntry = Math.max(tradeState.highestPriceSinceEntry, todayCandle.high);

                // Update trailing stop (0.5% below highest)
                const newTrailingStop = tradeState.highestPriceSinceEntry * (1 - this.config.trailingStepPercent / 100);
                tradeState.trailingStopPrice = Math.max(tradeState.trailingStopPrice, newTrailingStop);

                const daysSinceTrailStart = today - tradeState.trailStartCandle;

                // Check SECOND TARGET
                if (todayCandle.high >= tradeState.secondTargetPrice) {
                    const trailingPnl = (strategy.exit.target * 1.5) * (this.config.trailingPositionPercent / 100);
                    const totalPnl = tradeState.partialPnl + trailingPnl;

                    tradeState.stateHistory.push({
                        state: TradeState.FULL_EXIT,
                        date: todayDate,
                        price: tradeState.secondTargetPrice,
                        pnl: trailingPnl,
                        reason: 'Second target hit'
                    });

                    const holdingDays = today - tradeState.entryCandleIndex;
                    trades.push(this.buildTradeRecord(tradeState, todayDate, tradeState.secondTargetPrice,
                        totalPnl, holdingDays, 'SECOND_TARGET', 'WIN'));

                    this.log(stock.symbol, 'FULL_EXIT_TARGET',
                        `Entry ${tradeState.entryDate}, second target hit on ${todayDate}, held ${holdingDays} days`);

                    tradeState = null;
                }
                // Check TRAILING STOP
                else if (todayCandle.low <= tradeState.trailingStopPrice) {
                    const trailingPnl = ((tradeState.trailingStopPrice - tradeState.entryPrice) / tradeState.entryPrice * 100)
                        * (this.config.trailingPositionPercent / 100);
                    const totalPnl = tradeState.partialPnl + trailingPnl;

                    tradeState.stateHistory.push({
                        state: TradeState.FULL_EXIT,
                        date: todayDate,
                        price: tradeState.trailingStopPrice,
                        pnl: trailingPnl,
                        reason: 'Trailing stop hit'
                    });

                    const holdingDays = today - tradeState.entryCandleIndex;
                    trades.push(this.buildTradeRecord(tradeState, todayDate, tradeState.trailingStopPrice,
                        totalPnl, holdingDays, 'TRAILING_STOP', 'WIN'));

                    this.log(stock.symbol, 'FULL_EXIT_TRAIL',
                        `Entry ${tradeState.entryDate}, trailing stop on ${todayDate}, held ${holdingDays} days`);

                    tradeState = null;
                }
                // Check TIME EXPIRY
                else if (daysSinceTrailStart >= this.config.maxTrailDays) {
                    const trailingPnl = ((todayCandle.close - tradeState.entryPrice) / tradeState.entryPrice * 100)
                        * (this.config.trailingPositionPercent / 100);
                    const totalPnl = tradeState.partialPnl + trailingPnl;

                    tradeState.stateHistory.push({
                        state: TradeState.FULL_EXIT,
                        date: todayDate,
                        price: todayCandle.close,
                        pnl: trailingPnl,
                        reason: 'Trail time expiry'
                    });

                    const holdingDays = today - tradeState.entryCandleIndex;
                    trades.push(this.buildTradeRecord(tradeState, todayDate, todayCandle.close,
                        totalPnl, holdingDays, 'TIME_EXPIRY', totalPnl > 0 ? 'WIN' : 'LOSS'));

                    this.log(stock.symbol, 'FULL_EXIT_TIME',
                        `Entry ${tradeState.entryDate}, time expiry on ${todayDate}, held ${holdingDays} days`);

                    tradeState = null;
                }
            }
        }

        return { trades, invalidated };
    }

    /**
     * Validate entry on a specific candle (after delay)
     */
    validateEntryOnCandle(signalPrice, candle, stopPrice) {
        // Check if price moved beyond stop
        if (candle.low <= stopPrice) {
            return {
                valid: false,
                reason: `Price dropped to ${candle.low.toFixed(2)} during delay, below stop ${stopPrice.toFixed(2)}`
            };
        }

        // Check for gap down > 3%
        const gapPercent = ((signalPrice - candle.open) / signalPrice) * 100;
        if (gapPercent > 3) {
            return {
                valid: false,
                reason: `Gap down ${gapPercent.toFixed(2)}% from signal price`
            };
        }

        return { valid: true, entryPrice: candle.close };
    }

    /**
     * Build trade record with full lifecycle
     */
    buildTradeRecord(state, exitDate, exitPrice, pnl, holdingDays, exitReason, result) {
        return {
            symbol: state.symbol,
            strategy: state.strategy,
            signalDate: state.signalDate,
            signalPrice: state.signalPrice,
            entryDate: state.entryDate,
            entryPrice: state.entryPrice,
            exitDate: exitDate,
            exitPrice: exitPrice,
            partialExitDate: state.partialExitDate || null,
            partialExitPrice: state.partialExitPrice || null,
            trailingStopPrice: state.trailingStopPrice || null,
            pnl: pnl,
            holdingDays: holdingDays,
            exitReason: exitReason,
            result: result,
            lifecycle: state.stateHistory
        };
    }

    /**
     * Add exhaustion-specific indicators
     */
    addExhaustionIndicators(indicators, candles) {
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];

        const candleRange = lastCandle.high - lastCandle.low;
        const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
        indicators.lowerWickPct = candleRange > 0 ? (lowerWick / candleRange) * 100 : 0;

        const recentCandles = candles.slice(-20);
        const avgVolume = recentCandles.reduce((s, c) => s + c.volume, 0) / recentCandles.length;
        indicators.volumeVsAvg = avgVolume > 0 ? lastCandle.volume / avgVolume : 1;

        if (prevCandle) {
            const prevIndicators = TechnicalAnalysis.getMarketContext(candles.slice(0, -1));
            indicators.rsi14_prev = prevIndicators?.rsi14 || null;
        }

        const last5 = candles.slice(-5);
        const lookback20 = candles.slice(-25, -5);
        const recentLow5 = Math.min(...last5.map(c => c.low));
        const prior20Low = lookback20.length > 0 ? Math.min(...lookback20.map(c => c.low)) : recentLow5;

        indicators.recentNewLow = recentLow5 < prior20Low * 0.99;
        indicators.aboveRecentLow = lastCandle.close > recentLow5;
        indicators.newLow = lastCandle.low < prior20Low;
        indicators.holdingAboveLow = !indicators.newLow && indicators.aboveRecentLow;

        const closePosition = candleRange > 0 ? (lastCandle.close - lastCandle.low) / candleRange : 0.5;
        indicators.closeNearHigh = closePosition > 0.7;
    }

    /**
     * Run full simulation for a category - NOW WITH TIME-FORWARD REPLAY
     */
    async runCategorySimulation(categoryKey, stocks, options = {}) {
        console.log(`\n🎯 [RealisticSim] TIME-FORWARD REPLAY for ${categoryKey}`);
        console.log(`   Stocks: ${stocks.length}`);
        console.log(`   Entry Delay: ${this.config.swingDelayCandles} candle(s)`);
        console.log(`   Trail Duration: ${this.config.maxTrailDays} days\n`);

        const strategies = CategoryFilteredCatalogue.buildForCategory(categoryKey);
        console.log(`   Strategies: ${strategies.length}\n`);

        this.executedTrades = [];
        this.invalidatedSignals = [];
        this.missedEntries = [];
        this.expiredStocks = [];
        this.trappedSignals = [];
        this.logs = [];

        for (const stock of stocks) {
            const candles = await this.getCandlesForStock(stock.symbol);
            if (!candles || candles.length < 50) {
                this.log(stock.symbol, 'INSUFFICIENT_DATA', `Only ${candles?.length || 0} candles`);
                continue;
            }

            if (this.config.backtestMode) {
                this.log(stock.symbol, 'BACKTEST_MODE', 'Starting time-forward replay with symbol lock');
            }

            // SYMBOL-LEVEL LOCKING: Process all strategies together, one trade at a time
            const result = await this.simulateStockWithSymbolLock(stock, strategies, candles, categoryKey, 50);

            // Collect results
            this.executedTrades.push(...result.trades);
            this.invalidatedSignals.push(...result.invalidated);
            this.skippedSignals.push(...(result.skipped || []));
        }

        return this.getResults();
    }

    getResults() {
        const executed = this.executedTrades;
        const invalidated = this.invalidatedSignals;
        const skipped = this.skippedSignals;

        // ========================================
        // PROFESSIONAL TRADING METRICS
        // ========================================

        // Basic counts
        const totalSignalsGenerated = executed.length + invalidated.length;
        const wins = executed.filter(t => t.result === 'WIN').length;
        const losses = executed.filter(t => t.result === 'LOSS').length;

        // === CAPITAL WIN RATE ===
        // Trades that reached partial exit = "protected capital"
        // These are NOT failures even if trailing portion gets stopped
        const tradesWithPartialExit = executed.filter(t => t.partialExitPrice !== null);
        const fullStops = executed.filter(t => t.exitReason === 'STOP' && !t.partialExitPrice);

        // Capital win rate: how often did we protect 80% of position
        const capitalWinRate = executed.length > 0
            ? ((wins + tradesWithPartialExit.length) / executed.length * 100)
            : 0;

        // === SIGNAL QUALITY ===
        // What % of signals actually entered the market (after delay validation)
        const signalQuality = totalSignalsGenerated > 0
            ? (executed.length / totalSignalsGenerated * 100)
            : 0;

        // === ENTRY FILTER EFFECTIVENESS ===
        // How many bad entries were avoided by the delay validation
        const entriesAvoided = invalidated.length;
        const avoidedBadEntryRate = totalSignalsGenerated > 0
            ? (entriesAvoided / totalSignalsGenerated * 100)
            : 0;

        // === RISK MANAGEMENT METRICS ===
        // Trades that hit first target (partial exit)
        const targetHitRate = executed.length > 0
            ? (tradesWithPartialExit.length / executed.length * 100)
            : 0;

        // Trades that hit second target (full profit)
        const secondTargetHits = executed.filter(t => t.exitReason === 'SECOND_TARGET');
        const fullTargetRate = executed.length > 0
            ? (secondTargetHits.length / executed.length * 100)
            : 0;

        // Trailing stop exits (profitable but not max target)
        const trailingExits = executed.filter(t => t.exitReason === 'TRAILING_STOP');

        // === PNL CALCULATIONS ===
        const totalPnl = executed.reduce((s, t) => s + t.pnl, 0);
        const avgPnl = executed.length > 0 ? totalPnl / executed.length : 0;

        // Risk-adjusted: wins vs losses weighted
        const avgWinPnl = wins > 0
            ? executed.filter(t => t.result === 'WIN').reduce((s, t) => s + t.pnl, 0) / wins
            : 0;
        const avgLossPnl = losses > 0
            ? Math.abs(executed.filter(t => t.result === 'LOSS').reduce((s, t) => s + t.pnl, 0) / losses)
            : 0;

        // Risk-reward ratio
        const riskRewardRatio = avgLossPnl > 0 ? avgWinPnl / avgLossPnl : avgWinPnl;

        // Expectancy (what a trader expects per trade)
        const winRate = executed.length > 0 ? wins / executed.length : 0;
        const lossRate = executed.length > 0 ? losses / executed.length : 0;
        const expectancy = (winRate * avgWinPnl) - (lossRate * avgLossPnl);

        // === DISCIPLINE METRICS ===
        // Symbol lock prevented overlapping trades
        const overlappingTradesAvoided = skipped.length;

        // Average holding days
        const avgHoldingDays = executed.length > 0
            ? executed.reduce((s, t) => s + t.holdingDays, 0) / executed.length
            : 0;

        // === EXIT REASONS BREAKDOWN ===
        const exitBreakdown = {
            secondTarget: secondTargetHits.length,
            trailingStop: trailingExits.length,
            fullStop: fullStops.length,
            timeExpiry: executed.filter(t => t.exitReason === 'TIME_EXPIRY').length
        };

        // === PROFESSIONAL SUMMARY ===
        const results = {
            summary: {
                // Execution metrics
                totalSignalsGenerated,
                executedTrades: executed.length,
                invalidatedSignals: invalidated.length,
                skippedBySymbolLock: skipped.length,

                // Traditional metrics (raw)
                winRate: (winRate * 100).toFixed(1),
                wins,
                losses,
                avgPnl: avgPnl.toFixed(2),
                totalPnl: totalPnl.toFixed(2),

                // PROFESSIONAL METRICS (what really matters)
                capitalWinRate: capitalWinRate.toFixed(1),  // Trades that protected capital
                signalQuality: signalQuality.toFixed(1),    // % of signals that executed
                targetHitRate: targetHitRate.toFixed(1),    // % that reached first target
                fullTargetRate: fullTargetRate.toFixed(1),  // % that hit second target

                // Risk metrics
                riskRewardRatio: riskRewardRatio.toFixed(2),
                expectancy: expectancy.toFixed(2),          // Expected return per trade
                avgHoldingDays: avgHoldingDays.toFixed(1),

                // Discipline metrics
                entriesAvoided,                              // Bad entries filtered out
                overlappingTradesAvoided,                    // Symbol lock discipline

                // Exit breakdown
                exitBreakdown
            },

            // Professional interpretation
            interpretation: {
                signalQualityGrade: signalQuality >= 60 ? 'EXCELLENT' : signalQuality >= 40 ? 'GOOD' : 'NEEDS_WORK',
                riskManagementGrade: targetHitRate >= 30 ? 'STRONG' : targetHitRate >= 15 ? 'MODERATE' : 'WEAK',
                capitalProtectionNote: `${tradesWithPartialExit.length} trades booked 80% profit before any adverse move`,
                disciplineNote: `Avoided ${overlappingTradesAvoided} overlapping trades via symbol lock`,
                filterNote: `Entry delay filter blocked ${entriesAvoided} potentially bad entries`,
                tradingStyle: avgHoldingDays <= 2 ? 'Aggressive Swing' : avgHoldingDays <= 5 ? 'Standard Swing' : 'Position Trading'
            },

            // Raw data
            executedTrades: executed,
            invalidatedSignals: invalidated,
            skippedSignals: skipped,
            expiredStocks: this.expiredStocks,
            trappedSignals: this.trappedSignals,
            logs: this.logs
        };

        // ============================================
        // SHADOW LEARNER: Generate Research Report
        // ============================================
        try {
            const shadowLearner = new ShadowLearner(results);
            results.shadowReport = shadowLearner.generateShadowReport();

            // Log that Shadow Report is available
            console.log('\n' + results.shadowReport.humanReadableSummary);
        } catch (err) {
            console.error('Shadow Learner error:', err.message);
            results.shadowReport = { error: err.message };
        }

        return results;
    }

    async getCandlesForStock(symbol) {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return null;

        let data = cached.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) { return null; }
        }

        if (!Array.isArray(data)) return null;

        // Parse and filter valid candles
        const candles = data.map(c => ({
            open: parseFloat(c.open) || 0,
            high: parseFloat(c.high) || 0,
            low: parseFloat(c.low) || 0,
            close: parseFloat(c.close) || 0,
            volume: parseInt(c.volume) || 0,
            timestamp: c.timestamp || c.date
        })).filter(c => c.close > 0);

        // CRITICAL: Sort by timestamp ASCENDING (oldest first)
        // This ensures forward iteration goes from past to future
        candles.sort((a, b) => {
            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);
            return dateA.getTime() - dateB.getTime();
        });

        return candles;
    }
}

module.exports = { RealisticTradingSimulator, TradeState, TradeOutcome };
