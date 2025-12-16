/**
 * Realistic Trading Simulator
 * 
 * Simulates a real trading desk environment with:
 * 1. Stock Age Awareness - 10 days for swing, same day for intraday
 * 2. Signal → Entry Delay - 15min swing, 5min intraday
 * 3. Trade Lifecycle States - Full state machine tracking
 * 4. Partial Exit & Trailing - 80% at target, 20% trails
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
    EXECUTED: 'EXECUTED',           // Normal trade completed
    INVALIDATED: 'INVALIDATED',     // Signal confirmed but entry failed
    MISSED: 'MISSED',               // Signal confirmed but no data for validation
    EXPIRED: 'EXPIRED',             // Stock validity expired
    TRAPPED: 'TRAPPED'              // Institutional trap detected
};

class RealisticTradingSimulator {
    constructor(options = {}) {
        // Configuration
        this.config = {
            swingValidityDays: options.swingValidityDays || 10,
            intradayValidityDays: options.intradayValidityDays || 0, // Same day only
            swingDelayMinutes: options.swingDelayMinutes || 15,
            intradayDelayMinutes: options.intradayDelayMinutes || 5,
            partialExitPercent: options.partialExitPercent || 80,
            trailingPositionPercent: options.trailingPositionPercent || 20,
            maxTrailDays: options.maxTrailDays || 5,
            trailingStepPercent: options.trailingStepPercent || 0.5,
            backtestMode: options.backtestMode || false  // Skip validity for historical testing
        };

        // Results containers
        this.executedTrades = [];
        this.invalidatedSignals = [];
        this.missedEntries = [];
        this.expiredStocks = [];
        this.trappedSignals = [];

        // Logging
        this.logs = [];
    }

    /**
     * Log a decision with full transparency
     */
    log(symbol, event, reason, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            symbol,
            event,
            reason,
            ...details
        };
        this.logs.push(entry);
        console.log(`📋 [${symbol}] ${event}: ${reason}`);
    }

    /**
     * ============================================
     * PHASE 1: Stock Age Awareness
     * ============================================
     */

    /**
     * Check if stock is valid based on addedDate and category type
     */
    isStockValid(stock, categoryKey, currentDate) {
        // Get addedDate from stock-category relationship
        const addedDate = stock.addedDate ? new Date(stock.addedDate) : null;

        // If no addedDate, treat as newly added (valid)
        if (!addedDate) {
            this.log(stock.symbol, 'VALIDITY_CHECK', 'No addedDate found, treating as valid');
            return { valid: true, reason: 'No addedDate, treated as new' };
        }

        const currentDateObj = new Date(currentDate);
        const tradingDays = this.getTradingDaysBetween(addedDate, currentDateObj);

        // Check category type
        const isIntraday = categoryKey.includes('INTRADAY');
        const maxDays = isIntraday ? this.config.intradayValidityDays : this.config.swingValidityDays;

        if (isIntraday) {
            // Same day check
            const sameDay = this.isSameDay(addedDate, currentDateObj);
            if (!sameDay) {
                const reason = `Intraday stock expired: added on ${addedDate.toDateString()}, current ${currentDateObj.toDateString()}`;
                this.log(stock.symbol, 'STOCK_EXPIRED', reason);
                return { valid: false, reason, tradingDays };
            }
        } else {
            // Swing: 10 trading days
            if (tradingDays > maxDays) {
                const reason = `Swing stock expired: ${tradingDays} trading days old (max ${maxDays})`;
                this.log(stock.symbol, 'STOCK_EXPIRED', reason);
                return { valid: false, reason, tradingDays };
            }
        }

        return { valid: true, reason: `Valid: ${tradingDays} trading days old`, tradingDays };
    }

    /**
     * Calculate trading days between two dates (excluding weekends)
     */
    getTradingDaysBetween(startDate, endDate) {
        let count = 0;
        let currentDate = new Date(startDate);

        while (currentDate < endDate) {
            const dayOfWeek = currentDate.getDay();
            // Skip weekends (0 = Sunday, 6 = Saturday)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                count++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return count;
    }

    /**
     * Check if two dates are the same day
     */
    isSameDay(date1, date2) {
        return date1.toDateString() === date2.toDateString();
    }

    /**
     * ============================================
     * PHASE 2: Signal → Entry Delay
     * ============================================
     */

    /**
     * Validate entry after delay period
     * Returns true if entry is still valid, false if invalidated
     */
    validateEntryAfterDelay(signalPrice, currentCandleData, exitRules) {
        const stopPrice = signalPrice * (1 - exitRules.stop / 100);

        // Check if price moved beyond stop during delay
        if (currentCandleData.low <= stopPrice) {
            return {
                valid: false,
                reason: `Price dropped to ${currentCandleData.low.toFixed(2)} during delay, below stop ${stopPrice.toFixed(2)}`,
                invalidationType: 'STOP_HIT_DURING_DELAY'
            };
        }

        // Check if price gapped down significantly (> 3% from signal)
        const gapPercent = ((signalPrice - currentCandleData.open) / signalPrice) * 100;
        if (gapPercent > 3) {
            return {
                valid: false,
                reason: `Gap down ${gapPercent.toFixed(2)}% from signal price`,
                invalidationType: 'GAP_DOWN'
            };
        }

        return { valid: true, reason: 'Entry validated', entryPrice: currentCandleData.close };
    }

    /**
     * ============================================
     * PHASE 3: Trade Lifecycle States
     * ============================================
     */

    /**
     * Create a new trade lifecycle record
     */
    createTradeLifecycle(stock, strategy, currentDate) {
        return {
            symbol: stock.symbol,
            strategy: strategy.name,
            state: TradeState.WATCHING,
            stateHistory: [
                {
                    state: TradeState.WATCHING,
                    at: currentDate,
                    reason: 'Trade lifecycle initiated'
                }
            ],
            signalPrice: null,
            entryPrice: null,
            exitPrice: null,
            partialExitPrice: null,
            trailingStopPrice: null,
            outcome: null
        };
    }

    /**
     * Transition trade to a new state
     */
    transitionState(lifecycle, newState, reason, details = {}) {
        lifecycle.state = newState;
        lifecycle.stateHistory.push({
            state: newState,
            at: details.date || new Date().toISOString(),
            reason,
            ...details
        });

        this.log(lifecycle.symbol, `STATE_TRANSITION`, `${lifecycle.stateHistory[lifecycle.stateHistory.length - 2]?.state} → ${newState}: ${reason}`);

        return lifecycle;
    }

    /**
     * ============================================
     * PHASE 4: Partial Exit & Trailing
     * ============================================
     */

    /**
     * Simulate trade with partial exit and trailing
     */
    simulateTradeWithPartialExit(entry, futureCandles, exitRules) {
        const targetPrice = entry.price * (1 + exitRules.target / 100);
        const stopPrice = entry.price * (1 - exitRules.stop / 100);
        const secondTargetPrice = entry.price * (1 + (exitRules.target * 1.5) / 100); // 1.5x first target

        let partialExitDone = false;
        let partialExitResult = null;
        let trailingResult = null;
        let trailingStopPrice = entry.price; // Start at breakeven after partial exit
        let highestPriceSinceEntry = entry.price;

        for (let day = 0; day < futureCandles.length; day++) {
            const candle = futureCandles[day];

            // Track highest price for trailing
            highestPriceSinceEntry = Math.max(highestPriceSinceEntry, candle.high);

            if (!partialExitDone) {
                // Check for stop loss (before partial exit)
                if (candle.low <= stopPrice) {
                    return {
                        outcome: 'FULL_STOP',
                        partialExit: null,
                        trailingExit: null,
                        exit: {
                            price: stopPrice,
                            date: candle.timestamp,
                            dayNum: day + 1,
                            reason: 'STOP'
                        },
                        pnl: (-exitRules.stop),
                        holdingDays: day + 1
                    };
                }

                // Check for first target (partial exit)
                if (candle.high >= targetPrice) {
                    partialExitDone = true;
                    partialExitResult = {
                        price: targetPrice,
                        date: candle.timestamp,
                        dayNum: day + 1,
                        percentBooked: this.config.partialExitPercent,
                        pnl: exitRules.target * (this.config.partialExitPercent / 100)
                    };

                    // Move trailing stop to breakeven
                    trailingStopPrice = entry.price;

                    this.log(entry.symbol || 'TRADE', 'PARTIAL_EXIT',
                        `80% booked at ${targetPrice.toFixed(2)}, trailing 20% with stop at breakeven`);
                }
            } else {
                // After partial exit: trailing logic for remaining 20%

                // Update trailing stop (0.5% below highest)
                const newTrailingStop = highestPriceSinceEntry * (1 - this.config.trailingStepPercent / 100);
                trailingStopPrice = Math.max(trailingStopPrice, newTrailingStop);

                // Check for second target
                if (candle.high >= secondTargetPrice) {
                    trailingResult = {
                        price: secondTargetPrice,
                        date: candle.timestamp,
                        dayNum: day + 1,
                        reason: 'SECOND_TARGET',
                        pnl: (exitRules.target * 1.5) * (this.config.trailingPositionPercent / 100)
                    };
                    break;
                }

                // Check for trailing stop hit
                if (candle.low <= trailingStopPrice) {
                    trailingResult = {
                        price: trailingStopPrice,
                        date: candle.timestamp,
                        dayNum: day + 1,
                        reason: 'TRAILING_STOP',
                        pnl: ((trailingStopPrice - entry.price) / entry.price * 100) * (this.config.trailingPositionPercent / 100)
                    };
                    break;
                }

                // Check for max trail days
                if (day >= this.config.maxTrailDays - 1) {
                    trailingResult = {
                        price: candle.close,
                        date: candle.timestamp,
                        dayNum: day + 1,
                        reason: 'TIME_EXPIRY',
                        pnl: ((candle.close - entry.price) / entry.price * 100) * (this.config.trailingPositionPercent / 100)
                    };
                    break;
                }
            }
        }

        // If we exited before partial was done
        if (!partialExitDone) {
            const lastCandle = futureCandles[futureCandles.length - 1];
            return {
                outcome: 'TIME_EXIT',
                partialExit: null,
                trailingExit: null,
                exit: {
                    price: lastCandle.close,
                    date: lastCandle.timestamp,
                    dayNum: futureCandles.length,
                    reason: 'TIME'
                },
                pnl: ((lastCandle.close - entry.price) / entry.price * 100),
                holdingDays: futureCandles.length
            };
        }

        // Calculate total P&L
        const partialPnl = partialExitResult.pnl || 0;
        const trailingPnl = trailingResult?.pnl || 0;
        const totalPnl = partialPnl + trailingPnl;

        return {
            outcome: 'PARTIAL_AND_TRAIL',
            partialExit: partialExitResult,
            trailingExit: trailingResult,
            exit: trailingResult || partialExitResult,
            pnl: totalPnl,
            holdingDays: trailingResult?.dayNum || partialExitResult.dayNum
        };
    }

    /**
     * ============================================
     * PHASE 5 & 6: Full Simulation with Transparency
     * ============================================
     */

    /**
     * Run realistic simulation for a single stock at a specific date
     */
    async simulateAtDate(stock, strategy, allCandles, dateIndex, categoryKey) {
        const currentDate = allCandles[dateIndex].timestamp;
        const lifecycle = this.createTradeLifecycle(stock, strategy, currentDate);

        // Get available data (no future knowledge)
        const availableCandles = allCandles.slice(0, dateIndex + 1);
        const futureCandles = allCandles.slice(dateIndex + 1, dateIndex + 11);

        if (futureCandles.length < 3) {
            return null; // Not enough future data to simulate
        }

        // Calculate indicators
        const indicators = TechnicalAnalysis.getMarketContext(availableCandles);
        if (!indicators) return null;

        // Add exhaustion indicators
        this.addExhaustionIndicators(indicators, availableCandles);

        // Check entry signal
        let hasSignal = false;
        try {
            hasSignal = strategy.entry(indicators, availableCandles);
        } catch (e) {
            return null;
        }

        if (!hasSignal) {
            return null; // No signal, no trade
        }

        // Signal confirmed
        const signalPrice = availableCandles[availableCandles.length - 1].close;
        lifecycle.signalPrice = signalPrice;
        this.transitionState(lifecycle, TradeState.SIGNAL_CONFIRMED, 'All entry conditions met', {
            date: currentDate,
            price: signalPrice
        });

        // PHASE 2: Apply signal delay
        // In daily simulation, delay is simulated by checking next candle's open/low
        this.transitionState(lifecycle, TradeState.WAITING_TO_ENTER,
            `${categoryKey.includes('INTRADAY') ? '5min' : '15min'} delay before entry`, {
            date: currentDate,
            delayMinutes: categoryKey.includes('INTRADAY') ? 5 : 15
        });

        // Validate entry after delay (using next candle data)
        const nextCandle = futureCandles[0];
        const entryValidation = this.validateEntryAfterDelay(signalPrice, nextCandle, strategy.exit);

        if (!entryValidation.valid) {
            // Entry invalidated
            this.transitionState(lifecycle, TradeState.INVALIDATED, entryValidation.reason, {
                date: nextCandle.timestamp
            });
            lifecycle.outcome = TradeOutcome.INVALIDATED;

            this.invalidatedSignals.push({
                symbol: stock.symbol,
                strategy: strategy.name,
                signalDate: currentDate,
                signalPrice,
                invalidationReason: entryValidation.reason,
                lifecycle
            });

            return lifecycle;
        }

        // Entry validated
        const entryPrice = entryValidation.entryPrice;
        lifecycle.entryPrice = entryPrice;
        this.transitionState(lifecycle, TradeState.ENTERED, 'Entry validated and executed', {
            date: nextCandle.timestamp,
            price: entryPrice
        });

        // PHASE 4: Simulate trade with partial exit
        const entry = {
            price: entryPrice,
            date: nextCandle.timestamp,
            symbol: stock.symbol
        };

        const tradeResult = this.simulateTradeWithPartialExit(entry, futureCandles.slice(1), strategy.exit);

        // Update lifecycle based on result
        if (tradeResult.partialExit) {
            lifecycle.partialExitPrice = tradeResult.partialExit.price;
            this.transitionState(lifecycle, TradeState.PARTIAL_EXIT,
                `80% booked at target ₹${tradeResult.partialExit.price.toFixed(2)}`, {
                date: tradeResult.partialExit.date,
                pnl: tradeResult.partialExit.pnl
            });

            if (tradeResult.trailingExit) {
                this.transitionState(lifecycle, TradeState.TRAILING, 'Trailing remaining 20%', {
                    date: tradeResult.partialExit.date
                });

                lifecycle.trailingStopPrice = entry.price; // Breakeven
                lifecycle.exitPrice = tradeResult.trailingExit.price;

                this.transitionState(lifecycle, TradeState.FULL_EXIT,
                    `Trailing exit: ${tradeResult.trailingExit.reason}`, {
                    date: tradeResult.trailingExit.date,
                    price: tradeResult.trailingExit.price,
                    pnl: tradeResult.trailingExit.pnl
                });
            }
        } else {
            lifecycle.exitPrice = tradeResult.exit.price;
            const finalState = tradeResult.exit.reason === 'STOP' ? TradeState.STOPPED_OUT : TradeState.FULL_EXIT;
            this.transitionState(lifecycle, finalState, `Exit: ${tradeResult.exit.reason}`, {
                date: tradeResult.exit.date,
                price: tradeResult.exit.price,
                pnl: tradeResult.pnl
            });
        }

        lifecycle.outcome = TradeOutcome.EXECUTED;

        // Store executed trade
        const executedTrade = {
            symbol: stock.symbol,
            strategy: strategy.name,
            signalDate: currentDate,
            signalPrice,
            entryDate: nextCandle.timestamp,
            entryPrice,
            exitDate: tradeResult.exit.date,
            exitPrice: lifecycle.exitPrice,
            partialExit: tradeResult.partialExit,
            trailingExit: tradeResult.trailingExit,
            pnl: tradeResult.pnl,
            holdingDays: tradeResult.holdingDays,
            exitReason: tradeResult.exit.reason,
            result: tradeResult.pnl > 0 ? 'WIN' : 'LOSS',
            lifecycle
        };

        this.executedTrades.push(executedTrade);

        return executedTrade;
    }

    /**
     * Add exhaustion-specific indicators
     */
    addExhaustionIndicators(indicators, candles) {
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];

        // Lower wick percentage
        const candleRange = lastCandle.high - lastCandle.low;
        const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
        indicators.lowerWickPct = candleRange > 0 ? (lowerWick / candleRange) * 100 : 0;

        // Volume vs average
        const recentCandles = candles.slice(-20);
        const avgVolume = recentCandles.reduce((s, c) => s + c.volume, 0) / recentCandles.length;
        indicators.volumeVsAvg = avgVolume > 0 ? lastCandle.volume / avgVolume : 1;

        // RSI previous (for divergence)
        if (prevCandle) {
            const prevIndicators = TechnicalAnalysis.getMarketContext(candles.slice(0, -1));
            indicators.rsi14_prev = prevIndicators?.rsi14 || null;
        }

        // New low checks
        const last5 = candles.slice(-5);
        const lookback20 = candles.slice(-25, -5);
        const recentLow5 = Math.min(...last5.map(c => c.low));
        const prior20Low = lookback20.length > 0 ? Math.min(...lookback20.map(c => c.low)) : recentLow5;

        indicators.recentNewLow = recentLow5 < prior20Low * 0.99;
        indicators.aboveRecentLow = lastCandle.close > recentLow5;
        indicators.newLow = lastCandle.low < prior20Low;
        indicators.holdingAboveLow = !indicators.newLow && indicators.aboveRecentLow;

        // Close position
        const closePosition = candleRange > 0 ? (lastCandle.close - lastCandle.low) / candleRange : 0.5;
        indicators.closeNearHigh = closePosition > 0.7;
    }

    /**
     * Run full simulation for a category
     */
    async runCategorySimulation(categoryKey, stocks, options = {}) {
        console.log(`\n🎯 [RealisticSim] Starting simulation for ${categoryKey}`);
        console.log(`   Stocks: ${stocks.length}`);
        console.log(`   Validity: ${this.config.swingValidityDays} trading days`);
        console.log(`   Delay: ${this.config.swingDelayMinutes} minutes\n`);

        // Get strategies for category
        const strategies = CategoryFilteredCatalogue.buildForCategory(categoryKey);
        console.log(`   Strategies: ${strategies.length}\n`);

        // Reset results
        this.executedTrades = [];
        this.invalidatedSignals = [];
        this.missedEntries = [];
        this.expiredStocks = [];
        this.trappedSignals = [];
        this.logs = [];

        for (const stock of stocks) {
            // Get candles
            const candles = await this.getCandlesForStock(stock.symbol);
            if (!candles || candles.length < 50) {
                this.log(stock.symbol, 'INSUFFICIENT_DATA', `Only ${candles?.length || 0} candles available (need 50+)`);
                continue;
            }

            // PHASE 1: Check stock validity (skip in backtest mode)
            if (!this.config.backtestMode) {
                // For backtest, we use the first available date as "current"
                const simulationDate = candles[50]?.timestamp;
                const validityCheck = this.isStockValid(stock, categoryKey, simulationDate);

                if (!validityCheck.valid) {
                    this.expiredStocks.push({
                        symbol: stock.symbol,
                        reason: validityCheck.reason,
                        tradingDays: validityCheck.tradingDays
                    });
                    continue;
                }
            } else {
                this.log(stock.symbol, 'BACKTEST_MODE', 'Validity check skipped (backtest mode)');
            }

            // Test each strategy
            for (const strategy of strategies) {
                // Time-travel: test at multiple historical points
                for (let D = 50; D < candles.length - 10; D++) {
                    const result = await this.simulateAtDate(stock, strategy, candles, D, categoryKey);
                    // Results are stored in class properties
                }
            }
        }

        // Return comprehensive results
        return this.getResults();
    }

    /**
     * Get comprehensive results
     */
    getResults() {
        const totalSignals = this.executedTrades.length + this.invalidatedSignals.length;
        const wins = this.executedTrades.filter(t => t.result === 'WIN').length;
        const losses = this.executedTrades.filter(t => t.result === 'LOSS').length;

        return {
            summary: {
                totalSignalsGenerated: totalSignals,
                executedTrades: this.executedTrades.length,
                invalidatedSignals: this.invalidatedSignals.length,
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
            expiredStocks: this.expiredStocks,
            trappedSignals: this.trappedSignals,
            logs: this.logs
        };
    }

    /**
     * Get candles for a stock
     */
    async getCandlesForStock(symbol) {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return null;

        let data = cached.data;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return null;
            }
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
