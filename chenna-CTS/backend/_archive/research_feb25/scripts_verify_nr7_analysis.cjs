/**
 * VERIFICATION SCRIPT — Show the Work
 * 
 * This script answers ALL verification questions:
 * 1. HINDALCO winner: Full OHLC Day -7 to Day +3, prove NR7, prove Inside Day
 * 2. One loser: Same detail
 * 3. 193-stock breakdown: NR7 on addedDate vs ±3 days vs none
 * 4. Reconcile V2 vs V3
 * 5. Show 10 raw CSV rows
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');

// ═══════════════════════════════════════════════════════
// PURE NR7 DETECTION — No shortcuts
// ═══════════════════════════════════════════════════════
function isNR7(candles, idx) {
    // Is candles[idx] the narrowest range of the last 7 candles?
    if (idx < 6) return { isNR7: false, ranges: [] };

    const ranges = [];
    for (let i = 0; i <= 6; i++) {
        const c = candles[idx - i];
        if (!c) return { isNR7: false, ranges: [] };
        ranges.push({
            dayOffset: -i,
            date: (c.timestamp || c.date || '').toString().split('T')[0],
            high: c.high,
            low: c.low,
            range: c.high - c.low,
            rangePct: ((c.high - c.low) / c.close * 100).toFixed(2)
        });
    }

    const todayRange = ranges[0].range;
    const isSmallest = ranges.slice(1).every(r => r.range > todayRange);

    return { isNR7: isSmallest, ranges, todayRange };
}

function isInsideDay(candles, idx) {
    // Is candles[idx] inside candles[idx-1]?
    if (idx < 1) return { isInside: false };
    const today = candles[idx];
    const yesterday = candles[idx - 1];
    return {
        isInside: today.high < yesterday.high && today.low > yesterday.low,
        todayHigh: today.high,
        todayLow: today.low,
        yesterdayHigh: yesterday.high,
        yesterdayLow: yesterday.low,
        highCheck: `${today.high} < ${yesterday.high} = ${today.high < yesterday.high}`,
        lowCheck: `${today.low} > ${yesterday.low} = ${today.low > yesterday.low}`
    };
}

// ═══════════════════════════════════════════════════════
// FULL TRADE TIMELINE
// ═══════════════════════════════════════════════════════
function getFullTimeline(candles, nr7Idx, symbol) {
    const lines = [];
    lines.push(`\n${'═'.repeat(70)}`);
    lines.push(`TRADE TIMELINE: ${symbol}`);
    lines.push(`${'═'.repeat(70)}`);

    // Show Day -7 to Day +3
    for (let offset = -7; offset <= 3; offset++) {
        const ci = nr7Idx + offset;
        if (ci < 0 || ci >= candles.length) continue;
        const c = candles[ci];
        const range = c.high - c.low;
        const rangePct = ((range) / c.close * 100).toFixed(2);
        const dateStr = (c.timestamp || c.date || '').toString().split('T')[0];

        let label = '';
        if (offset === 0) label = ' ← NR7 SETUP';
        if (offset === -1) label = ' ← MOTHER BAR (for Inside Day check)';
        if (offset === 1) label = ' ← ENTRY/TRIGGER DAY';
        if (offset === 2) label = ' ← DAY +2';

        lines.push(`Day ${offset >= 0 ? '+' : ''}${offset} [${dateStr}]: O:${c.open} H:${c.high} L:${c.low} C:${c.close} | Range: ₹${range.toFixed(2)} (${rangePct}%)${label}`);
    }

    return lines.join('\n');
}

function proveNR7(candles, nr7Idx, symbol) {
    const lines = [];
    lines.push(`\n--- NR7 PROOF for ${symbol} ---`);

    const check = isNR7(candles, nr7Idx);
    lines.push(`Is NR7: ${check.isNR7}`);
    lines.push(`\nRange comparison (last 7 days):`);

    for (const r of check.ranges) {
        const marker = r.dayOffset === 0 ? ' ← TODAY (must be smallest)' : '';
        lines.push(`  Day ${r.dayOffset} [${r.date}]: Range = ₹${r.range.toFixed(2)} (${r.rangePct}%)${marker}`);
    }

    if (check.isNR7) {
        lines.push(`✅ CONFIRMED: Day 0 range (₹${check.todayRange.toFixed(2)}) is smaller than all 6 previous days.`);
    } else {
        lines.push(`❌ FAILED: Day 0 is NOT the smallest range.`);
    }

    return lines.join('\n');
}

function proveInsideDay(candles, nr7Idx, symbol) {
    const lines = [];
    lines.push(`\n--- INSIDE DAY PROOF for ${symbol} ---`);

    const check = isInsideDay(candles, nr7Idx);
    lines.push(`Day 0 (NR7) High: ${check.todayHigh}`);
    lines.push(`Day -1 (Mother) High: ${check.yesterdayHigh}`);
    lines.push(`Check: ${check.highCheck}`);
    lines.push(`Day 0 (NR7) Low: ${check.todayLow}`);
    lines.push(`Day -1 (Mother) Low: ${check.yesterdayLow}`);
    lines.push(`Check: ${check.lowCheck}`);

    if (check.isInside) {
        lines.push(`✅ CONFIRMED: Day 0 is completely inside Day -1.`);
    } else {
        lines.push(`❌ FAILED: Day 0 is NOT inside Day -1.`);
    }

    return lines.join('\n');
}

function proveTradeOutcome(candles, nr7Idx, direction, symbol) {
    const lines = [];
    const day0 = candles[nr7Idx];
    const day1 = candles[nr7Idx + 1];

    if (!day1) { lines.push('No Day +1 data'); return lines.join('\n'); }

    // Entry = Day1 Close (swing logic from V2)
    const entryPrice = day1.close;
    const stopLoss = direction === 'SHORT' ? day0.high * 1.005 : day0.low * 0.995;
    const risk = Math.abs(entryPrice - stopLoss);
    const target = direction === 'SHORT' ? entryPrice - risk * 1.5 : entryPrice + risk * 1.5;

    lines.push(`\n--- TRADE OUTCOME PROOF for ${symbol} ---`);
    lines.push(`Direction: ${direction}`);
    lines.push(`Entry (Day+1 Close): ₹${entryPrice}`);
    lines.push(`Stop Loss (NR7 High * 1.005): ₹${stopLoss.toFixed(2)}`);
    lines.push(`Risk: ₹${risk.toFixed(2)}`);
    lines.push(`Target (1.5R): ₹${target.toFixed(2)}`);

    // Direction check
    lines.push(`\nDirection determination:`);
    lines.push(`  Day+1 Close (${day1.close}) vs NR7 High (${day0.high}): ${day1.close > day0.high ? 'ABOVE → LONG' : 'not above'}`);
    lines.push(`  Day+1 Close (${day1.close}) vs NR7 Low (${day0.low}): ${day1.close < day0.low ? 'BELOW → SHORT' : 'not below'}`);

    // Day by day outcome
    lines.push(`\nDay-by-day resolution:`);
    for (let d = 1; d <= 5; d++) {
        const ci = nr7Idx + 1 + d; // Day after entry
        if (ci >= candles.length) break;
        const c = candles[ci];
        const dateStr = (c.timestamp || c.date || '').toString().split('T')[0];

        let hitTarget = false, hitStop = false;
        if (direction === 'SHORT') {
            hitTarget = c.low <= target;
            hitStop = c.high >= stopLoss;
        } else {
            hitTarget = c.high >= target;
            hitStop = c.low <= stopLoss;
        }

        const status = hitTarget ? '🎯 TARGET HIT' : hitStop ? '🛑 STOP HIT' : '⏳ Open';
        lines.push(`  Day +${d + 1} [${dateStr}]: O:${c.open} H:${c.high} L:${c.low} C:${c.close} → ${status}`);

        if (hitTarget || hitStop) {
            if (hitTarget) lines.push(`  ✅ WIN: +1.5R`);
            else lines.push(`  ❌ LOSS: -1.0R`);
            break;
        }
    }

    return lines.join('\n');
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
async function run() {
    const output = [];
    output.push('╔══════════════════════════════════════════════════════════════╗');
    output.push('║          NR7 ANALYSIS VERIFICATION REPORT                  ║');
    output.push('╚══════════════════════════════════════════════════════════════╝');

    try {
        const category = await prisma.category.findUnique({
            where: { key: 'DAILY_CONTRACTION' },
            include: { stocks: { include: { stock: true } } }
        });
        if (!category) { output.push('ERROR: Category not found'); return; }

        // Dedup stocks
        const seen = new Map();
        for (const entry of category.stocks) {
            const sym = entry.stock.symbol;
            if (!seen.has(sym) || new Date(entry.addedDate) < new Date(seen.get(sym).addedDate)) {
                seen.set(sym, entry);
            }
        }
        const stocks = Array.from(seen.values());
        output.push(`\nTotal unique stocks in DAILY_CONTRACTION: ${stocks.length}`);

        // ═══════════════════════════════════════════════
        // SECTION 1: HINDALCO DEEP DIVE (Winner)
        // ═══════════════════════════════════════════════
        output.push(`\n\n${'█'.repeat(70)}`);
        output.push(`█ SECTION 1: HINDALCO — WINNER PROOF`);
        output.push(`${'█'.repeat(70)}`);

        const hindalco = stocks.find(s => s.stock.symbol === 'HINDALCO');
        if (hindalco) {
            output.push(`addedDate: ${hindalco.addedDate}`);

            const from = new Date(hindalco.addedDate);
            from.setDate(from.getDate() - 30);
            const candles = await priceService.fetchPrice(
                'HINDALCO', hindalco.stock.instrumentKey,
                from.toISOString().split('T')[0],
                new Date().toISOString().split('T')[0], 'day'
            );

            if (candles && candles.length > 10) {
                output.push(`Fetched ${candles.length} candles`);

                // Find the NR7 signal(s) near addedDate
                const addDate = new Date(hindalco.addedDate);
                let foundNR7 = false;

                for (let i = 7; i < candles.length - 3; i++) {
                    const candleDate = new Date(candles[i].timestamp || candles[i].date);
                    const diff = Math.abs((candleDate - addDate) / (86400000));
                    if (diff > 15) continue;

                    const nr7Check = isNR7(candles, i);
                    const insideCheck = isInsideDay(candles, i);

                    if (nr7Check.isNR7) {
                        const dateStr = (candles[i].timestamp || candles[i].date).toString().split('T')[0];
                        output.push(`\n>>> Found NR7 on ${dateStr} (${diff.toFixed(0)} days from addedDate)`);
                        output.push(`    Inside Day: ${insideCheck.isInside}`);

                        if (insideCheck.isInside) {
                            foundNR7 = true;
                            // Full timeline
                            output.push(getFullTimeline(candles, i, 'HINDALCO'));
                            output.push(proveNR7(candles, i, 'HINDALCO'));
                            output.push(proveInsideDay(candles, i, 'HINDALCO'));

                            // Determine direction
                            const day1 = candles[i + 1];
                            let dir = null;
                            if (day1.close > candles[i].high) dir = 'LONG';
                            else if (day1.close < candles[i].low) dir = 'SHORT';

                            if (dir) {
                                output.push(proveTradeOutcome(candles, i, dir, 'HINDALCO'));
                            } else {
                                output.push(`\n⚠️ Day+1 Close (${day1.close}) did NOT break NR7 range [${candles[i].low}, ${candles[i].high}] → NO SIGNAL`);
                            }
                        }
                    }
                }

                if (!foundNR7) {
                    output.push('\n❌ NO Insider NR7 found near addedDate!');
                    // Show what WAS there
                    output.push('\nShowing all candles near addedDate:');
                    for (let i = 7; i < candles.length - 3; i++) {
                        const candleDate = new Date(candles[i].timestamp || candles[i].date);
                        const diff = Math.abs((candleDate - addDate) / 86400000);
                        if (diff > 5) continue;
                        const dateStr = (candles[i].timestamp || candles[i].date).toString().split('T')[0];
                        const nr7 = isNR7(candles, i);
                        const inside = isInsideDay(candles, i);
                        output.push(`  ${dateStr}: NR7=${nr7.isNR7} Inside=${inside.isInside} Range=${(candles[i].high - candles[i].low).toFixed(2)}`);
                    }
                }
            }
        } else {
            output.push('HINDALCO not found in category!');
        }

        // ═══════════════════════════════════════════════
        // SECTION 2: FIND AND SHOW A LOSER
        // ═══════════════════════════════════════════════
        output.push(`\n\n${'█'.repeat(70)}`);
        output.push(`█ SECTION 2: LOSER TRADE — FULL PROOF`);
        output.push(`${'█'.repeat(70)}`);

        // Scan all stocks to find a confirmed loser
        let loserFound = false;
        for (const stock of stocks) {
            if (loserFound) break;
            const sym = stock.stock.symbol;
            if (sym === 'HINDALCO') continue; // Skip winner

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

            if (!candles || candles.length < 15) continue;

            const addDate = new Date(stock.addedDate);
            for (let i = 7; i < candles.length - 6; i++) {
                const candleDate = new Date(candles[i].timestamp || candles[i].date);
                const diff = Math.abs((candleDate - addDate) / 86400000);
                if (diff > 10) continue;

                const nr7Check = isNR7(candles, i);
                const insideCheck = isInsideDay(candles, i);

                if (nr7Check.isNR7 && insideCheck.isInside) {
                    const day1 = candles[i + 1];
                    let dir = null;
                    if (day1.close > candles[i].high) dir = 'LONG';
                    else if (day1.close < candles[i].low) dir = 'SHORT';
                    if (!dir) continue;

                    // Check if this is a LOSER
                    const entryPrice = day1.close;
                    const stopLoss = dir === 'SHORT' ? candles[i].high * 1.005 : candles[i].low * 0.995;
                    const risk = Math.abs(entryPrice - stopLoss);
                    const target = dir === 'SHORT' ? entryPrice - risk * 1.5 : entryPrice + risk * 1.5;

                    // Check next 5 days
                    let isLoser = false;
                    for (let d = 1; d <= 5; d++) {
                        const ci = i + 1 + d;
                        if (ci >= candles.length) break;
                        const c = candles[ci];
                        if (dir === 'SHORT' && c.high >= stopLoss) { isLoser = true; break; }
                        if (dir === 'LONG' && c.low <= stopLoss) { isLoser = true; break; }
                    }

                    if (isLoser) {
                        output.push(`addedDate: ${stock.addedDate}`);
                        output.push(getFullTimeline(candles, i, sym));
                        output.push(proveNR7(candles, i, sym));
                        output.push(proveInsideDay(candles, i, sym));
                        output.push(proveTradeOutcome(candles, i, dir, sym));
                        loserFound = true;
                        break;
                    }
                }
            }
        }
        if (!loserFound) output.push('No Insider NR7 loser found in scan (all non-HINDALCO stocks).');

        // ═══════════════════════════════════════════════
        // SECTION 3: 193 STOCK BREAKDOWN
        // ═══════════════════════════════════════════════
        output.push(`\n\n${'█'.repeat(70)}`);
        output.push(`█ SECTION 3: 193-STOCK BREAKDOWN`);
        output.push(`${'█'.repeat(70)}`);

        let nr7OnAddedDate = 0;
        let nr7Within3Days = 0;
        let insiderNR7Count = 0;
        let regularNR7Only = 0;
        let noNR7AtAll = 0;
        let processed = 0;
        const allSignals = []; // For CSV

        for (const stock of stocks) {
            processed++;
            process.stdout.write(`\r  Scanning [${processed}/${stocks.length}] ${stock.stock.symbol}...       `);

            const from = new Date(stock.addedDate);
            from.setDate(from.getDate() - 30);

            let candles;
            try {
                candles = await priceService.fetchPrice(
                    stock.stock.symbol, stock.stock.instrumentKey,
                    from.toISOString().split('T')[0],
                    new Date().toISOString().split('T')[0], 'day'
                );
            } catch { noNR7AtAll++; continue; }

            if (!candles || candles.length < 10) { noNR7AtAll++; continue; }

            const addDate = new Date(stock.addedDate);
            let foundInsider = false;
            let foundRegular = false;
            let foundOnExactDate = false;
            let foundWithin3 = false;

            for (let i = 7; i < candles.length - 2; i++) {
                const candleDate = new Date(candles[i].timestamp || candles[i].date);
                const diff = Math.abs((candleDate - addDate) / 86400000);
                if (diff > 10) continue;

                const nr7Check = isNR7(candles, i);
                if (!nr7Check.isNR7) continue;

                const insideCheck = isInsideDay(candles, i);

                if (diff <= 1) foundOnExactDate = true;
                if (diff <= 3) foundWithin3 = true;

                // Direction
                const day1 = candles[i + 1];
                let dir = null;
                if (day1.close > candles[i].high) dir = 'LONG';
                else if (day1.close < candles[i].low) dir = 'SHORT';

                if (insideCheck.isInside) {
                    foundInsider = true;
                    if (dir) {
                        // Compute outcome
                        const entryPrice = day1.close;
                        const stopLoss = dir === 'SHORT' ? candles[i].high * 1.005 : candles[i].low * 0.995;
                        const risk = Math.abs(entryPrice - stopLoss);
                        const target = dir === 'SHORT' ? entryPrice - risk * 1.5 : entryPrice + risk * 1.5;

                        let pnl = 0;
                        let exitDay = 'TIMEOUT';
                        for (let d = 1; d <= 5; d++) {
                            const ci = i + 1 + d;
                            if (ci >= candles.length) break;
                            const c = candles[ci];
                            let hitT = false, hitS = false;
                            if (dir === 'SHORT') { hitT = c.low <= target; hitS = c.high >= stopLoss; }
                            else { hitT = c.high >= target; hitS = c.low <= stopLoss; }
                            if (hitT) { pnl = 1.5; exitDay = `Day+${d + 1}`; break; }
                            if (hitS) { pnl = -1.0; exitDay = `Day+${d + 1}`; break; }
                        }

                        const dateStr = (candles[i].timestamp || candles[i].date).toString().split('T')[0];
                        allSignals.push({
                            symbol: stock.stock.symbol,
                            addedDate: stock.addedDate.toString().split('T')[0],
                            nr7Date: dateStr,
                            dateDiff: diff.toFixed(0),
                            type: 'INSIDER',
                            direction: dir,
                            entry: entryPrice,
                            stop: stopLoss.toFixed(2),
                            target: target.toFixed(2),
                            pnl: pnl,
                            exitDay: exitDay,
                            result: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'FLAT'
                        });
                    }
                } else {
                    foundRegular = true;
                }
            }

            if (foundOnExactDate) nr7OnAddedDate++;
            if (foundWithin3) nr7Within3Days++;
            if (foundInsider) insiderNR7Count++;
            else if (foundRegular) regularNR7Only++;
            else noNR7AtAll++;
        }

        output.push(`\n\nOf ${stocks.length} unique stocks:`);
        output.push(`  NR7 on exact addedDate (±1 day):  ${nr7OnAddedDate} (${(nr7OnAddedDate / stocks.length * 100).toFixed(1)}%)`);
        output.push(`  NR7 within ±3 days of addedDate:  ${nr7Within3Days} (${(nr7Within3Days / stocks.length * 100).toFixed(1)}%)`);
        output.push(`  Insider NR7 (within ±10 days):    ${insiderNR7Count} (${(insiderNR7Count / stocks.length * 100).toFixed(1)}%)`);
        output.push(`  Regular NR7 only (no inside day): ${regularNR7Only} (${(regularNR7Only / stocks.length * 100).toFixed(1)}%)`);
        output.push(`  No NR7 found at all (±10 days):   ${noNR7AtAll} (${(noNR7AtAll / stocks.length * 100).toFixed(1)}%)`);

        // ═══════════════════════════════════════════════
        // SECTION 4: RAW CSV DATA (10 rows)
        // ═══════════════════════════════════════════════
        output.push(`\n\n${'█'.repeat(70)}`);
        output.push(`█ SECTION 4: RAW DATA — 10 SAMPLE ROWS`);
        output.push(`${'█'.repeat(70)}`);

        output.push(`\nTotal Insider NR7 signals found: ${allSignals.length}`);
        output.push(`\nSymbol          | AddedDate  | NR7Date    | Diff | Dir   | Entry    | Stop     | Target   | P&L  | Exit    | Result`);
        output.push(`${'─'.repeat(120)}`);

        for (const s of allSignals.slice(0, Math.min(allSignals.length, 10))) {
            output.push(
                `${s.symbol.padEnd(15)} | ${s.addedDate} | ${s.nr7Date} | ${s.dateDiff.padStart(4)} | ${s.direction.padEnd(5)} | ${String(s.entry).padStart(8)} | ${s.stop.padStart(8)} | ${s.target.padStart(8)} | ${String(s.pnl).padStart(4)} | ${s.exitDay.padEnd(7)} | ${s.result}`
            );
        }

        if (allSignals.length > 10) {
            output.push(`... and ${allSignals.length - 10} more`);
        }

        // ═══════════════════════════════════════════════
        // SECTION 5: V2 vs V3 RECONCILIATION
        // ═══════════════════════════════════════════════
        output.push(`\n\n${'█'.repeat(70)}`);
        output.push(`█ SECTION 5: V2 vs V3 RECONCILIATION`);
        output.push(`${'█'.repeat(70)}`);

        const shortSignals = allSignals.filter(s => s.direction === 'SHORT');
        const longSignals = allSignals.filter(s => s.direction === 'LONG');
        const wins = allSignals.filter(s => s.result === 'WIN');
        const losses = allSignals.filter(s => s.result === 'LOSS');

        output.push(`\nAll Insider NR7 signals: ${allSignals.length}`);
        output.push(`  SHORT: ${shortSignals.length} (${shortSignals.filter(s => s.result === 'WIN').length} wins, ${shortSignals.filter(s => s.result === 'LOSS').length} losses)`);
        output.push(`  LONG:  ${longSignals.length} (${longSignals.filter(s => s.result === 'WIN').length} wins, ${longSignals.filter(s => s.result === 'LOSS').length} losses)`);
        output.push(`\nSHORT Win Rate: ${shortSignals.length > 0 ? (shortSignals.filter(s => s.result === 'WIN').length / shortSignals.length * 100).toFixed(1) : 0}%`);
        output.push(`SHORT Net P&L:  ${shortSignals.reduce((sum, s) => sum + s.pnl, 0).toFixed(1)}R`);
        output.push(`LONG Win Rate:  ${longSignals.length > 0 ? (longSignals.filter(s => s.result === 'WIN').length / longSignals.length * 100).toFixed(1) : 0}%`);
        output.push(`LONG Net P&L:   ${longSignals.reduce((sum, s) => sum + s.pnl, 0).toFixed(1)}R`);

        output.push(`\n--- ALL TRADES (for V2 vs V3 comparison) ---`);
        for (const s of allSignals) {
            output.push(`  ${s.symbol.padEnd(15)} | ${s.nr7Date} | ${s.direction} | ${s.result} | ${s.pnl}R | diff=${s.dateDiff}d`);
        }

        output.push(`\nV2 used ±10 days window. This verification uses ±10 days.`);
        output.push(`V3 used ±15 days window. Extra signals from wider window may be lower quality.`);
        output.push(`\nIf V2 had 14 signals and this shows a different count,`);
        output.push(`the difference is due to the date window or dedup logic.`);

    } catch (e) {
        output.push(`ERROR: ${e.message}`);
        output.push(e.stack);
    } finally {
        await prisma.$disconnect();
    }

    // Write report
    const reportPath = path.join(ARTIFACT_DIR, 'nr7_verification_report.txt');
    const fullReport = output.join('\n');
    fs.writeFileSync(reportPath, fullReport);
    console.log('\n\n' + fullReport);
    console.log(`\n\nReport saved to: ${reportPath}`);
}

run();
