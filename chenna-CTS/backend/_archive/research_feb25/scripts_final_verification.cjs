/**
 * FINAL VERIFICATION — Tasks 1 & 2
 * 
 * TASK 1: Pessimistic recalculation (stop-first for ambiguous same-day trades)
 * TASK 2: Classify why 71 of 86 Insider NR7 stocks didn't produce breakout signals
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');

function isNR7(candles, idx) {
    if (idx < 6) return false;
    const range0 = candles[idx].high - candles[idx].low;
    if (range0 <= 0) return false;
    for (let i = 1; i <= 6; i++) {
        const r = candles[idx - i].high - candles[idx - i].low;
        if (r <= range0) return false;
    }
    return true;
}

function isInsideDay(candles, idx) {
    if (idx < 1) return false;
    return candles[idx].high < candles[idx - 1].high && candles[idx].low > candles[idx - 1].low;
}

function getDirection(candles, nr7Idx) {
    const day0 = candles[nr7Idx];
    const day1 = candles[nr7Idx + 1];
    if (!day1) return null;
    if (day1.close > day0.high) return 'LONG';
    if (day1.close < day0.low) return 'SHORT';
    return null;
}

// Classify why Day+1 close didn't break NR7 range
function classifyNoBreakout(candles, nr7Idx) {
    const day0 = candles[nr7Idx];
    const day1 = candles[nr7Idx + 1];
    if (!day1) return 'NO_DAY1_DATA';

    const nr7High = day0.high;
    const nr7Low = day0.low;
    const day1Close = day1.close;
    const day1Open = day1.open;

    // Did it TRY to break out intraday but close back inside?
    const brokeHighIntraday = day1.high > nr7High;
    const brokeLowIntraday = day1.low < nr7Low;
    const closedInside = day1Close >= nr7Low && day1Close <= nr7High;

    if (closedInside && brokeHighIntraday && brokeLowIntraday) {
        return 'WHIPSAW';  // Broke both sides but closed inside
    }
    if (closedInside && brokeHighIntraday) {
        return 'FALSE_BREAKOUT_UP';  // Tried LONG but failed
    }
    if (closedInside && brokeLowIntraday) {
        return 'FALSE_BREAKOUT_DOWN';  // Tried SHORT but failed
    }
    if (closedInside) {
        return 'STAYED_INSIDE';  // Never broke NR7 range
    }

    // Shouldn't reach here if direction is null, but safety
    return 'UNKNOWN';
}

// Simulate trade with PESSIMISTIC assumption
// If both target AND stop are hit on same candle → STOP wins
function simulatePessimistic(candles, nr7Idx, direction) {
    const day0 = candles[nr7Idx];
    const day1 = candles[nr7Idx + 1];
    if (!day1) return null;

    const entryPrice = day1.close;
    const stopLoss = direction === 'SHORT' ? day0.high * 1.005 : day0.low * 0.995;
    const risk = Math.abs(entryPrice - stopLoss);
    if (risk <= 0) return null;
    const target = direction === 'SHORT' ? entryPrice - risk * 1.5 : entryPrice + risk * 1.5;

    let exitDay = 'TIMEOUT';
    let pnl = 0;
    let exitReason = 'TIMEOUT';
    let ambiguous = false;

    for (let d = 1; d <= 5; d++) {
        const ci = nr7Idx + 1 + d;
        if (ci >= candles.length) break;
        const c = candles[ci];

        let hitTarget = false, hitStop = false;
        if (direction === 'SHORT') {
            hitTarget = c.low <= target;
            hitStop = c.high >= stopLoss;
        } else {
            hitTarget = c.high >= target;
            hitStop = c.low <= stopLoss;
        }

        if (hitTarget && hitStop) {
            // AMBIGUOUS — PESSIMISTIC: assume STOP hit first
            ambiguous = true;
            pnl = -1.0;
            exitDay = `Day+${d + 1}`;
            exitReason = 'SL_HIT (pessimistic)';
            break;
        } else if (hitStop) {
            pnl = -1.0;
            exitDay = `Day+${d + 1}`;
            exitReason = 'SL_HIT';
            break;
        } else if (hitTarget) {
            pnl = 1.5;
            exitDay = `Day+${d + 1}`;
            exitReason = 'TARGET_HIT';
            break;
        }
    }

    return {
        entry: entryPrice,
        stop: stopLoss,
        target: target,
        risk: risk,
        pnl,
        exitDay,
        exitReason,
        ambiguous
    };
}

async function run() {
    const out = [];
    out.push('╔══════════════════════════════════════════════════════════════╗');
    out.push('║   FINAL VERIFICATION: PESSIMISTIC RECALC + BREAKOUT WHY   ║');
    out.push('╚══════════════════════════════════════════════════════════════╝');

    try {
        const category = await prisma.category.findUnique({
            where: { key: 'DAILY_CONTRACTION' },
            include: { stocks: { include: { stock: true } } }
        });
        if (!category) { out.push('ERROR: No category'); return; }

        const seen = new Map();
        for (const e of category.stocks) {
            const sym = e.stock.symbol;
            if (!seen.has(sym) || new Date(e.addedDate) < new Date(seen.get(sym).addedDate))
                seen.set(sym, e);
        }
        const stocks = Array.from(seen.values());
        out.push(`\nTotal unique stocks: ${stocks.length}`);

        // ═══════════════════════════════════════════════
        // SCAN ALL STOCKS
        // ═══════════════════════════════════════════════

        // TASK 1: ALL breakout trades with pessimistic logic
        const allTrades = [];

        // TASK 2: Classify non-breakout reasons
        let totalInsiderNR7 = 0;
        const noBreakoutReasons = {
            STAYED_INSIDE: [],
            FALSE_BREAKOUT_UP: [],
            FALSE_BREAKOUT_DOWN: [],
            WHIPSAW: [],
            NO_DAY1_DATA: [],
            UNKNOWN: []
        };
        // Track LONG breakouts separately (we skip them but want to count)
        let longBreakoutCount = 0;
        const longBreakoutStocks = [];

        let processed = 0;
        for (const stock of stocks) {
            processed++;
            const sym = stock.stock.symbol;
            process.stdout.write(`\r  [${processed}/${stocks.length}] ${sym}${''.padEnd(20)}  `);

            const from = new Date(stock.addedDate);
            from.setDate(from.getDate() - 30);

            let candles;
            try {
                candles = await priceService.fetchPrice(
                    sym, stock.stock.instrumentKey,
                    from.toISOString().split('T')[0],
                    new Date().toISOString().split('T')[0], 'day'
                );
            } catch { continue; }
            if (!candles || candles.length < 10) continue;

            const addDate = new Date(stock.addedDate);

            for (let i = 7; i < candles.length - 6; i++) {
                const candleDate = new Date(candles[i].timestamp || candles[i].date);
                const diff = Math.abs((candleDate - addDate) / 86400000);
                if (diff > 10) continue;

                if (!isNR7(candles, i)) continue;
                if (!isInsideDay(candles, i)) continue;

                totalInsiderNR7++;

                const direction = getDirection(candles, i);

                if (!direction) {
                    // NO BREAKOUT — classify why
                    const reason = classifyNoBreakout(candles, i);
                    const dateStr = (candles[i].timestamp || candles[i].date).toString().split('T')[0];
                    const day1 = candles[i + 1];
                    const detail = {
                        symbol: sym,
                        nr7Date: dateStr,
                        nr7High: candles[i].high,
                        nr7Low: candles[i].low,
                        nr7Range: (candles[i].high - candles[i].low).toFixed(2),
                        day1Open: day1?.open,
                        day1High: day1?.high,
                        day1Low: day1?.low,
                        day1Close: day1?.close,
                        reason
                    };
                    if (noBreakoutReasons[reason]) {
                        noBreakoutReasons[reason].push(detail);
                    } else {
                        noBreakoutReasons.UNKNOWN.push(detail);
                    }
                    continue;
                }

                if (direction === 'LONG') {
                    longBreakoutCount++;
                    const dateStr = (candles[i].timestamp || candles[i].date).toString().split('T')[0];
                    longBreakoutStocks.push({ symbol: sym, nr7Date: dateStr });
                }

                // Got a breakout signal — simulate with PESSIMISTIC logic
                const result = simulatePessimistic(candles, i, direction);
                if (!result) continue;

                const dateStr = (candles[i].timestamp || candles[i].date).toString().split('T')[0];
                allTrades.push({
                    symbol: sym,
                    nr7Date: dateStr,
                    direction,
                    ...result
                });
            }
        }

        // ═══════════════════════════════════════════════
        // TASK 1: PESSIMISTIC RESULTS
        // ═══════════════════════════════════════════════
        out.push(`\n\n${'█'.repeat(70)}`);
        out.push(`█ TASK 1: PESSIMISTIC RECALCULATION (Stop-First)`);
        out.push(`${'█'.repeat(70)}`);

        const shortTrades = allTrades.filter(t => t.direction === 'SHORT');
        const longTrades = allTrades.filter(t => t.direction === 'LONG');
        const shortWins = shortTrades.filter(t => t.pnl > 0);
        const shortLosses = shortTrades.filter(t => t.pnl < 0);
        const shortFlat = shortTrades.filter(t => t.pnl === 0);
        const ambiguousTrades = allTrades.filter(t => t.ambiguous);

        out.push(`\n--- COMPARISON: OPTIMISTIC vs PESSIMISTIC ---`);
        out.push(``);
        out.push(`Ambiguous trades (both target+stop hit same day): ${ambiguousTrades.length}`);
        for (const t of ambiguousTrades) {
            out.push(`  ${t.symbol.padEnd(15)} | ${t.nr7Date} | ${t.direction} | Optimistic: WIN → Pessimistic: LOSS`);
        }

        out.push(``);
        out.push(`                        OPTIMISTIC      PESSIMISTIC`);
        out.push(`                        (target first)  (stop first)`);
        out.push(`${'─'.repeat(60)}`);

        // For optimistic, flip ambiguous back to WIN
        const optShortWins = shortWins.length + ambiguousTrades.filter(t => t.direction === 'SHORT').length;
        const optShortPnl = shortTrades.reduce((s, t) => s + (t.ambiguous ? 1.5 : t.pnl), 0);

        out.push(`SHORT Trades:           ${shortTrades.length}               ${shortTrades.length}`);
        out.push(`SHORT Wins:             ${optShortWins}               ${shortWins.length}`);
        out.push(`SHORT Win Rate:         ${(optShortWins / shortTrades.length * 100).toFixed(1)}%            ${(shortWins.length / shortTrades.length * 100).toFixed(1)}%`);
        out.push(`SHORT Net P&L:          ${optShortPnl.toFixed(1)}R             ${shortTrades.reduce((s, t) => s + t.pnl, 0).toFixed(1)}R`);
        out.push(``);
        out.push(`LONG Trades:            ${longTrades.length}               ${longTrades.length}`);
        out.push(`LONG Win Rate:          ${longTrades.length > 0 ? (longTrades.filter(t => t.pnl > 0).length / longTrades.length * 100).toFixed(1) : 0}%            ${longTrades.length > 0 ? (longTrades.filter(t => t.pnl > 0).length / longTrades.length * 100).toFixed(1) : 0}%`);
        out.push(`LONG Net P&L:           ${longTrades.reduce((s, t) => s + t.pnl, 0).toFixed(1)}R             ${longTrades.reduce((s, t) => s + t.pnl, 0).toFixed(1)}R`);

        out.push(`\n--- ALL SHORT TRADES (PESSIMISTIC) ---`);
        out.push(`Symbol          | NR7 Date   | Entry    | Stop     | Target   | P&L   | Exit    | Reason               | Ambig?`);
        out.push(`${'─'.repeat(120)}`);
        for (const t of shortTrades) {
            out.push(`${t.symbol.padEnd(15)} | ${t.nr7Date} | ${String(t.entry).padStart(8)} | ${t.stop.toFixed(2).padStart(8)} | ${t.target.toFixed(2).padStart(8)} | ${String(t.pnl).padStart(5)} | ${t.exitDay.padEnd(7)} | ${t.exitReason.padEnd(20)} | ${t.ambiguous ? '⚠️ YES' : 'No'}`);
        }

        out.push(`\n--- ALL LONG TRADES (for reference — we skip these) ---`);
        for (const t of longTrades) {
            out.push(`${t.symbol.padEnd(15)} | ${t.nr7Date} | ${t.direction} | ${t.pnl}R | ${t.exitReason} | ${t.ambiguous ? '⚠️ AMBIG' : ''}`);
        }

        // ═══════════════════════════════════════════════
        // TASK 2: WHY 71 DIDN'T BREAK OUT
        // ═══════════════════════════════════════════════
        out.push(`\n\n${'█'.repeat(70)}`);
        out.push(`█ TASK 2: WHY DIDN'T 71 INSIDER NR7 STOCKS BREAK OUT?`);
        out.push(`${'█'.repeat(70)}`);

        const totalBreakout = allTrades.length;
        const totalNoBreakout = Object.values(noBreakoutReasons).reduce((s, arr) => s + arr.length, 0);

        out.push(`\nTotal Insider NR7 signals found: ${totalInsiderNR7}`);
        out.push(`  Broke out (direction confirmed): ${totalBreakout}`);
        out.push(`    ↳ SHORT breakouts: ${shortTrades.length}`);
        out.push(`    ↳ LONG breakouts:  ${longBreakoutCount}`);
        out.push(`  Did NOT break out:              ${totalNoBreakout}`);
        out.push(``);

        out.push(`--- BREAKDOWN BY REASON ---`);
        out.push(``);

        const reasonLabels = {
            STAYED_INSIDE: 'A: Price stayed inside NR7 range (no breakout attempt)',
            FALSE_BREAKOUT_UP: 'B: Broke HIGH intraday but closed back inside (false LONG breakout)',
            FALSE_BREAKOUT_DOWN: 'C: Broke LOW intraday but closed back inside (false SHORT breakout)',
            WHIPSAW: 'D: Broke BOTH sides intraday but closed inside (whipsaw)',
            NO_DAY1_DATA: 'E: No Day+1 data available',
            UNKNOWN: 'F: Unknown/Other'
        };

        for (const [reason, label] of Object.entries(reasonLabels)) {
            const arr = noBreakoutReasons[reason] || [];
            out.push(`${label}`);
            out.push(`  Count: ${arr.length} (${totalNoBreakout > 0 ? (arr.length / totalNoBreakout * 100).toFixed(1) : 0}%)`);
            // Show first 5 examples
            for (const d of arr.slice(0, 5)) {
                out.push(`    ${d.symbol.padEnd(15)} | NR7: ${d.nr7Date} | NR7 Range: [${d.nr7Low}, ${d.nr7High}] | Day1: O:${d.day1Open} H:${d.day1High} L:${d.day1Low} C:${d.day1Close}`);
            }
            if (arr.length > 5) out.push(`    ... and ${arr.length - 5} more`);
            out.push(``);
        }

        // ═══════════════════════════════════════════════
        // TASK 3: FINAL STRATEGY PARAMETERS (BASED ON PESSIMISTIC)
        // ═══════════════════════════════════════════════
        out.push(`\n\n${'█'.repeat(70)}`);
        out.push(`█ TASK 3: VERIFIED STRATEGY PARAMETERS`);
        out.push(`${'█'.repeat(70)}`);

        const pessShortWR = shortTrades.length > 0 ? (shortWins.length / shortTrades.length * 100) : 0;
        const pessShortPnl = shortTrades.reduce((s, t) => s + t.pnl, 0);
        const avgPnlPerTrade = shortTrades.length > 0 ? pessShortPnl / shortTrades.length : 0;

        out.push(`\n╔════════════════════════════════════════════════╗`);
        out.push(`║  DAILY_CONTRACTION STRATEGY (DATA-VERIFIED)    ║`);
        out.push(`╠════════════════════════════════════════════════╣`);
        out.push(`║  Pattern:    Insider NR7 (Inside Day + NR7)    ║`);
        out.push(`║  Direction:  SHORT ONLY                        ║`);
        out.push(`║  Entry:      Day+1 Close < NR7 Low             ║`);
        out.push(`║  Stop:       NR7 High + 0.5%                   ║`);
        out.push(`║  Target:     1.5R                              ║`);
        out.push(`║  Hold:       1-2 days (Overnight swing)        ║`);
        out.push(`╠════════════════════════════════════════════════╣`);
        out.push(`║  PESSIMISTIC Performance:                      ║`);
        out.push(`║    Sample:    ${String(shortTrades.length).padEnd(5)} SHORT trades               ║`);
        out.push(`║    Win Rate:  ${pessShortWR.toFixed(1).padEnd(5)}%                          ║`);
        out.push(`║    Net P&L:   ${pessShortPnl.toFixed(1).padEnd(5)}R                           ║`);
        out.push(`║    Avg/Trade: ${avgPnlPerTrade.toFixed(3).padEnd(6)}R                         ║`);
        out.push(`║    Ambiguous: ${ambiguousTrades.filter(t => t.direction === 'SHORT').length} trades (counted as LOSS)    ║`);
        out.push(`╠════════════════════════════════════════════════╣`);
        out.push(`║  Signal Freq: ~${Math.round(shortTrades.length / 4)}-${Math.round(shortTrades.length / 3)} per month (selective)    ║`);
        out.push(`║  Confidence:  MODERATE (small sample)          ║`);
        out.push(`╚════════════════════════════════════════════════╝`);

    } catch (e) {
        out.push(`ERROR: ${e.message}`);
        out.push(e.stack);
    } finally {
        await prisma.$disconnect();
    }

    const reportPath = path.join(ARTIFACT_DIR, 'final_verification_report.txt');
    const report = out.join('\n');
    fs.writeFileSync(reportPath, report);
    console.log('\n\n' + report);
    console.log(`\nReport saved to: ${reportPath}`);
}

run();
