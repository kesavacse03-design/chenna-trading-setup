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
            backtestMode: options.backtestMode || false
        };

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
                // FIRST strategy to signal wins (priority order)
                for (const strategy of strategies) {
                    let hasSignal = false;
                    try {
                        hasSignal = strategy.entry(indicators, availableHistory);
                    } catch (e) {
                        continue;
                    }

                    if (hasSignal) {
                        // This strategy wins - LOCK THE SYMBOL
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
                            stopPrice: todayCandle.close * (1 - strategy.exit.stop / 100),
                            secondTargetPrice: todayCandle.close * (1 + (strategy.exit.target * 1.5) / 100),
                            stateHistory: [
                                { state: TradeState.WATCHING, date: todayDate, reason: 'Monitoring stock' },
                                { state: TradeState.SIGNAL_CONFIRMED, date: todayDate, price: todayCandle.close, reason: 'Entry conditions met' }
                            ]
                        };

                        this.log(stock.symbol, 'SYMBOL_LOCKED',
                            `${strategy.name} signal on ${todayDate}, symbol locked until trade completes`);

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
                // Delay period complete - validate entry
                const entryValidation = this.validateEntryOnCandle(
                    state.signalPrice, todayCandle, state.stopPrice
                );

                if (!entryValidation.valid) {
                    // Entry INVALIDATED
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
                    // Entry EXECUTED - update state
                    state.state = TradeState.ENTERED;
                    state.entryDate = todayDate;
                    state.entryPrice = entryValidation.entryPrice;
                    state.entryCandleIndex = today;
                    state.highestPriceSinceEntry = state.entryPrice;
                    state.partialExitDone = false;

                    // Recalculate targets based on actual entry price
                    state.targetPrice = state.entryPrice * (1 + state.targetPercent / 100);
                    state.stopPrice = state.entryPrice * (1 - state.stopPercent / 100);
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
        const totalSignals = this.executedTrades.length + this.invalidatedSignals.length;
        const wins = this.executedTrades.filter(t => t.result === 'WIN').length;
        const losses = this.executedTrades.filter(t => t.result === 'LOSS').length;

        return {
            summary: {
                totalSignalsGenerated: totalSignals,
                executedTrades: this.executedTrades.length,
                invalidatedSignals: this.invalidatedSignals.length,
                skippedBySymbolLock: this.skippedSignals.length,
                expiredStocks: this.expiredStocks.length,
                trappedSignals: this.trappedSignals.length,
                winRate: this.executedTrades.length > 0 ? (wins / this.executedTrades.length * 100).toFixed(1) : 0,
                wins,
                losses,
                avgPnl: this.executedTrades.length > 0
                    ? (this.executedTrades.reduce((s, t) => s + t.pnl, 0) / this.executedTrades.length).toFixed(2)
                    : 0
            },
            executedTrades: this.executedTrades,
            invalidatedSignals: this.invalidatedSignals,
            skippedSignals: this.skippedSignals,
            expiredStocks: this.expiredStocks,
            trappedSignals: this.trappedSignals,
            logs: this.logs
        };
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

        return data.map(c => ({
            open: parseFloat(c.open) || 0,
            high: parseFloat(c.high) || 0,
            low: parseFloat(c.low) || 0,
            close: parseFloat(c.close) || 0,
            volume: parseInt(c.volume) || 0,
            timestamp: c.timestamp || c.date
        })).filter(c => c.close > 0);
    }
}

module.exports = { RealisticTradingSimulator, TradeState, TradeOutcome };
