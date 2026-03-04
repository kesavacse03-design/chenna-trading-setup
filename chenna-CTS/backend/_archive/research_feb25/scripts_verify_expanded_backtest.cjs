/**
 * EXPANDED BACKTEST — Full Context Report
 * 
 * Purpose: Run ALL available signals with comprehensive context:
 * - Full stop breakdown: ATR stop vs Structure stop vs Final (which won)
 * - Nifty trend context on entry date
 * - Per-trade detail + CSV output
 * - Answers Q1-Q4 from user's verification
 */

const path = require('path');
const fs = require('fs');

// Import strategies
const boDownStrategy = require(path.join(__dirname, '..', 'strategies', 'swingBoDownLongStrategy.cjs'));
const boUpStrategy = require(path.join(__dirname, '..', 'strategies', 'swingBoUpLongStrategy.cjs'));
const { calculateATR, findSwingLow, calculateIntelligentStop, calculateTrailingStop } = require(path.join(__dirname, '..', 'services', 'stopLossCalculator.cjs'));

// Config
const MAX_HOLD_DAYS = 10;
const TRAIL_PCT = 0.03;
const TRAIL_ACTIVATION = 0.015;
const BREAKEVEN_PCT = 0.02;
const round2 = (v) => Math.round(v * 100) / 100;

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  EXPANDED BACKTEST — Full Context Report');
    console.log('  Answers: Stop Breakdown | Nifty Trend | VIX | Full Sample');
    console.log('══════════════════════════════════════════════════════════════════════');

    // Load data
    const boDownData = require(path.join(__dirname, '..', 'results', 'deep_analysis_data.json'));
    const boUpData = require(path.join(__dirname, '..', 'results', 'deep_analysis_st_up_data.json'));

    console.log(`\n  Data loaded: ${Object.keys(boDownData).length} BO_DOWN, ${Object.keys(boUpData).length} BO_UP symbols`);

    // Run both strategies
    const downTrades = await runStrategyWithContext('ST_SWING_BO_DOWN', boDownStrategy, boDownData);
    const upTrades = await runStrategyWithContext('ST_SWING_BO_UP', boUpStrategy, boUpData);

    const allTrades = [...downTrades, ...upTrades];
    console.log(`\n  Total valid trades: ${allTrades.length} (${downTrades.length} DOWN + ${upTrades.length} UP)`);

    // ── ANSWER Q1: Stop Method Breakdown ──
    printStopMethodBreakdown(allTrades);

    // ── ANSWER Q2: VIX Status ──
    printVIXStatus();

    // ── ANSWER Q3: Nifty Trend Context ──
    printNiftyTrendAnalysis(allTrades);

    // ── Full detail for all trades ──
    printFullDetailReport(allTrades);

    // ── CSV Output ──
    writeCSV(allTrades);

    // ── Summary statistics ──
    printSummaryStats('ST_SWING_BO_DOWN', downTrades);
    printSummaryStats('ST_SWING_BO_UP', upTrades);
    printSummaryStats('COMBINED', allTrades);
}

// ═══════════════════════════════════════════════════════════
// STRATEGY RUNNER WITH FULL CONTEXT
// ═══════════════════════════════════════════════════════════

async function runStrategyWithContext(stratName, stratModule, dataMap) {
    const trades = [];
    const symbols = Object.keys(dataMap);

    for (const symbol of symbols) {
        const stockData = dataMap[symbol];
        if (!stockData.daily) continue;

        const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const addedDate = stockData.addedDate.split('T')[0];

        const signalIdx = daily.findIndex(c => c.timestamp.startsWith(addedDate));
        if (signalIdx === -1 || signalIdx < 15) continue;

        let weekly = (stockData.weekly || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const signalTime = new Date(addedDate).getTime();
        const pastWeekly = weekly.filter(w => new Date(w.timestamp).getTime() <= signalTime);

        let nifty = (stockData.nifty || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const pastNifty = nifty.filter(n => new Date(n.timestamp).getTime() <= signalTime);

        const pastDaily = daily.slice(0, signalIdx + 1);

        // Run strategy
        const signal = await stratModule.checkSignal(symbol, pastDaily, pastWeekly, pastNifty);
        if (!signal || signal.signal !== 'BUY') continue;

        // Entry
        const entryCandle = daily[signalIdx + 1];
        if (!entryCandle) continue;
        const entryPrice = entryCandle.open;
        const entryDate = entryCandle.timestamp.split('T')[0];

        // Future candles
        const futureCandles = daily.slice(signalIdx + 1, signalIdx + 1 + MAX_HOLD_DAYS);
        if (futureCandles.length < 2) continue;

        // ── Calculate stops with FULL BREAKDOWN ──
        const atr = calculateATR(pastDaily, 14);
        const swingLow = findSwingLow(pastDaily, 5);

        const atrStop = entryPrice - (atr * 2.0);
        const structureStop = swingLow - (atr * 0.2);
        const rawStop = Math.max(atrStop, structureStop);

        // VIX + Nifty adjustments
        const niftyTrend = deriveNiftyTrend(pastNifty);
        let vixAdj = 1.0;  // No VIX data available
        let trendAdj = niftyTrend === 'DOWN' ? 1.10 : 1.0;

        // Full intelligent stop
        const rrMult = stratName.includes('UP') ? 2.5 : 2.0;
        const atrCalc = calculateIntelligentStop({
            entryPrice, candles: pastDaily,
            atrMultiplier: 2.0, swingLookback: 5,
            niftyTrend, rrMultiple: rrMult
        });

        // Simulate trade
        const result = simulateTrade({
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

        // Attach full context
        result.strategy = stratName;
        result.addedDate = addedDate;
        result.niftyTrend = niftyTrend;
        result.vixApplied = false;
        result.trendAdj = trendAdj;

        // Stop breakdown
        result.atrStopRaw = round2(atrStop);
        result.atrStopPct = round2((entryPrice - atrStop) / entryPrice * 100);
        result.structureStopRaw = round2(structureStop);
        result.structureStopPct = round2((entryPrice - structureStop) / entryPrice * 100);
        result.swingLow = round2(swingLow);
        result.rawStopChosen = atrStop >= structureStop ? 'ATR' : 'STRUCTURE';
        result.wasClamped = atrCalc.method.includes('CLAMPED');
        result.finalStopMethod = atrCalc.method;
        result.finalStopPct = atrCalc.stopPct;

        trades.push(result);
    }

    return trades;
}

// ═══════════════════════════════════════════════════════════
// NIFTY TREND DERIVATION
// ═══════════════════════════════════════════════════════════

function deriveNiftyTrend(niftyCandles) {
    if (!niftyCandles || niftyCandles.length < 20) return 'UNKNOWN';

    const recent = niftyCandles.slice(-10);
    const older = niftyCandles.slice(-20, -10);

    const recentAvg = recent.reduce((s, c) => s + c.close, 0) / recent.length;
    const olderAvg = older.reduce((s, c) => s + c.close, 0) / older.length;

    const change = (recentAvg - olderAvg) / olderAvg * 100;

    if (change > 1) return 'UP';
    if (change < -1) return 'DOWN';
    return 'SIDEWAYS';
}

// ═══════════════════════════════════════════════════════════
// TRADE SIMULATION (same as verify_v2)
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
    let maxAdverse = 0;

    for (let i = 0; i < futureCandles.length; i++) {
        const candle = futureCandles[i];
        daysHeld = i + 1;

        if (candle.high > highestPrice) highestPrice = candle.high;

        // Track max adverse
        const adverse = (candle.low - entryPrice) / entryPrice * 100;
        if (adverse < maxAdverse) maxAdverse = adverse;

        // Stop hit
        if (candle.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = enableTrailing && currentStop > initialStop
                ? (currentStop >= entryPrice ? 'BREAKEVEN' : 'TRAILING_STOP')
                : 'INITIAL_STOP';
            exitDate = candle.timestamp.split('T')[0];
            dailyLog.push({
                day: daysHeld, date: exitDate, high: candle.high, low: candle.low,
                close: candle.close, currentStop: round2(currentStop), action: exitReason
            });
            break;
        }

        // Target hit
        if (candle.high >= target) {
            exitPrice = target;
            exitReason = 'TARGET';
            exitDate = candle.timestamp.split('T')[0];
            dailyLog.push({
                day: daysHeld, date: exitDate, high: candle.high, low: candle.low,
                close: candle.close, currentStop: round2(currentStop), action: 'TARGET'
            });
            break;
        }

        // Trailing update
        let stopAction = 'NO_CHANGE';
        if (enableTrailing) {
            const trailCalc = calculateTrailingStop({
                entryPrice, currentStop, highestPrice,
                trailPct: trailPct || 0.03,
                activationPct: activationPct || 0.015,
                breakevenPct: breakevenPct || 0.02
            });
            if (trailCalc.newStop > currentStop) {
                currentStop = trailCalc.newStop;
                stopAction = trailCalc.action;
            }
        }

        dailyLog.push({
            day: daysHeld, date: candle.timestamp.split('T')[0], high: candle.high,
            low: candle.low, close: candle.close, currentStop: round2(currentStop), action: stopAction
        });

        // Time exit
        if (i === futureCandles.length - 1 && !exitReason) {
            exitPrice = candle.close;
            exitReason = 'TIME_EXIT';
            exitDate = candle.timestamp.split('T')[0];
            dailyLog[dailyLog.length - 1].action = 'TIME_EXIT';
        }
    }

    const pnlPct = round2((exitPrice - entryPrice) / entryPrice * 100);

    return {
        symbol, entryPrice, entryDate, initialStop: round2(initialStop),
        target: round2(target), atr: round2(atr), stopMethod,
        exitPrice: round2(exitPrice), exitReason, exitDate,
        pnlPct, daysHeld, tier, reason,
        highestPrice: round2(highestPrice),
        maxFavorable: round2((highestPrice - entryPrice) / entryPrice * 100),
        maxAdverse: round2(maxAdverse),
        finalStop: round2(currentStop),
        dailyLog
    };
}

// ═══════════════════════════════════════════════════════════
// Q1: STOP METHOD BREAKDOWN
// ═══════════════════════════════════════════════════════════

function printStopMethodBreakdown(trades) {
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  Q1: STOP METHOD BREAKDOWN — ATR vs Structure vs Clamped');
    console.log('══════════════════════════════════════════════════════════════════════\n');

    console.log('  Symbol       | ATR Stop | ATR%  | Struct Stop | Struct% | SwingLow | Winner   | Final%  | Clamped?');
    console.log('  ' + '─'.repeat(100));

    for (const t of trades) {
        const winner = t.rawStopChosen;
        const clamped = t.wasClamped ? 'YES (MIN)' : 'NO';
        console.log(
            `  ${t.symbol.padEnd(12)} | ₹${String(t.atrStopRaw).padStart(8)} | ${String(t.atrStopPct).padStart(5)}% | ₹${String(t.structureStopRaw).padStart(10)} |${String(t.structureStopPct).padStart(6)}%  | ₹${String(t.swingLow).padStart(7)} | ${winner.padEnd(8)} | ${String(t.finalStopPct).padStart(5)}% | ${clamped}`
        );
    }

    // Summary
    const atrCount = trades.filter(t => t.rawStopChosen === 'ATR').length;
    const structCount = trades.filter(t => t.rawStopChosen === 'STRUCTURE').length;
    const clampedCount = trades.filter(t => t.wasClamped).length;

    console.log(`\n  Summary: ${atrCount} ATR-based | ${structCount} Structure-based | ${clampedCount} Clamped to 2% min`);
    console.log(`  ⚠️  Clamped trades: Stop was tighter than 2% → forced to 2% minimum`);
}

// ═══════════════════════════════════════════════════════════
// Q2: VIX STATUS
// ═══════════════════════════════════════════════════════════

function printVIXStatus() {
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  Q2: VIX ADJUSTMENT STATUS');
    console.log('══════════════════════════════════════════════════════════════════════\n');

    console.log('  ⚠️  VIX DATA NOT AVAILABLE in current dataset');
    console.log('');
    console.log('  The dataset contains Nifty50 candles (price data) but NOT India VIX values.');
    console.log('  The VIX adjustment code EXISTS in stopLossCalculator.cjs (lines 134-138):');
    console.log('');
    console.log('    if (vix !== null && vix > 20) {');
    console.log('        vixAdjustment = 1 + ((vix - 20) / 50);');
    console.log('    }');
    console.log('');
    console.log('  Effect: VIX 25 → widens stop by 10%, VIX 30 → widens by 20%');
    console.log('');
    console.log('  IMPACT ON RESULTS: Since VIX was NOT applied, stops may be TIGHTER');
    console.log('  than they would be in live trading during high-fear periods.');
    console.log('  This means backtest results are slightly OPTIMISTIC for volatile periods.');
    console.log('');
    console.log('  TO FIX: Need to fetch India VIX historical data and pass to calculator.');
}

// ═══════════════════════════════════════════════════════════
// Q3: NIFTY TREND ANALYSIS
// ═══════════════════════════════════════════════════════════

function printNiftyTrendAnalysis(trades) {
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  Q3: NIFTY TREND CONTEXT PER TRADE');
    console.log('══════════════════════════════════════════════════════════════════════\n');

    // Group by trend
    const upTrend = trades.filter(t => t.niftyTrend === 'UP');
    const downTrend = trades.filter(t => t.niftyTrend === 'DOWN');
    const sideways = trades.filter(t => t.niftyTrend === 'SIDEWAYS');
    const unknown = trades.filter(t => t.niftyTrend === 'UNKNOWN');

    const calcAvg = (arr) => arr.length > 0 ? round2(arr.reduce((s, t) => s + t.pnlPct, 0) / arr.length) : 0;
    const calcWR = (arr) => arr.length > 0 ? round2(arr.filter(t => t.pnlPct > 0).length / arr.length * 100) : 0;

    console.log('  Nifty Trend | Trades | Win Rate | Avg P&L | Best Trade | Worst Trade');
    console.log('  ' + '─'.repeat(80));

    for (const [label, arr] of [['UP', upTrend], ['DOWN', downTrend], ['SIDEWAYS', sideways], ['UNKNOWN', unknown]]) {
        if (arr.length === 0) continue;
        const best = arr.reduce((a, b) => a.pnlPct > b.pnlPct ? a : b);
        const worst = arr.reduce((a, b) => a.pnlPct < b.pnlPct ? a : b);
        console.log(
            `  ${label.padEnd(12)} | ${String(arr.length).padStart(6)} | ${String(calcWR(arr)).padStart(6)}% | ${calcAvg(arr) >= 0 ? '+' : ''}${String(calcAvg(arr)).padStart(5)}% | ${best.symbol} +${best.pnlPct}% | ${worst.symbol} ${worst.pnlPct}%`
        );
    }

    // Per trade detail
    console.log('\n  Per-trade Nifty context:');
    console.log('  Symbol       | Strategy     | Nifty | P&L    | Trend Adj');
    console.log('  ' + '─'.repeat(65));
    for (const t of trades) {
        console.log(
            `  ${t.symbol.padEnd(12)} | ${t.strategy.padEnd(12)} | ${(t.niftyTrend || '?').padEnd(5)} | ${t.pnlPct >= 0 ? '+' : ''}${String(t.pnlPct).padStart(5)}% | ${t.trendAdj === 1.10 ? 'YES (+10%)' : 'NO'}`
        );
    }
}

// ═══════════════════════════════════════════════════════════
// FULL DETAIL REPORT
// ═══════════════════════════════════════════════════════════

function printFullDetailReport(trades) {
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log(`  FULL DETAIL: ${trades.length} TRADES WITH DAILY LOGS`);
    console.log('══════════════════════════════════════════════════════════════════════');

    for (let idx = 0; idx < trades.length; idx++) {
        const t = trades[idx];
        console.log(`\n  ── TRADE #${idx + 1}: ${t.symbol} (${t.strategy}) ──`);
        console.log(`  Signal: ${t.reason} | Tier ${t.tier} | Nifty: ${t.niftyTrend}`);
        console.log(`  Entry: ₹${t.entryPrice} on ${t.entryDate}`);
        console.log(`  ATR: ₹${t.atr} (${round2(t.atr / t.entryPrice * 100)}% of price)`);
        console.log(`  ┌─ STOP BREAKDOWN ────────────────────────────────────────┐`);
        console.log(`  │  ATR Stop:       ₹${t.atrStopRaw} (-${t.atrStopPct}%)`);
        console.log(`  │  Structure Stop: ₹${t.structureStopRaw} (-${t.structureStopPct}%) [SwingLow: ₹${t.swingLow}]`);
        console.log(`  │  Raw Winner:     ${t.rawStopChosen} (tighter one)`);
        console.log(`  │  Clamped?:       ${t.wasClamped ? 'YES → forced to 2% min' : 'NO'}`);
        console.log(`  │  FINAL Stop:     ₹${t.initialStop} (-${t.finalStopPct}%) [${t.finalStopMethod}]`);
        console.log(`  └──────────────────────────────────────────────────────────┘`);
        console.log(`  Target: ₹${t.target} (+${round2((t.target - t.entryPrice) / t.entryPrice * 100)}%)`);
        console.log('');

        console.log(`  ${'Day'.padStart(4)} | ${'Date'.padEnd(12)} | ${'High'.padStart(8)} | ${'Low'.padStart(8)} | ${'Close'.padStart(8)} | ${'Stop'.padStart(8)} | ${'Action'}`);
        console.log(`  ${'─'.repeat(4)}-+-${'─'.repeat(12)}-+-${'─'.repeat(8)}-+-${'─'.repeat(8)}-+-${'─'.repeat(8)}-+-${'─'.repeat(8)}-+-${'─'.repeat(16)}`);

        for (const day of t.dailyLog) {
            console.log(
                `  ${String(day.day).padStart(4)} | ${day.date.padEnd(12)} | ` +
                `${String(day.high).padStart(8)} | ${String(day.low).padStart(8)} | ` +
                `${String(day.close).padStart(8)} | ${String(day.currentStop).padStart(8)} | ${day.action}`
            );
        }

        console.log('');
        console.log(`  ┌─ RESULT ─────────────────────────────────────────┐`);
        console.log(`  │  EXIT: ${t.exitReason.padEnd(16)} at ₹${t.exitPrice}`);
        console.log(`  │  P&L: ${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct}% | Days: ${t.daysHeld}`);
        console.log(`  │  Peak: ₹${t.highestPrice} (+${t.maxFavorable}%)`);
        console.log(`  │  Max Drawdown: ${t.maxAdverse}%`);
        console.log(`  │  Stop Journey: ₹${t.initialStop} → ₹${t.finalStop}`);
        console.log(`  └─────────────────────────────────────────────────┘`);
    }
}

// ═══════════════════════════════════════════════════════════
// SUMMARY STATISTICS
// ═══════════════════════════════════════════════════════════

function printSummaryStats(label, trades) {
    if (trades.length === 0) return;

    console.log(`\n══════════════════════════════════════════════════════════════════════`);
    console.log(`  SUMMARY: ${label} (${trades.length} trades)`);
    console.log(`══════════════════════════════════════════════════════════════════════\n`);

    const winners = trades.filter(t => t.pnlPct > 0);
    const losers = trades.filter(t => t.pnlPct < 0);
    const flat = trades.filter(t => t.pnlPct === 0);

    const avgPnl = round2(trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length);
    const totalProfit = round2(winners.reduce((s, t) => s + t.pnlPct, 0));
    const totalLoss = round2(Math.abs(losers.reduce((s, t) => s + t.pnlPct, 0)));
    const pf = totalLoss > 0 ? round2(totalProfit / totalLoss) : Infinity;
    const avgDays = round2(trades.reduce((s, t) => s + t.daysHeld, 0) / trades.length);
    const maxWin = trades.reduce((m, t) => t.pnlPct > m ? t.pnlPct : m, -Infinity);
    const maxLoss = trades.reduce((m, t) => t.pnlPct < m ? t.pnlPct : m, Infinity);

    console.log(`  Win Rate:      ${round2(winners.length / trades.length * 100)}% (${winners.length}W ${losers.length}L ${flat.length}F)`);
    console.log(`  Avg P&L:       ${avgPnl >= 0 ? '+' : ''}${avgPnl}%`);
    console.log(`  Profit Factor: ${pf}`);
    console.log(`  Avg Days:      ${avgDays}`);
    console.log(`  Best:          +${maxWin}%`);
    console.log(`  Worst:         ${maxLoss}%`);

    // Exit type breakdown
    const exitTypes = {};
    for (const t of trades) {
        if (!exitTypes[t.exitReason]) exitTypes[t.exitReason] = [];
        exitTypes[t.exitReason].push(t);
    }

    console.log('\n  Exit Breakdown:');
    for (const [reason, arr] of Object.entries(exitTypes)) {
        const avg = round2(arr.reduce((s, t) => s + t.pnlPct, 0) / arr.length);
        console.log(`    ${reason.padEnd(16)}: ${String(arr.length).padStart(3)} trades | Avg P&L: ${avg >= 0 ? '+' : ''}${avg}%`);
    }

    // Tier breakdown
    const tiers = {};
    for (const t of trades) {
        const key = `Tier ${t.tier}`;
        if (!tiers[key]) tiers[key] = [];
        tiers[key].push(t);
    }
    console.log('\n  Tier Breakdown:');
    for (const [tier, arr] of Object.entries(tiers)) {
        const avg = round2(arr.reduce((s, t) => s + t.pnlPct, 0) / arr.length);
        const wr = round2(arr.filter(t => t.pnlPct > 0).length / arr.length * 100);
        console.log(`    ${tier.padEnd(8)}: ${String(arr.length).padStart(3)} trades | WR: ${wr}% | Avg P&L: ${avg >= 0 ? '+' : ''}${avg}%`);
    }
}

// ═══════════════════════════════════════════════════════════
// CSV OUTPUT
// ═══════════════════════════════════════════════════════════

function writeCSV(trades) {
    const header = 'Strategy,Symbol,Tier,SignalDate,EntryDate,EntryPrice,ATR,ATRStop,ATRStopPct,StructStop,StructStopPct,SwingLow,RawWinner,FinalStop,FinalStopPct,FinalMethod,Clamped,Target,ExitPrice,ExitReason,PnlPct,DaysHeld,NiftyTrend,TrendAdj,MaxFavorable,MaxAdverse,PeakPrice,FinalStopLevel';
    const rows = trades.map(t => [
        t.strategy, t.symbol, t.tier, t.addedDate, t.entryDate, t.entryPrice,
        t.atr, t.atrStopRaw, t.atrStopPct, t.structureStopRaw, t.structureStopPct,
        t.swingLow, t.rawStopChosen, t.initialStop, t.finalStopPct, t.finalStopMethod,
        t.wasClamped, t.target, t.exitPrice, t.exitReason, t.pnlPct, t.daysHeld,
        t.niftyTrend, t.trendAdj, t.maxFavorable, t.maxAdverse, t.highestPrice, t.finalStop
    ].join(','));

    const csv = [header, ...rows].join('\n');
    const outPath = path.join(__dirname, '..', 'results', 'expanded_backtest.csv');
    fs.writeFileSync(outPath, csv, 'utf8');
    console.log(`\n  📄 CSV saved: ${outPath}`);
}

// Run
main().catch(console.error);
