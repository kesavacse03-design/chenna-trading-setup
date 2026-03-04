/**
 * Production-Grade V2 Strategy Verification (Time-Travel Backtest)
 * 
 * Simulates EXACTLY like real trading:
 * 1. Signal detected → Entry next day open
 * 2. Intelligent ATR-based stop + structure stop
 * 3. Daily trailing stop with activation threshold
 * 4. Breakeven protection after +2%
 * 5. Exit: Stop vs LOW, Target vs HIGH (not close)
 * 
 * Runs 3-way comparison: Fixed % | ATR-Based | ATR + Trailing
 */

const fs = require('fs');
const path = require('path');
const swingBoDown = require('../strategies/swingBoDownLongStrategy.cjs');
const swingBoUp = require('../strategies/swingBoUpLongStrategy.cjs');
const {
    calculateATR,
    findSwingLow,
    calculateIntelligentStop,
    calculateTrailingStop
} = require('../services/stopLossCalculator.cjs');

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const MAX_HOLD_DAYS = 10;
const FIXED_STOP_PCT = 3.5;    // Legacy fixed stop
const FIXED_TARGET_PCT = 6.0;  // Legacy fixed target
const TRAIL_PCT = 0.03;        // 3% trail distance
const TRAIL_ACTIVATION = 0.015; // Trail activates after +1.5%
const BREAKEVEN_PCT = 0.02;    // Move to breakeven after +2%

const DOWN_FILE = path.join(__dirname, '../results/deep_analysis_data.json');
const UP_FILE = path.join(__dirname, '../results/deep_analysis_st_up_data.json');

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function runVerification() {
    console.log('═'.repeat(70));
    console.log('  PRODUCTION-GRADE V2 STRATEGY VERIFICATION');
    console.log('  3-Way Comparison: Fixed | ATR-Based | ATR + Trailing');
    console.log('═'.repeat(70));

    const downData = fs.existsSync(DOWN_FILE) ? JSON.parse(fs.readFileSync(DOWN_FILE)) : {};
    const upData = fs.existsSync(UP_FILE) ? JSON.parse(fs.readFileSync(UP_FILE)) : {};

    // Run both strategies
    const downResults = await testStrategy('ST_SWING_BO_DOWN', swingBoDown, downData);
    const upResults = await testStrategy('ST_SWING_BO_UP', swingBoUp, upData);

    // Print comparison tables
    printComparisonTable('ST_SWING_BO_DOWN', downResults);
    printComparisonTable('ST_SWING_BO_UP', upResults);

    // Print detailed trade logs for ALL trades from BOTH strategies
    printDetailedTradeLog('ST_SWING_BO_DOWN', downResults.atrTrail);
    printDetailedTradeLog('ST_SWING_BO_UP', upResults.atrTrail);
}

// ═══════════════════════════════════════════════════════════
// STRATEGY TESTER
// ═══════════════════════════════════════════════════════════

async function testStrategy(stratName, stratModule, dataMap) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  TESTING: ${stratName}`);
    console.log(`${'─'.repeat(70)}`);

    const fixedTrades = [];
    const atrTrades = [];
    const atrTrailTrades = [];

    const symbols = Object.keys(dataMap);

    for (const symbol of symbols) {
        const stockData = dataMap[symbol];
        if (!stockData.daily) continue;

        // Sort daily data oldest → newest
        const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const addedDate = stockData.addedDate.split('T')[0];

        // Find signal candle index
        const signalIdx = daily.findIndex(c => c.timestamp.startsWith(addedDate));
        if (signalIdx === -1 || signalIdx < 15) continue; // Need at least 15 for ATR

        // Weekly data
        let weekly = (stockData.weekly || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const signalTime = new Date(addedDate).getTime();
        const pastWeekly = weekly.filter(w => new Date(w.timestamp).getTime() <= signalTime);

        // Nifty data
        let nifty = (stockData.nifty || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const pastNifty = nifty.filter(n => new Date(n.timestamp).getTime() <= signalTime);

        // Slice daily data up to signal date
        const pastDaily = daily.slice(0, signalIdx + 1);

        // Run V2 strategy logic
        const signal = await stratModule.checkSignal(symbol, pastDaily, pastWeekly, pastNifty);
        if (!signal || signal.signal !== 'BUY') continue;

        // Entry = Next day open (Day +1)
        const entryCandle = daily[signalIdx + 1];
        if (!entryCandle) continue;
        const entryPrice = entryCandle.open;
        const entryDate = entryCandle.timestamp.split('T')[0];

        // Future candles for simulation
        const futureCandles = daily.slice(signalIdx + 1, signalIdx + 1 + MAX_HOLD_DAYS);
        if (futureCandles.length < 2) continue;

        // ── METHOD A: FIXED STOP ──
        const fixedResult = simulateTrade({
            symbol, entryPrice, entryDate, futureCandles,
            initialStop: entryPrice * (1 - FIXED_STOP_PCT / 100),
            target: entryPrice * (1 + FIXED_TARGET_PCT / 100),
            enableTrailing: false,
            method: 'FIXED',
            tier: signal.tier,
            reason: signal.reason
        });
        fixedTrades.push(fixedResult);

        // ── METHOD B: ATR-BASED STOP (no trail) ──
        const atrCalc = calculateIntelligentStop({
            entryPrice,
            candles: pastDaily,
            atrMultiplier: 2.0,
            swingLookback: 5,
            rrMultiple: stratName.includes('UP') ? 2.5 : 2.0
        });
        const atrResult = simulateTrade({
            symbol, entryPrice, entryDate, futureCandles,
            initialStop: atrCalc.stopPrice,
            target: atrCalc.targetPrice,
            enableTrailing: false,
            method: 'ATR',
            tier: signal.tier,
            reason: signal.reason,
            atr: atrCalc.atr,
            stopMethod: atrCalc.method
        });
        atrTrades.push(atrResult);

        // ── METHOD C: ATR + TRAILING STOP ──
        const trailResult = simulateTrade({
            symbol, entryPrice, entryDate, futureCandles,
            initialStop: atrCalc.stopPrice,
            target: atrCalc.targetPrice,
            enableTrailing: true,
            trailPct: TRAIL_PCT,
            activationPct: TRAIL_ACTIVATION,
            breakevenPct: BREAKEVEN_PCT,
            method: 'ATR_TRAIL',
            tier: signal.tier,
            reason: signal.reason,
            atr: atrCalc.atr,
            stopMethod: atrCalc.method
        });
        atrTrailTrades.push(trailResult);

        // Log each trade (ATR+Trail method)
        const emoji = trailResult.pnlPct > 0 ? '✅' : '❌';
        console.log(
            `  ${emoji} ${symbol.padEnd(12)} | ` +
            `Entry: ₹${entryPrice.toFixed(0).padStart(6)} | ` +
            `Stop: ${atrCalc.stopPct.toFixed(1)}% (${atrCalc.method.substring(0, 5)}) | ` +
            `Exit: ${trailResult.exitReason.padEnd(14)} | ` +
            `P&L: ${trailResult.pnlPct >= 0 ? '+' : ''}${trailResult.pnlPct.toFixed(2)}% | ` +
            `Days: ${trailResult.daysHeld}`
        );
    }

    return {
        fixed: fixedTrades,
        atr: atrTrades,
        atrTrail: atrTrailTrades
    };
}

// ═══════════════════════════════════════════════════════════
// DAY-BY-DAY TRADE SIMULATION
// ═══════════════════════════════════════════════════════════

function simulateTrade(params) {
    const {
        symbol, entryPrice, entryDate, futureCandles,
        initialStop, target,
        enableTrailing, trailPct, activationPct, breakevenPct,
        method, tier, reason, atr, stopMethod
    } = params;

    let currentStop = initialStop;
    let highestPrice = entryPrice;
    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let daysHeld = 0;
    const dailyLog = [];

    for (let i = 0; i < futureCandles.length; i++) {
        const candle = futureCandles[i];
        daysHeld = i + 1;

        // Track highest price (using HIGH of candle)
        if (candle.high > highestPrice) {
            highestPrice = candle.high;
        }

        // ── CHECK 1: STOP HIT (candle LOW vs currentStop) ──
        if (candle.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = enableTrailing && currentStop > initialStop
                ? (currentStop >= entryPrice ? 'BREAKEVEN' : 'TRAILING_STOP')
                : 'INITIAL_STOP';
            exitDate = candle.timestamp.split('T')[0];

            dailyLog.push({
                day: daysHeld, date: exitDate,
                high: candle.high, low: candle.low, close: candle.close,
                highestPrice, currentStop, action: exitReason
            });
            break;
        }

        // ── CHECK 2: TARGET HIT (candle HIGH vs target) ──
        if (candle.high >= target) {
            exitPrice = target;
            exitReason = 'TARGET';
            exitDate = candle.timestamp.split('T')[0];

            dailyLog.push({
                day: daysHeld, date: exitDate,
                high: candle.high, low: candle.low, close: candle.close,
                highestPrice, currentStop, action: 'TARGET'
            });
            break;
        }

        // ── CHECK 3: TRAILING STOP UPDATE ──
        let stopAction = 'NO_CHANGE';
        if (enableTrailing) {
            const trailCalc = calculateTrailingStop({
                entryPrice,
                currentStop,
                highestPrice,
                trailPct: trailPct || 0.03,
                activationPct: activationPct || 0.015,
                breakevenPct: breakevenPct || 0.02
            });

            if (trailCalc.newStop > currentStop) {
                currentStop = trailCalc.newStop;
                stopAction = trailCalc.action;
            }
        }

        // ── CHECK 4: TIME EXIT (max hold) ──
        if (daysHeld >= MAX_HOLD_DAYS) {
            exitPrice = candle.close;
            exitReason = 'TIME_EXIT';
            exitDate = candle.timestamp.split('T')[0];

            dailyLog.push({
                day: daysHeld, date: exitDate,
                high: candle.high, low: candle.low, close: candle.close,
                highestPrice, currentStop, action: 'TIME_EXIT'
            });
            break;
        }

        // Log daily state
        dailyLog.push({
            day: daysHeld,
            date: candle.timestamp.split('T')[0],
            high: round2(candle.high),
            low: round2(candle.low),
            close: round2(candle.close),
            highestPrice: round2(highestPrice),
            currentStop: round2(currentStop),
            action: stopAction
        });
    }

    // Fallback if loop ends without exit
    if (!exitPrice) {
        const last = futureCandles[futureCandles.length - 1];
        exitPrice = last.close;
        exitReason = 'TIME_EXIT';
        exitDate = last.timestamp.split('T')[0];
    }

    const pnlPct = round2(((exitPrice - entryPrice) / entryPrice) * 100);
    const maxFavorable = round2(((highestPrice - entryPrice) / entryPrice) * 100);
    const maxAdverse = round2(((Math.min(...futureCandles.slice(0, daysHeld).map(c => c.low)) - entryPrice) / entryPrice) * 100);

    return {
        symbol,
        entryDate,
        entryPrice: round2(entryPrice),
        exitDate,
        exitPrice: round2(exitPrice),
        exitReason,
        daysHeld,
        initialStop: round2(initialStop),
        finalStop: round2(currentStop),
        highestPrice: round2(highestPrice),
        target: round2(target),
        pnlPct,
        maxFavorable,
        maxAdverse,
        method,
        tier,
        reason,
        atr: atr || 0,
        stopMethod: stopMethod || 'FIXED',
        dailyLog
    };
}

// ═══════════════════════════════════════════════════════════
// REPORTING
// ═══════════════════════════════════════════════════════════

function computeStats(trades) {
    if (trades.length === 0) return { trades: 0, winRate: 0, avgPnl: 0, maxLoss: 0, profitFactor: 0, exits: {} };

    const wins = trades.filter(t => t.pnlPct > 0);
    const losses = trades.filter(t => t.pnlPct <= 0);

    const grossProfit = wins.reduce((s, t) => s + t.pnlPct, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));

    // Exit reason breakdown
    const exits = {};
    for (const t of trades) {
        exits[t.exitReason] = exits[t.exitReason] || { count: 0, totalPnl: 0 };
        exits[t.exitReason].count++;
        exits[t.exitReason].totalPnl += t.pnlPct;
    }

    return {
        trades: trades.length,
        winRate: round2((wins.length / trades.length) * 100),
        avgPnl: round2(trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length),
        avgWin: wins.length > 0 ? round2(grossProfit / wins.length) : 0,
        avgLoss: losses.length > 0 ? round2(-grossLoss / losses.length) : 0,
        maxLoss: round2(Math.min(...trades.map(t => t.pnlPct))),
        maxWin: round2(Math.max(...trades.map(t => t.pnlPct))),
        profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : grossProfit > 0 ? 999 : 0,
        totalReturn: round2(grossProfit - grossLoss),
        avgDaysHeld: round2(trades.reduce((s, t) => s + t.daysHeld, 0) / trades.length),
        exits
    };
}

function printComparisonTable(stratName, results) {
    const fixed = computeStats(results.fixed);
    const atr = computeStats(results.atr);
    const trail = computeStats(results.atrTrail);

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  COMPARISON: ${stratName}`);
    console.log(`${'═'.repeat(70)}`);
    console.log('');
    console.log(`  ${'Method'.padEnd(18)} | ${'Trades'.padStart(6)} | ${'Win %'.padStart(6)} | ${'Avg P&L'.padStart(8)} | ${'Max Loss'.padStart(9)} | ${'PF'.padStart(5)} | ${'Avg Days'.padStart(8)}`);
    console.log(`  ${'─'.repeat(18)}-+-${'─'.repeat(6)}-+-${'─'.repeat(6)}-+-${'─'.repeat(8)}-+-${'─'.repeat(9)}-+-${'─'.repeat(5)}-+-${'─'.repeat(8)}`);
    console.log(`  ${'Fixed 3.5%'.padEnd(18)} | ${String(fixed.trades).padStart(6)} | ${(fixed.winRate + '%').padStart(6)} | ${(fixed.avgPnl >= 0 ? '+' : '') + fixed.avgPnl + '%'.padStart(0)} | ${fixed.maxLoss + '%'.padStart(0)} | ${String(fixed.profitFactor).padStart(5)} | ${String(fixed.avgDaysHeld).padStart(8)}`);
    console.log(`  ${'ATR-Based (2x)'.padEnd(18)} | ${String(atr.trades).padStart(6)} | ${(atr.winRate + '%').padStart(6)} | ${(atr.avgPnl >= 0 ? '+' : '') + atr.avgPnl + '%'.padStart(0)} | ${atr.maxLoss + '%'.padStart(0)} | ${String(atr.profitFactor).padStart(5)} | ${String(atr.avgDaysHeld).padStart(8)}`);
    console.log(`  ${'ATR + Trailing'.padEnd(18)} | ${String(trail.trades).padStart(6)} | ${(trail.winRate + '%').padStart(6)} | ${(trail.avgPnl >= 0 ? '+' : '') + trail.avgPnl + '%'.padStart(0)} | ${trail.maxLoss + '%'.padStart(0)} | ${String(trail.profitFactor).padStart(5)} | ${String(trail.avgDaysHeld).padStart(8)}`);

    // Exit breakdown for ATR+Trail
    if (Object.keys(trail.exits).length > 0) {
        console.log(`\n  Exit Breakdown (ATR + Trailing):`);
        for (const [reason, data] of Object.entries(trail.exits)) {
            const avgPnl = round2(data.totalPnl / data.count);
            console.log(`    ${reason.padEnd(16)}: ${String(data.count).padStart(3)} trades | Avg P&L: ${avgPnl >= 0 ? '+' : ''}${avgPnl}%`);
        }
    }

    // Trades saved by trailing
    if (results.atrTrail.length > 0) {
        let savedCount = 0;
        let savedProfit = 0;
        for (let i = 0; i < results.atr.length; i++) {
            if (results.atr[i].pnlPct < 0 && results.atrTrail[i].pnlPct > 0) {
                savedCount++;
                savedProfit += results.atrTrail[i].pnlPct;
            }
        }
        if (savedCount > 0) {
            console.log(`\n  🎯 Trades SAVED by Trailing Stop: ${savedCount} (turned losses into avg +${round2(savedProfit / savedCount)}% profit)`);
        }
    }
}

function printDetailedTradeLog(stratName, trades) {
    if (trades.length === 0) return;

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  DETAILED MANUAL VERIFICATION REPORT: ${stratName}`);
    console.log(`  Total Trades: ${trades.length}`);
    console.log(`${'═'.repeat(70)}`);

    for (let idx = 0; idx < trades.length; idx++) {
        const trade = trades[idx];
        console.log(`\n  ── TRADE #${idx + 1}: ${trade.symbol} ──`);
        console.log(`  Strategy: ${stratName} | Tier: ${trade.tier} | Reason: ${trade.reason}`);
        console.log(`  Entry: ₹${trade.entryPrice} on ${trade.entryDate} (Next Day Open)`);
        console.log(`  Initial Stop: ₹${trade.initialStop} | Stop Method: ${trade.stopMethod}`);
        console.log(`  Target: ₹${trade.target} | ATR: ₹${trade.atr}`);
        console.log(`  Stop %: ${round2((trade.entryPrice - trade.initialStop) / trade.entryPrice * 100)}% | Target %: ${round2((trade.target - trade.entryPrice) / trade.entryPrice * 100)}%`);
        console.log('');
        console.log(`  ${'Day'.padStart(4)} | ${'Date'.padEnd(12)} | ${'High'.padStart(8)} | ${'Low'.padStart(8)} | ${'Close'.padStart(8)} | ${'Stop'.padStart(8)} | ${'Action'}`);
        console.log(`  ${'─'.repeat(4)}-+-${'─'.repeat(12)}-+-${'─'.repeat(8)}-+-${'─'.repeat(8)}-+-${'─'.repeat(8)}-+-${'─'.repeat(8)}-+-${'─'.repeat(16)}`);

        for (const day of trade.dailyLog) {
            console.log(
                `  ${String(day.day).padStart(4)} | ${day.date.padEnd(12)} | ` +
                `${String(day.high).padStart(8)} | ${String(day.low).padStart(8)} | ` +
                `${String(day.close).padStart(8)} | ${String(day.currentStop).padStart(8)} | ${day.action}`
            );
        }

        console.log('');
        console.log(`  ┌─ RESULT ─────────────────────────────────────────┐`);
        console.log(`  │  EXIT: ${trade.exitReason.padEnd(16)} at ₹${trade.exitPrice} on ${trade.exitDate}`);
        console.log(`  │  P&L: ${trade.pnlPct >= 0 ? '+' : ''}${trade.pnlPct}%`);
        console.log(`  │  Days Held: ${trade.daysHeld}`);
        console.log(`  │  Highest Price: ₹${trade.highestPrice} (+${trade.maxFavorable}%)`);
        console.log(`  │  Max Adverse: ${trade.maxAdverse}%`);
        console.log(`  │  Final Stop: ₹${trade.finalStop} (Initial: ₹${trade.initialStop})`);
        console.log(`  └─────────────────────────────────────────────────┘`);
    }
}


// ═══════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════

function round2(val) {
    return Math.round(val * 100) / 100;
}

// ═══════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════

runVerification().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
