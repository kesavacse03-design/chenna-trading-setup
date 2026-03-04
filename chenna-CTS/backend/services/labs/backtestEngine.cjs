/**
 * Time-Travel Backtest Engine
 * 
 * Simulates trading strategy day-by-day from a historical date to present.
 * Key features:
 * - NO FUTURE DATA LEAKAGE: Each day only sees data available on that day
 * - Capital management: Track available vs deployed capital
 * - Position management: Track active positions, exits (target/stop/Day3)
 * - Trade recording: Save every trade to database for analysis
 * 
 * CRITICAL: This engine uses the SAME signal generator as live trading!
 * Backtest results are trustworthy because both use signalGeneratorV2.
 */

const prisma = require('../../lib/prisma.cjs');
const priceService = require('../priceService.cjs');
const { v4: uuidv4 } = require('uuid');
const { calculateTrailingStop } = require('../stopLossCalculator.cjs');
const { generateCategorySignals } = require('./signalGeneratorV2.cjs');
const strategyManager = require('./strategyManager.cjs');
const { getMarketRegime, shouldAllowEntry } = require('../regimeService.cjs');
const fs = require('fs');
const path = require('path');

function logDebug(msg) {
    try {
        const logPath = 'D:/chenna-trading-system-dashboard/chenna-CTS/backend/logs/backtest_debug.txt';
        const timestamp = new Date().toISOString();
        if (!fs.existsSync(path.dirname(logPath))) {
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
        }
        fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
    } catch (e) {
        // ignore
    }
    console.log(msg);
}

/**
 * CRITICAL: Convert Date to IST date string (YYYY-MM-DD).
 * 
 * Upstox candles use IST timestamps (T00:00:00+05:30).
 * JavaScript's toISOString() converts to UTC, which shifts IST midnight
 * to the PREVIOUS day (18:30 UTC). This causes ALL date comparisons
 * and cache lookups to be off by one day.
 * 
 * This function adds 5h30m offset before extracting the date string,
 * ensuring we always get the correct IST date.
 */
function toISTDateString(date) {
    const d = new Date(date);
    // Add IST offset (5h 30m = 330 minutes) to get IST date
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

// Trading days (weekdays only, excluding weekends)
function getTradingDays(startDate, endDate) {
    const days = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
        const dayOfWeek = current.getDay();
        // 0 = Sunday, 6 = Saturday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            days.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }

    return days;
}

// Get price tier based on price
function getPriceTier(price, config) {
    const tiers = config.priceTiers || {};

    if (price < (tiers.tier1?.maxPrice || 200)) {
        return { tier: 1, name: 'Low-Price Premium', multiplier: tiers.tier1?.positionMultiplier || 1.5 };
    } else if (price < (tiers.tier2?.maxPrice || 1000)) {
        return { tier: 2, name: 'Mid-Price Standard', multiplier: tiers.tier2?.positionMultiplier || 1.0 };
    } else {
        return { tier: 3, name: 'High-Price Caution', multiplier: tiers.tier3?.positionMultiplier || 0.75 };
    }
}

// Calculate position size based on mode
function calculatePositionSize(config, tier, availableCapital) {
    const { positionSizing } = config;

    if (positionSizing.type === 'fixed') {
        // Fixed amount per trade
        const amount = positionSizing.amount || 10000;
        return Math.min(amount * tier.multiplier, availableCapital);
    } else if (positionSizing.type === 'percentage') {
        // Percentage of capital
        const percent = positionSizing.percent || 10;
        return Math.min((availableCapital * percent / 100) * tier.multiplier, availableCapital);
    } else if (positionSizing.type === 'kelly') {
        // Kelly criterion (25% of optimal)
        const kellyFraction = 0.25;
        const winRate = 0.75;
        const avgWin = 0.02;
        const avgLoss = 0.015;
        const kelly = (winRate * avgWin - (1 - winRate) * avgLoss) / avgLoss;
        const adjustedKelly = kelly * kellyFraction;
        return Math.min((availableCapital * adjustedKelly) * tier.multiplier, availableCapital);
    }

    return Math.min(10000 * tier.multiplier, availableCapital);
}

/**
 * Strategy Blueprint v3 Watchlist Processor
 * Tracks signals for up to 5 days looking for pullback.
 * Enter on Day 3 Open if D+1 Low held above Signal Low.
 */
async function processWatchlist(portfolio, currentDate, run, config, backtestRunId) {
    const isStSwingBoUp = run.categoryKey === 'SHORT_TERM_SWING_BO_UP';
    if (!isStSwingBoUp) return []; // Should not happen but just in case

    const triggeredSignals = [];
    const activeWatchlist = [];
    const dateStr = toISTDateString(currentDate);

    // Fetch macro regime for Nifty 20-EMA block rule
    let isNiftyBearish = false;
    let niftyPrice = 0, niftyEMA20 = 0;
    try {
        const regime = await getMarketRegime(currentDate);
        if (regime && regime.niftyPrice && regime.niftyEMA20) {
            niftyPrice = regime.niftyPrice;
            niftyEMA20 = regime.niftyEMA20;
            if (niftyPrice < niftyEMA20) {
                isNiftyBearish = true;
            }
        }
    } catch (e) {
        console.log(`[Watchlist] ⚠️ Error fetching market regime for ${dateStr}: ${e.message}`);
    }

    for (let i = 0; i < portfolio.watchlist.length; i++) {
        const item = portfolio.watchlist[i];
        item.daysOnWatchlist++;

        // Timeout 5 days
        if (item.daysOnWatchlist > 5) {
            console.log(`[Watchlist] ⏰ Expired: ${item.symbol} reached Day 5 without valid pullback.`);
            continue;
        }

        try {
            const stock = await prisma.stock.findUnique({ where: { symbol: item.symbol } });
            if (!stock?.instrumentKey) continue;

            // Fetch exactly yesterday's candle (T) to evaluate entry on today's Open (T+1)
            // But actually we just need today's Open right now for execution, and yesterday's Low for structure
            // Fetch everything from Signal Date to Today
            const nextDate = new Date(currentDate);
            nextDate.setDate(nextDate.getDate() + 1);

            const priceData = await priceService.fetchPrice(item.symbol, stock.instrumentKey, item.signalDateStr, toISTDateString(nextDate));
            if (!priceData || priceData.length === 0) {
                activeWatchlist.push(item);
                continue;
            }

            // CRITICAL BUG FIX: Ensure priceData is sorted chronologically!
            // Upstox returns data descending (newest first). If not sorted, todayIndex = 0,
            // and structural low only checks 1 day, resulting in a tiny risk that clamps to 4%.
            priceData.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

            const todayIndex = priceData.findIndex(c => {
                const ts = String(c.timestamp || c.date || '');
                return (ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0]) === dateStr;
            });

            const todayCandle = todayIndex !== -1 ? priceData[todayIndex] : null;
            const yesterdayCandle = todayIndex > 0 ? priceData[todayIndex - 1] : null;

            if (!todayCandle || !todayCandle.open) {
                activeWatchlist.push(item);
                continue; // Cannot enter if today's price is not available
            }

            // Find signal day low
            const sigCandle = priceData.find(c => String(c.timestamp || c.date || '').includes(item.signalDateStr)) || priceData[0];
            const signalLow = sigCandle ? sigCandle.low : item.entryPrice;

            // BUG 2 COMPLETE FIX: Structural Low must only look at the PULLBACK days, NOT the massive Signal Day candle.
            // Start at index 1 (T+1) up to todayIndex (exclusive, since we are executing at today's Open).
            const pullbackCandles = todayIndex > 1 ? priceData.slice(1, todayIndex) : [];
            if (pullbackCandles.length > 0) {
                item.structuralLow = Math.min(...pullbackCandles.map(c => c.low));
            } else {
                item.structuralLow = signalLow; // Fallback entirely to signal low if T+1 has no data
            }

            // Wait until exactly Day 2 or Day 3 to evaluate pullback rule.
            // (daysOnWatchlist=1 is T+1. daysOnWatchlist=2 is T+2 open, etc).
            if (item.daysOnWatchlist >= 2) {
                // Determine structure stop % BEFORE entry
                let rawRiskPct = (todayCandle.open - item.structuralLow) / todayCandle.open;

                // Blueprint constraints: Max 4.0%, Min 1.5%
                let riskPct = Math.max(0.015, Math.min(rawRiskPct, 0.040));

                if (item.symbol === 'DMART' || item.symbol === 'TATASTEEL') {
                    console.log(`[DEBUG-RISK] ${item.symbol} D+${item.daysOnWatchlist}: Open=${todayCandle.open}, StrLow=${item.structuralLow}, RawRisk=${(rawRiskPct * 100).toFixed(2)}%, FinalRisk=${(riskPct * 100).toFixed(2)}%`);
                }

                const gapPct = ((todayCandle.open - item.entryPrice) / item.entryPrice) * 100;
                const aboveSignalClose = ((todayCandle.open - item.entryPrice) / item.entryPrice) * 100;

                // Entry Gates: Gap < 2%, Entry < 3% above signal, Day=2 (T+2) or Day=3
                if (gapPct < 2.0 && aboveSignalClose < 3.0) {
                    if (isNiftyBearish) {
                        console.log(`[Watchlist] 🛑 Macro Block ${item.symbol}: Nifty (₹${niftyPrice.toFixed(0)}) < 20-EMA (₹${niftyEMA20.toFixed(0)}). Holding cash.`);
                        continue; // Do not enter long when broad market is in downtrend
                    }
                    // Structure Stop = Entry - Risk%
                    const calculatedStop = todayCandle.open * (1 - riskPct);

                    // Fixed Risk 1000 INR
                    const fixedRiskLimit = 1000;
                    const positionCapitalReq = fixedRiskLimit / riskPct;

                    item.stopPrice = Math.round(calculatedStop * 100) / 100;
                    item.targetPrice = Math.round(todayCandle.open * (1 + riskPct * 2.5) * 100) / 100; // 2.5x RR

                    // Update the signal entry price to today's Open since we are entering TODAY.
                    item.entryPrice = todayCandle.open;
                    item.suggestedPositionSize = positionCapitalReq;
                    item.isWatchlistEntry = true;
                    item.initialRisk = riskPct;

                    console.log(`[Watchlist] ✅ Entry Triggered: ${item.symbol} on Day ${item.daysOnWatchlist} (Open ₹${todayCandle.open}). Risk=${(riskPct * 100).toFixed(1)}%, Stop=₹${item.stopPrice}`);


                    // Fixed Bug: ONLY push triggered signals, DO NOT put them back in the active watchlist
                    triggeredSignals.push(item);
                    continue; // Done with this signal, correctly loop to next item
                } else {
                    // Conditions not met yet, keep watching...
                    console.log(`[Watchlist] ⏳ Holding: ${item.symbol} D+${item.daysOnWatchlist}. Gap=${gapPct.toFixed(1)}%`);
                }
            }
            // Put it back in the watchlist for tomorrow if it didn't trigger AND didn't expire
            activeWatchlist.push(item);

        } catch (e) {
            console.log(`[Watchlist] ⚠️ Error on ${item.symbol}: ${e.message}`);
            activeWatchlist.push(item);
        }
    }

    portfolio.watchlist = activeWatchlist;
    return triggeredSignals;
}

/**
 * Execute trades based on available capital and execution mode
 */
async function executeTradesForDate(signals, portfolio, run, config, backtestRunId, date) {
    const { executionMode } = run;
    let signalsToTrade = signals;

    // Apply execution mode filtering
    if (executionMode === 'tier1_only') {
        signalsToTrade = signals.filter(s => s.tier === 1);
    } else if (executionMode === 'random_50') {
        signalsToTrade = signals.filter(() => Math.random() > 0.5);
    } else if (executionMode === 'conservative') {
        // Max 3 positions at once
        const maxPositions = 3;
        const availableSlots = maxPositions - portfolio.activePositions.length;
        signalsToTrade = signals.slice(0, Math.max(0, availableSlots));
    }
    // 'perfect' mode takes all signals

    for (const signal of signalsToTrade) {
        // Skip if already in an open position for this stock
        if (portfolio.activePositions.some(p => p.symbol === signal.symbol)) {
            console.log(`[Backtest] Skipping ${signal.symbol}: already in open position`);
            continue;
        }

        // Get entry price (unified generator uses entryPrice, legacy uses price)
        const price = signal.entryPrice || signal.price;

        // Statistical/perfect mode: bypass capital, use nominal 1-share position
        const isStatistical = run.executionMode === 'perfect';

        // Calculate position size
        const tier = {
            tier: signal.tier,
            name: signal.tierName,
            multiplier: signal.suggestedPositionSize ? 1 : (signal.tierMultiplier || 1)
        };

        let quantity, actualPositionValue;
        if (isStatistical) {
            const posConfig = config.positionSizing || run.positionSizing || { type: 'percent_risk', amount: 4 };
            // Perfect testing mode requires uniform position math
            quantity = Math.floor(portfolio.capital / (posConfig.amount || 10));

            if (posConfig.type === 'percent_risk') {
                const targetRiskCapital = portfolio.capital * ((posConfig.amount || 4) / 100);
                const stopDistInr = Math.abs(signal.entryPrice - signal.stopPrice);
                if (stopDistInr > 0) {
                    quantity = Math.floor(targetRiskCapital / stopDistInr);
                } else {
                    quantity = 1;
                }
            } else {
                quantity = 100;
            }

            // Do not restrict statistical by active capital limit to test pure math
            actualPositionValue = quantity * price;
        } else {
            const positionSize = signal.suggestedPositionSize || calculatePositionSize(run, tier, portfolio.availableCapital);
            if (positionSize < price) {
                console.log(`[Backtest] Skipping ${signal.symbol}: Position size ₹${positionSize} < Price ₹${price}`);
                continue;
            }
            quantity = signal.suggestedQuantity || Math.floor(positionSize / price);
            actualPositionValue = quantity * price;
        }

        // Deduct from available capital (nominal in statistical mode)
        portfolio.availableCapital -= actualPositionValue;
        portfolio.tradeNumber++;

        // Create position (with direction from signal first, then config fallback)
        // SAFETY: signal.direction from actual strategy file takes precedence over config.direction
        const tradeDirection = signal.direction || config.direction || 'LONG';
        if (signal.direction && signal.direction !== config.direction) {
            console.log(`[Backtest] ⚠️ Direction override for ${signal.symbol}: signal=${signal.direction} config=${config.direction} → using signal`);
        }
        const position = {
            id: uuidv4(),
            tradeNumber: portfolio.tradeNumber,
            symbol: signal.symbol,
            tier: signal.tier,
            tierName: signal.tierName,
            direction: tradeDirection,
            signalDate: signal.signalDate || date, // Preserve original signal date
            entryDate: null,  // Day+1: filled on next trading day
            entryPrice: price, // Will be updated to next day's open when available
            targetPrice: signal.targetPrice,
            stopPrice: signal.stopPrice,

            // TRAILING STOP STATE (Added for Intelligent Backtest)
            currentStop: signal.stopPrice,
            highestPrice: price, // Track HOD since entry

            quantity,
            positionValue: actualPositionValue,
            daysHeld: 0,
            pendingEntry: !signal.isWatchlistEntry // Flag: needs Day+1 if not Watchlist
        };

        if (signal.isWatchlistEntry) {
            position.entryDate = date; // Already established via processWatchlist
        }

        portfolio.activePositions.push(position);
        console.log(`[Backtest] ✅ Trade opened: ${signal.symbol} @ ₹${price} x ${quantity} = ₹${actualPositionValue.toLocaleString()}`);

        // Record trade entry to database
        await prisma.backtestTrade.create({
            data: {
                backtestRun: { connect: { id: backtestRunId } },
                tradeNumber: position.tradeNumber,
                symbol: position.symbol,
                tier: position.tier,
                tierName: position.tierName,
                signalDate: position.signalDate,
                entryDate: position.entryDate || date, // Properly track Day 3 entry or fallback to current date
                entryPrice: position.entryPrice,
                targetPrice: position.targetPrice,
                stopPrice: position.stopPrice,
                quantity: position.quantity,
                positionValue: position.positionValue
            }
        });
    }

    return portfolio;
}

/**
 * Close a position and record the trade result
 */
async function closePosition(position, exitPrice, exitReason, backtestRunId, exitDate) {
    const isShort = position.direction === 'SHORT';

    // CRITICAL: P&L calculation differs for SHORT vs LONG
    // LONG: Profit when exitPrice > entryPrice (buy low, sell high)
    // SHORT: Profit when exitPrice < entryPrice (sell high, buy low)
    const pnl = isShort
        ? (position.entryPrice - exitPrice) * position.quantity  // SHORT: entry - exit
        : (exitPrice - position.entryPrice) * position.quantity; // LONG: exit - entry

    const pnlPercent = isShort
        ? ((position.entryPrice - exitPrice) / position.entryPrice) * 100
        : ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

    // OPEN positions (BACKTEST_END) are not real wins/losses
    const outcome = exitReason === 'BACKTEST_END' ? 'OPEN' : (pnl > 0 ? 'WIN' : 'LOSS');

    const trade = {
        ...position,
        exitDate,
        exitPrice,
        exitReason,
        pnl,
        pnlPercent,
        outcome
    };

    // Update trade in database
    await prisma.backtestTrade.updateMany({
        where: {
            backtestRunId,
            tradeNumber: position.tradeNumber
        },
        data: {
            exitDate,
            exitPrice,
            exitReason,
            daysHeld: position.daysHeld,
            pnl,
            pnlPercent,
            outcome
        }
    });

    return trade;
}

/**
 * Update positions - check for target/stop/Day3 exits
 */
async function updatePositions(portfolio, currentDate, config, backtestRunId, categoryKey) {
    const maxHoldDays = categoryKey === 'SHORT_TERM_SWING_BO_UP' ? 10 : (config.maxHoldDays || 20);
    const stillActive = [];

    for (const position of portfolio.activePositions) {
        // Day+1 entry: resolve pending entries with today's open price
        if (position.pendingEntry) {
            position.pendingEntry = false;
            position.entryDate = currentDate;

            // Try to get today's open price for realistic Day+1 entry
            try {
                const stock = await prisma.stock.findUnique({ where: { symbol: position.symbol } });
                if (stock?.instrumentKey) {
                    const dateStr = toISTDateString(currentDate);
                    // Add 1 day to fetch range to ensure Upstox includes the target day
                    const nextDate = new Date(currentDate);
                    nextDate.setDate(nextDate.getDate() + 1);
                    const nextDateStr = toISTDateString(nextDate);

                    const priceData = await priceService.fetchPrice(position.symbol, stock.instrumentKey, dateStr, nextDateStr);
                    if (priceData && priceData.length > 0) {
                        // CRITICAL: Find the candle matching TODAY's date, not just priceData[0]
                        const todayCandle = priceData.find(c => {
                            const ts = String(c.timestamp || c.date || '');
                            const candleDate = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
                            return candleDate === dateStr;
                        }) || priceData[priceData.length - 1]; // Fallback to latest

                        const openPrice = todayCandle.open;
                        if (openPrice && openPrice > 0) {
                            // GAP FILTER: Skip entry if open gaps >3% from signal day close
                            const signalClose = position.entryPrice; // This is signal day close
                            const gapPct = Math.abs((openPrice - signalClose) / signalClose) * 100;
                            if (gapPct > 3) {
                                console.log(`[Backtest] ❌ SKIP ${position.symbol}: Gap ${gapPct.toFixed(1)}% (Signal ₹${signalClose} → Open ₹${openPrice}) — too large!`);
                                // Release capital and remove position
                                portfolio.availableCapital += position.positionValue;
                                portfolio.tradeNumber--;
                                // Delete the placeholder DB record
                                await prisma.backtestTrade.deleteMany({
                                    where: { backtestRunId, tradeNumber: position.tradeNumber }
                                });
                                continue; // Skip — don't add to stillActive
                            }

                            // Recalculate position with actual Day+1 open price
                            const oldPrice = position.entryPrice;
                            position.entryPrice = openPrice;
                            position.highestPrice = openPrice;
                            position.positionValue = position.quantity * openPrice;

                            // Recalculate target/stop proportionally
                            if (position.targetPrice && oldPrice > 0) {
                                const targetPct = (position.targetPrice - oldPrice) / oldPrice;
                                position.targetPrice = Math.round(openPrice * (1 + targetPct) * 100) / 100;
                            }
                            if (position.stopPrice && oldPrice > 0) {
                                const stopPct = (oldPrice - position.stopPrice) / oldPrice;
                                position.stopPrice = Math.round(openPrice * (1 - stopPct) * 100) / 100;
                                position.currentStop = position.stopPrice;
                            }

                            console.log(`[Backtest] ${position.symbol}: Day+1 entry ₹${oldPrice} → ₹${openPrice} (Gap: ${gapPct.toFixed(1)}%)`);
                        }
                    }
                }
            } catch (e) {
                console.log(`[Backtest] ⚠️ Day+1 fetch failed for ${position.symbol}: ${e.message}`);
            }

            // Update DB record with actual entry date, price, target, stop
            await prisma.backtestTrade.updateMany({
                where: { backtestRunId, tradeNumber: position.tradeNumber },
                data: {
                    entryDate: currentDate,
                    entryPrice: position.entryPrice,
                    targetPrice: position.targetPrice,
                    stopPrice: position.stopPrice,
                    positionValue: position.positionValue
                }
            });

            stillActive.push(position);
            continue;
        }
        position.daysHeld++;

        // Fetch today's price for the stock
        const dateStr = toISTDateString(currentDate);
        let exitPrice = null;
        let exitReason = null;

        try {
            // Get stock info for instrument key
            const stock = await prisma.stock.findUnique({
                where: { symbol: position.symbol }
            });

            if (stock?.instrumentKey) {
                // Add 1 day to fetch range to ensure Upstox includes the target day
                const nextDate = new Date(currentDate);
                nextDate.setDate(nextDate.getDate() + 1);
                const nextDateStr = toISTDateString(nextDate);

                const priceData = await priceService.fetchPrice(
                    position.symbol,
                    stock.instrumentKey,
                    dateStr,
                    nextDateStr
                );

                if (priceData && priceData.length > 0) {
                    // CRITICAL: Find candle matching today's date, not blindly priceData[0]
                    const todayCandle = priceData.find(c => {
                        const ts = String(c.timestamp || c.date || '');
                        const candleDate = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
                        return candleDate === dateStr;
                    }) || priceData[priceData.length - 1];
                    const isShort = position.direction === 'SHORT';

                    // UPDATE TRAILING STOP (LONG ONLY FOR NOW)
                    if (!isShort) {
                        // Update highest price seen since entry
                        if (todayCandle.high > position.highestPrice) {
                            position.highestPrice = todayCandle.high;
                        }

                        // 3-PHASE TRAILING STOP LOGIC (ST_SWING_BO_UP)
                        if (categoryKey === 'SHORT_TERM_SWING_BO_UP') {
                            // Phase 1 (Days 1-3 holding): Hard stop at initial entry. (Handled automatically)

                            // Phase 2 (Days 4-5 holding): Breathing Breakeven Trail
                            if (position.daysHeld >= 4 && position.daysHeld <= 5) {
                                if (position.highestPrice >= position.entryPrice * 1.015 && position.currentStop < position.entryPrice * 0.99) {
                                    // Bug 1 Fix: Trail to Entry - 1% instead of exactly breakeven to stop whipsawing
                                    position.currentStop = position.entryPrice * 0.99;
                                }
                            }
                            // Phase 3 (Days 6-10 holding): Profit Trail (Previous Day Low)
                            else if (position.daysHeld >= 6) {
                                // Since todayCandle is evaluated AFTER the close, its low becomes the new stop for tomorrow
                                // Use a 1.0% buffer below the low to prevent exact stop outs
                                if (todayCandle.low * 0.99 > position.currentStop) {
                                    position.currentStop = todayCandle.low * 0.99;
                                }
                            }
                            position.stopPrice = position.currentStop;
                        } else {
                            // Calculate new trailing stop (Generic)
                            const trailUpdate = calculateTrailingStop({
                                entryPrice: position.entryPrice,
                                currentStop: position.currentStop,
                                highestPrice: position.highestPrice,
                                trailPct: 0.03,      // 3% Trail
                                activationPct: 0.015, // Activate after +1.5%
                                breakevenPct: 0.02   // Breakeven after +2%
                            });

                            if (trailUpdate.action !== 'NO_CHANGE') {
                                position.currentStop = trailUpdate.newStop;
                            }
                            // Sync main stopPrice for display
                            position.stopPrice = position.currentStop;
                        }
                    }

                    // Check returns/stops
                    // CRITICAL: SHORT and LONG have opposite logic!
                    if (isShort) {
                        // SHORT: Target hit when LOW reaches target (price went DOWN = profit)
                        // SHORT: Stop hit when HIGH reaches stop (price went UP = loss)
                        if (todayCandle.low <= position.targetPrice) {
                            exitPrice = position.targetPrice;
                            exitReason = 'TARGET';
                        } else if (todayCandle.high >= position.stopPrice) {
                            exitPrice = position.stopPrice;
                            exitReason = 'STOP';
                        } else if (position.daysHeld >= maxHoldDays) {
                            exitPrice = todayCandle.close;
                            exitReason = 'TIME_EXHAUSTION';
                        }
                    } else {
                        // LONG: Target hit when HIGH reaches target (price went UP = profit)
                        // LONG: Stop hit when LOW reaches stop (price went DOWN = loss)

                        // Check Target first (Optimistic: if hit, take profit)
                        if (todayCandle.high >= position.targetPrice) {
                            exitPrice = position.targetPrice;
                            exitReason = 'TARGET';
                        }
                        // Check Stop (Trailing or Initial)
                        else if (todayCandle.low <= position.currentStop) {
                            exitPrice = position.currentStop;
                            exitReason = 'STOP'; // Could be Trailing or Initial
                            if (position.currentStop > position.entryPrice) {
                                exitReason = 'TRAILING_STOP_PROFIT';
                            }
                        }
                        // Check Time Exit
                        else if (position.daysHeld >= maxHoldDays) {
                            exitPrice = todayCandle.close;
                            exitReason = 'TIME_EXHAUSTION';
                        }
                    }
                }
            }
        } catch (e) {
            // If no price data, check Day 3 rule only
            if (position.daysHeld >= maxHoldDays) {
                exitPrice = position.entryPrice; // Assume flat exit
                exitReason = 'TIME_EXHAUSTION';
            }
        }

        if (exitPrice && exitReason) {
            // Close the position
            const trade = await closePosition(position, exitPrice, exitReason, backtestRunId, currentDate);
            portfolio.closedPositions.push(trade);
            portfolio.availableCapital += position.positionValue + (trade.pnl || 0);
            portfolio.capital += trade.pnl || 0;
        } else {
            stillActive.push(position);
        }
    }

    portfolio.activePositions = stillActive;
    return portfolio;
}

/**
 * Main simulation function
 * Runs day-by-day from startDate to endDate
 */
async function runBacktest(backtestRunId) {
    const backtestStartTime = Date.now();
    logDebug(`[Backtest] Starting backtest run: ${backtestRunId}`);

    // Load the backtest configuration
    const run = await prisma.backtestRun.findUnique({
        where: { id: backtestRunId }
    });

    if (!run) {
        throw new Error(`Backtest run not found: ${backtestRunId}`);
    }

    // Load category configuration from Strategy Manager (Single Source of Truth)
    let config;
    try {
        config = strategyManager.getStrategyConfig(run.categoryKey);
    } catch (e) {
        console.error(`[Backtest] Error loading strategy config: ${e.message}`);
        throw e;
    }

    if (!config) {
        throw new Error(`Category config not found: ${run.categoryKey}`);
    }

    // Update status to running
    await prisma.backtestRun.update({
        where: { id: backtestRunId },
        data: {
            status: 'running',
            startedAt: new Date(),
            progress: 0
        }
    });

    // Get all trading days in range
    const tradingDays = getTradingDays(run.startDate, run.endDate);
    console.log(`[Backtest] Simulating ${tradingDays.length} trading days (mode: ${run.executionMode})`);
    let signalGenTime = 0, posUpdateTime = 0, dbWriteTime = 0;
    const allSkipReports = [];
    let totalStocksChecked = 0;
    const isStatisticalMode = run.executionMode === 'perfect';

    // Portfolio state
    let portfolio = {
        capital: run.startingCapital,
        availableCapital: run.startingCapital,
        activePositions: [],
        closedPositions: [],
        watchlist: [],
        tradeNumber: 0,
        totalSignals: 0,
        peakCapital: run.startingCapital,
        maxDrawdown: 0
    };

    // Monthly returns tracking
    const monthlyReturns = {};
    let lastMonthCapital = run.startingCapital;
    let lastMonth = null;

    try {
        // Simulate each trading day
        for (let i = 0; i < tradingDays.length; i++) {
            const currentDate = tradingDays[i];
            const dayOfWeek = currentDate.getDay();
            const month = currentDate.getMonth() + 1;
            const monthKey = `${currentDate.getFullYear()}-${String(month).padStart(2, '0')}`;

            // Track monthly returns
            if (lastMonth && lastMonth !== monthKey) {
                const monthReturn = ((portfolio.capital - lastMonthCapital) / lastMonthCapital) * 100;
                monthlyReturns[lastMonth] = monthReturn;
                lastMonthCapital = portfolio.capital;
            }
            lastMonth = monthKey;

            // Update progress
            const progress = ((i + 1) / tradingDays.length) * 100;
            if (i % 10 === 0) {
                await prisma.backtestRun.update({
                    where: { id: backtestRunId },
                    data: {
                        progress: Math.round(progress * 10) / 10,
                        currentDate,
                        totalSignals: portfolio.totalSignals,
                        totalTrades: portfolio.closedPositions.length + portfolio.activePositions.length
                    }
                });
            }

            // STEP 1: Check and close positions that hit target/stop/Day3
            const t1 = Date.now();
            portfolio = await updatePositions(portfolio, currentDate, config, backtestRunId, run.categoryKey);
            posUpdateTime += Date.now() - t1;

            // Track drawdown
            if (portfolio.capital > portfolio.peakCapital) {
                portfolio.peakCapital = portfolio.capital;
            }
            const drawdown = ((portfolio.peakCapital - portfolio.capital) / portfolio.peakCapital) * 100;
            if (drawdown > portfolio.maxDrawdown) {
                portfolio.maxDrawdown = drawdown;
            }

            // STEP 2: Check if today is a valid signal day (Thu/Fri for SHORT_TERM_SWING_BO_DOWN)
            const validDays = config.validDays || [1, 2, 3, 4, 5]; // Default: Mon-Fri
            const avoidMonths = config.avoidMonths || []; // Default: None

            const isValidDay = validDays.includes(dayOfWeek);
            const isAvoidMonth = avoidMonths.includes(month);
            const isLastDay = (i === tradingDays.length - 1);

            if (!isValidDay || isAvoidMonth) {
                continue; // Skip signal generation on non-valid days
            }

            // PRO TRADER FIX: Don't generate signals on the last backtest day
            // because there's no Day+1 to enter on. Entry would use signal close
            // instead of next day's open — WRONG PRICE.
            if (isLastDay) {
                logDebug(`[Backtest] Skipping signal gen on last day ${toISTDateString(currentDate)} — no Day+1 to enter`);
                continue;
            }

            // ═══ GATE 1: MARKET REGIME (NIFTY HEALTH CHECK) ═══
            // If NIFTY is bearish + volatile, skip ALL long entries
            // This single gate would have saved capital on Feb 24 crash (-1.2%)
            try {
                const regime = await getMarketRegime(currentDate, run.categoryKey);
                const direction = config.direction || 'LONG';

                if (direction === 'LONG' && !shouldAllowEntry(regime, 'swing')) {
                    console.log(`[Backtest] 🚫 NIFTY GATE: ${regime.niftyTrend} (NIFTY ${regime.niftyPrice?.toFixed(0) || '?'} vs SMA50 ${regime.niftySMA50?.toFixed(0) || '?'}) | Breadth: ${(regime.breadth * 100).toFixed(0)}% | Vol: ${regime.volatilityState} — SKIPPING LONGS`);
                    continue;
                } else {
                    logDebug(`[Backtest] ✅ NIFTY GATE: ${regime.niftyTrend} (Score: ${regime.regimeScore}) — entries allowed`);
                }
            } catch (regimeErr) {
                logDebug(`[Backtest] ⚠️ Regime check failed: ${regimeErr.message} — proceeding anyway`);
            }

            // STEP 3: Generate signals using SAME function as live trading!
            logDebug(`[Backtest] Generating signals for ${currentDate.toISOString()} (Valid: ${isValidDay}, Avoid: ${isAvoidMonth})`);

            // Critical: backtestMode=true uses category-aware date filter
            const t2 = Date.now();
            const signalResult = await generateCategorySignals(
                run.categoryKey,
                currentDate,
                run.startingCapital,
                true,  // backtestMode = true
                isStatisticalMode  // unlimitedMode: take all signals in statistical mode
            );
            signalGenTime += Date.now() - t2;

            // Extract signals from result
            const signals = signalResult.signals || [];
            logDebug(`[Backtest] Generated ${signals.length} signals`);
            portfolio.totalSignals += signals.length;

            // Accumulate skip reports for transparency
            if (signalResult.skipReport && signalResult.skipReport.length > 0) {
                const dateStr = toISTDateString(currentDate);
                allSkipReports.push(...signalResult.skipReport.map(s => ({
                    ...s, date: dateStr
                })));
            }
            if (signalResult.summary) {
                totalStocksChecked += signalResult.summary.totalStocksChecked || 0;
            }

            const evaluatedSignals = await processWatchlist(portfolio, currentDate, run, config, backtestRunId);
            for (const sig of signals) {
                // Ensure we don't push duplicates that triggered on the same day repeatedly
                if (!portfolio.watchlist.some(w => w.symbol === sig.symbol)) {
                    sig.signalDateStr = toISTDateString(currentDate);
                    sig.signalDate = new Date(currentDate);
                    sig.daysOnWatchlist = 0;
                    sig.structuralLow = sig.entryPrice || sig.price;
                    sig.entryPrice = sig.entryPrice || sig.price; // Critical fallback for open
                    portfolio.watchlist.push(sig);
                }
            }

            // STEP 4: Execute trades based on execution mode (merged evaluated watchlist + intraday signals)
            const allExecutable = run.categoryKey === 'SHORT_TERM_SWING_BO_UP' ? evaluatedSignals : signals.map(s => ({ ...s, backtestRunId }));
            if (allExecutable.length > 0) {
                portfolio = await executeTradesForDate(allExecutable, portfolio, run, config, backtestRunId, currentDate);
            }
        }

        // Final monthly return
        if (lastMonth) {
            const monthReturn = ((portfolio.capital - lastMonthCapital) / lastMonthCapital) * 100;
            monthlyReturns[lastMonth] = monthReturn;
        }

        // Close any remaining positions as OPEN (still holding — show unrealized P&L)
        const lastDay = tradingDays[tradingDays.length - 1];
        for (const position of portfolio.activePositions) {
            // PRO TRADER FIX: Use last day's close for unrealized P&L, not entry price
            let exitPrice = position.entryPrice; // fallback
            try {
                const stock = await prisma.stock.findUnique({ where: { symbol: position.symbol } });
                if (stock?.instrumentKey) {
                    const lastDateStr = toISTDateString(lastDay);
                    const nextDate = new Date(lastDay);
                    nextDate.setDate(nextDate.getDate() + 1);
                    const nextDateStr = toISTDateString(nextDate);
                    const priceData = await priceService.fetchPrice(
                        position.symbol, stock.instrumentKey, lastDateStr, nextDateStr
                    );
                    if (priceData && priceData.length > 0) {
                        const lastCandle = priceData.find(c => {
                            const ts = String(c.timestamp || c.date || '');
                            return (ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0]) === lastDateStr;
                        }) || priceData[priceData.length - 1];
                        if (lastCandle && lastCandle.close > 0) {
                            exitPrice = lastCandle.close;
                        }
                    }
                }
            } catch (e) {
                // Keep entry price as fallback
            }
            const trade = await closePosition(position, exitPrice, 'BACKTEST_END', backtestRunId, lastDay);
            portfolio.closedPositions.push(trade);
            portfolio.availableCapital += position.positionValue + (trade.pnl || 0);
            portfolio.capital += trade.pnl || 0;
        }
        portfolio.activePositions = [];
        portfolio.watchlist = [];

        // Performance timing report
        const totalTime = Date.now() - backtestStartTime;
        console.log(`[Backtest] ⏱️ Performance: Total=${(totalTime / 1000).toFixed(1)}s | SignalGen=${(signalGenTime / 1000).toFixed(1)}s | PosUpdate=${(posUpdateTime / 1000).toFixed(1)}s`);

        // Calculate final statistics
        const winningTrades = portfolio.closedPositions.filter(t => t.outcome === 'WIN').length;
        const losingTrades = portfolio.closedPositions.filter(t => t.outcome === 'LOSS').length;
        const openTrades = portfolio.closedPositions.filter(t => t.outcome === 'OPEN').length;
        const totalTrades = portfolio.closedPositions.length;
        const completedTrades = winningTrades + losingTrades; // Exclude OPEN from win rate
        const winRate = completedTrades > 0 ? (winningTrades / completedTrades) * 100 : 0;
        const totalReturn = portfolio.capital - run.startingCapital;
        const returnPercent = (totalReturn / run.startingCapital) * 100;

        // Calculate Sharpe ratio (simplified - assuming daily check, but monthly returns used here)
        const dailyReturns = Object.values(monthlyReturns);
        const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length || 0;
        const stdDev = Math.sqrt(dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length) || 1;
        const sharpeRatio = (avgReturn * 12) / (stdDev * Math.sqrt(12)); // Annualized roughly

        // Update backtest run with results
        await prisma.backtestRun.update({
            where: { id: backtestRunId },
            data: {
                status: 'complete',
                progress: 100,
                completedAt: new Date(),
                totalDays: tradingDays.length,
                totalSignals: portfolio.totalSignals,
                totalTrades,
                winningTrades,
                losingTrades,
                winRate: Math.round(winRate * 100) / 100,
                totalReturn: Math.round(totalReturn),
                returnPercent: Math.round(returnPercent * 100) / 100,
                maxDrawdown: Math.round(portfolio.maxDrawdown * 100) / 100,
                sharpeRatio: Math.round(sharpeRatio * 100) / 100,
                results: {
                    monthlyReturns,
                    finalCapital: portfolio.capital,
                    peakCapital: portfolio.peakCapital,
                    tradesByTier: {
                        tier1: portfolio.closedPositions.filter(t => t.tier === 1).length,
                        tier2: portfolio.closedPositions.filter(t => t.tier === 2).length,
                        tier3: portfolio.closedPositions.filter(t => t.tier === 3).length
                    },
                    skipReport: allSkipReports.slice(0, 5000), // Prevent JSON column payload crashes
                    totalStocksChecked,
                    openTrades
                }
            }
        });

        console.log(`[Backtest] Complete! ${totalTrades} trades, ${winRate.toFixed(1)}% win rate, ${returnPercent.toFixed(1)}% return`);

        return {
            success: true,
            totalTrades,
            winRate,
            returnPercent,
            maxDrawdown: portfolio.maxDrawdown
        };

    } catch (error) {
        console.error(`[Backtest] Error: ${error.message}`);

        await prisma.backtestRun.update({
            where: { id: backtestRunId },
            data: {
                status: 'failed',
                errorMessage: error.message
            }
        });

        throw error;
    }
}

/**
 * Start a new backtest run
 */
async function startBacktest(config) {
    const {
        categoryKey,
        strategyVersion = 'V1.0',
        startDate,
        endDate,
        startingCapital,
        positionSizing,
        executionMode = 'perfect'
    } = config;

    // Create backtest run record
    const run = await prisma.backtestRun.create({
        data: {
            categoryKey,
            strategyVersion,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            startingCapital,
            positionSizing,
            executionMode,
            status: 'pending'
        }
    });

    console.log(`[Backtest] Created run ${run.id}`);

    // Start simulation (async - returns immediately)
    setImmediate(() => {
        runBacktest(run.id).catch(err => {
            console.error(`[Backtest] Run ${run.id} failed:`, err.message);
        });
    });

    return run;
}

/**
 * Get backtest progress
 */
async function getProgress(backtestRunId) {
    return prisma.backtestRun.findUnique({
        where: { id: backtestRunId },
        select: {
            id: true,
            status: true,
            progress: true,
            currentDate: true,
            totalSignals: true,
            totalTrades: true,
            errorMessage: true
        }
    });
}

/**
 * Get backtest results
 */
async function getResults(backtestRunId) {
    const run = await prisma.backtestRun.findUnique({
        where: { id: backtestRunId }
    });

    const trades = await prisma.backtestTrade.findMany({
        where: { backtestRunId },
        orderBy: { tradeNumber: 'asc' }
    });

    return {
        run,
        trades
    };
}

module.exports = {
    startBacktest,
    runBacktest,
    getProgress,
    getResults,
    getTradingDays
};
