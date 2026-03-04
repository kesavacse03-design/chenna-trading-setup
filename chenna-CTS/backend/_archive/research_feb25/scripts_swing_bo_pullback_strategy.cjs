/**
 * PULLBACK RETEST STRATEGY - THE TRADECODE WAY
 * 
 * Scanner = Watchlist ONLY. Entry = Pullback to broken level + Rejection.
 * 
 * For SHORT_TERM_SWING_BO_DOWN:
 *   Day 0: Breakout detected. Mark broken support (Day 0 open or prev close).
 *   Day +1 to +10: Watch for pullback UP toward broken level.
 *   Entry: When price retests broken level AND forms rejection candle.
 *   Stop: Above pullback high.
 *   Exit: Trail using lower highs OR time-based (5 days from entry).
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Detect if a candle is a rejection/reversal candle at a resistance level (for SHORT).
 * - Close below open (red candle)
 * - Upper wick touches or exceeds the resistance level
 * - Close is in lower half of range
 */
function isRejectionCandle(candle, resistanceLevel) {
    const isRed = candle.close < candle.open;
    const range = candle.high - candle.low;
    if (range === 0) return false;

    const closePosition = (candle.close - candle.low) / range; // 0=close at low, 1=close at high
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const upperWickRatio = upperWick / range;

    // High must reach within 1.5% of resistance
    const reachesResistance = candle.high >= resistanceLevel * 0.985;

    // Rejection criteria: Red candle, upper wick is significant, close in lower half
    return isRed && reachesResistance && closePosition < 0.4 && upperWickRatio > 0.25;
}

/**
 * Detect "Lower High" formation — price pulled back but couldn't exceed previous swing high.
 * Simple check: current day's high < previous day's high AND close < open (red).
 */
function isLowerHigh(candle, prevCandle) {
    return candle.high < prevCandle.high && candle.close < candle.open;
}

async function run() {
    console.log('=== PULLBACK RETEST STRATEGY ANALYSIS ===\n');

    // ──────────────────────────────────────────────────────
    // STEP 1: GET DIVERSE SAMPLE
    // ──────────────────────────────────────────────────────
    const category = await prisma.category.findUnique({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' },
        include: { stocks: { include: { stock: true }, orderBy: { addedDate: 'desc' } } }
    });

    if (!category || category.stocks.length === 0) {
        console.log('No stocks found.');
        return;
    }

    // Group by addedDate, pick max 3 per date
    const dateMap = {};
    for (const s of category.stocks) {
        const d = s.addedDate.toISOString().split('T')[0];
        if (!dateMap[d]) dateMap[d] = [];
        dateMap[d].push(s);
    }

    const selected = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 15); // Need 10 days after + buffer

    for (const dateStr of Object.keys(dateMap).sort().reverse()) {
        if (selected.length >= 50) break;
        if (new Date(dateStr) > cutoffDate) continue;
        selected.push(...dateMap[dateStr].slice(0, 3));
    }

    console.log(`Selected ${selected.length} stocks across ${new Set(selected.map(s => s.addedDate.toISOString().split('T')[0])).size} dates\n`);

    // ──────────────────────────────────────────────────────
    // STEP 2: ANALYZE EACH STOCK
    // ──────────────────────────────────────────────────────
    const results = [];
    let fetchFail = 0, skipNoData = 0;

    for (const stock of selected) {
        const sym = stock.stock.symbol;
        const entryDate = new Date(stock.addedDate);
        const addDateStr = entryDate.toISOString().split('T')[0];

        // Fetch: 5 days before + 20 days after (need room for pullback + trade)
        const from = new Date(entryDate);
        from.setDate(from.getDate() - 8);
        let to = new Date(entryDate);
        to.setDate(to.getDate() + 25);
        if (to > new Date()) to = new Date();

        let candles;
        try {
            candles = await priceService.fetchPrice(
                sym, stock.stock.instrumentKey,
                from.toISOString().split('T')[0],
                to.toISOString().split('T')[0], 'day'
            );
            await sleep(200);
        } catch (e) {
            fetchFail++;
            process.stdout.write('x');
            continue;
        }

        if (!candles || candles.length < 5) {
            skipNoData++;
            process.stdout.write('.');
            continue;
        }

        // Find Day 0 (fuzzy ±3)
        let idx = -1;
        for (let offset = 0; offset <= 3; offset++) {
            for (const dir of [0, -1, 1]) {
                const tryDate = new Date(entryDate);
                tryDate.setDate(tryDate.getDate() + (offset * (dir || 1)));
                const tryStr = tryDate.toISOString().split('T')[0];
                const found = candles.findIndex(c => (c.timestamp || c.date || '').toString().startsWith(tryStr));
                if (found !== -1) { idx = found; break; }
            }
            if (idx !== -1) break;
        }

        if (idx === -1 || idx < 1) { skipNoData++; process.stdout.write('-'); continue; }

        const day0 = candles[idx];
        const dayM1 = candles[idx - 1];

        // ── MARK BROKEN SUPPORT LEVEL ──
        // For a breakdown: the broken level is approximately Day 0's open or previous close
        // (price opened near support, then broke down through it)
        // Use the HIGHER of: Day 0 open, Day -1 close (conservative resistance level)
        const brokenLevel = Math.max(day0.open, dayM1.close);

        // ── IMMEDIATE ENTRY (Our old approach) ──
        let immediateResult = null;
        const day1 = candles[idx + 1];
        if (day1) {
            const immEntry = day1.open;
            let immClose5 = immEntry;
            let immLowest = immEntry;
            let immHighest = immEntry;
            for (let d = 1; d <= 5; d++) {
                const c = candles[idx + d];
                if (!c) break;
                if (c.low < immLowest) immLowest = c.low;
                if (c.high > immHighest) immHighest = c.high;
                immClose5 = c.close;
            }
            const immPnl = ((immEntry - immClose5) / immEntry) * 100; // SHORT P&L
            const immMfe = ((immEntry - immLowest) / immEntry) * 100;
            const immMae = ((immHighest - immEntry) / immEntry) * 100;

            // Also check fixed stop/target
            let immFixedResult = 'TIMEOUT';
            let immFixedPnl = immPnl;
            for (let d = 1; d <= 10; d++) {
                const c = candles[idx + d];
                if (!c) break;
                if (c.high >= immEntry * 1.02) { immFixedResult = 'STOP'; immFixedPnl = -2.0; break; }
                if (c.low <= immEntry * 0.97) { immFixedResult = 'TARGET'; immFixedPnl = 3.0; break; }
            }

            immediateResult = {
                entry: immEntry,
                pnl_time: immPnl,
                pnl_fixed: immFixedPnl,
                mfe: immMfe,
                mae: immMae,
                fixedResult: immFixedResult
            };
        }

        // ── PULLBACK DETECTION (Day +1 to +10) ──
        let pullbackEntry = null;
        let pullbackDay = -1;
        let pullbackHigh = 0;

        // Scan for pullback: price coming BACK UP toward brokenLevel
        for (let d = 1; d <= 10; d++) {
            const c = candles[idx + d];
            if (!c) break;

            // Track highest point of pullback
            if (c.high > pullbackHigh) pullbackHigh = c.high;

            // Check: does this candle reach the broken level?
            const reachesLevel = c.high >= brokenLevel * 0.985; // Within 1.5%

            if (reachesLevel) {
                // Check for rejection
                const prevC = candles[idx + d - 1];
                if (!prevC) continue;

                const isRejection = isRejectionCandle(c, brokenLevel);
                const isLH = isLowerHigh(c, prevC);

                if (isRejection || isLH) {
                    // PULLBACK ENTRY TRIGGERED!
                    pullbackDay = d;
                    const pbEntryPrice = c.close; // Enter at close of rejection candle
                    const pbStop = pullbackHigh * 1.005; // Stop just above pullback high
                    const stopPct = ((pbStop - pbEntryPrice) / pbEntryPrice) * 100;

                    // Track outcome from pullback entry (next 5-10 days)
                    let pbLowest = pbEntryPrice;
                    let pbHighest = pbEntryPrice;
                    let pbClose5 = pbEntryPrice;
                    let pbDaysHeld = 0;
                    let pbStopped = false;

                    for (let dd = 1; dd <= 10; dd++) {
                        const cc = candles[idx + d + dd];
                        if (!cc) break;
                        pbDaysHeld = dd;
                        if (cc.low < pbLowest) pbLowest = cc.low;
                        if (cc.high > pbHighest) pbHighest = cc.high;

                        // Check if stopped out
                        if (cc.high >= pbStop) {
                            pbStopped = true;
                            break;
                        }
                        if (dd <= 5) pbClose5 = cc.close;
                    }

                    const pbPnlTime = ((pbEntryPrice - pbClose5) / pbEntryPrice) * 100;
                    const pbPnlTrail = pbStopped
                        ? -stopPct
                        : ((pbEntryPrice - pbLowest) / pbEntryPrice) * 100;
                    const pbMfe = ((pbEntryPrice - pbLowest) / pbEntryPrice) * 100;
                    const pbMae = ((pbHighest - pbEntryPrice) / pbEntryPrice) * 100;

                    pullbackEntry = {
                        day: pullbackDay,
                        entryPrice: pbEntryPrice,
                        stopPrice: pbStop,
                        stopPct,
                        pnl_time: pbPnlTime,
                        pnl_trail: pbPnlTrail,
                        mfe: pbMfe,
                        mae: pbMae,
                        stopped: pbStopped,
                        type: isRejection ? 'REJECTION' : 'LOWER_HIGH',
                        daysHeld: pbDaysHeld
                    };
                    break; // First valid pullback entry
                }
            }
        }

        // ── CLASSIFICATION ──
        let setupType = 'NO_PULLBACK';
        if (pullbackEntry) {
            setupType = pullbackEntry.type;
        } else if (pullbackHigh >= brokenLevel * 0.985) {
            setupType = 'PULLBACK_NO_REJECT'; // Pulled back but no clean rejection
        }

        results.push({
            symbol: sym,
            date: addDateStr,
            brokenLevel: brokenLevel.toFixed(2),
            setupType,
            // Immediate
            imm_pnl_time: immediateResult ? immediateResult.pnl_time.toFixed(2) : 'N/A',
            imm_pnl_fixed: immediateResult ? immediateResult.pnl_fixed.toFixed(2) : 'N/A',
            imm_mfe: immediateResult ? immediateResult.mfe.toFixed(2) : 'N/A',
            imm_mae: immediateResult ? immediateResult.mae.toFixed(2) : 'N/A',
            // Pullback
            pb_day: pullbackEntry ? pullbackEntry.day : 'N/A',
            pb_type: pullbackEntry ? pullbackEntry.type : 'N/A',
            pb_stop_pct: pullbackEntry ? pullbackEntry.stopPct.toFixed(2) : 'N/A',
            pb_pnl_time: pullbackEntry ? pullbackEntry.pnl_time.toFixed(2) : 'N/A',
            pb_pnl_trail: pullbackEntry ? pullbackEntry.pnl_trail.toFixed(2) : 'N/A',
            pb_mfe: pullbackEntry ? pullbackEntry.mfe.toFixed(2) : 'N/A',
            pb_mae: pullbackEntry ? pullbackEntry.mae.toFixed(2) : 'N/A',
            pb_stopped: pullbackEntry ? pullbackEntry.stopped : 'N/A',
            _imm: immediateResult,
            _pb: pullbackEntry
        });

        const icon = pullbackEntry ? (pullbackEntry.pnl_time > 0 ? 'P' : 'p') : (immediateResult && immediateResult.pnl_time > 0 ? '+' : '-');
        process.stdout.write(icon);
    }

    console.log(`\n\nAnalyzed: ${results.length} | Failed: ${fetchFail} | Skipped: ${skipNoData}\n`);

    if (results.length === 0) {
        console.log('No trades to analyze.');
        await prisma.$disconnect();
        return;
    }

    // ──────────────────────────────────────────────────────
    // STEP 3: AGGREGATE & COMPARE
    // ──────────────────────────────────────────────────────
    const withImm = results.filter(r => r._imm);
    const withPB = results.filter(r => r._pb);
    const noPB = results.filter(r => !r._pb);

    // Setup type distribution
    const setupCounts = {};
    results.forEach(r => { setupCounts[r.setupType] = (setupCounts[r.setupType] || 0) + 1; });

    // Immediate entry stats
    const immWinsTime = withImm.filter(r => r._imm.pnl_time > 0).length;
    const immWinsFixed = withImm.filter(r => r._imm.pnl_fixed > 0).length;
    const immAvgPnlTime = average(withImm.map(r => r._imm.pnl_time));
    const immTotalPnlTime = withImm.reduce((s, r) => s + r._imm.pnl_time, 0);
    const immAvgPnlFixed = average(withImm.map(r => r._imm.pnl_fixed));
    const immTotalPnlFixed = withImm.reduce((s, r) => s + r._imm.pnl_fixed, 0);
    const immAvgMfe = average(withImm.map(r => r._imm.mfe));
    const immAvgMae = average(withImm.map(r => r._imm.mae));

    // Pullback entry stats
    let pbWinsTime = 0, pbWinsTrail = 0, pbAvgPnlTime = 0, pbTotalPnlTime = 0;
    let pbAvgPnlTrail = 0, pbTotalPnlTrail = 0, pbAvgMfe = 0, pbAvgMae = 0;
    let pbAvgDay = 0, pbAvgStopPct = 0, pbStoppedCount = 0;

    if (withPB.length > 0) {
        pbWinsTime = withPB.filter(r => r._pb.pnl_time > 0).length;
        pbWinsTrail = withPB.filter(r => r._pb.pnl_trail > 0).length;
        pbAvgPnlTime = average(withPB.map(r => r._pb.pnl_time));
        pbTotalPnlTime = withPB.reduce((s, r) => s + r._pb.pnl_time, 0);
        pbAvgPnlTrail = average(withPB.map(r => r._pb.pnl_trail));
        pbTotalPnlTrail = withPB.reduce((s, r) => s + r._pb.pnl_trail, 0);
        pbAvgMfe = average(withPB.map(r => r._pb.mfe));
        pbAvgMae = average(withPB.map(r => r._pb.mae));
        pbAvgDay = average(withPB.map(r => r._pb.day));
        pbAvgStopPct = average(withPB.map(r => r._pb.stopPct));
        pbStoppedCount = withPB.filter(r => r._pb.stopped).length;
    }

    // ──────────────────────────────────────────────────────
    // STEP 4: GENERATE REPORTS
    // ──────────────────────────────────────────────────────

    // CSV
    const csvKeys = ['symbol', 'date', 'brokenLevel', 'setupType',
        'imm_pnl_time', 'imm_pnl_fixed', 'imm_mfe', 'imm_mae',
        'pb_day', 'pb_type', 'pb_stop_pct', 'pb_pnl_time', 'pb_pnl_trail', 'pb_mfe', 'pb_mae', 'pb_stopped'];
    const csvRows = results.map(r => csvKeys.map(k => r[k]).join(','));
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_bo_pullback_trades.csv'), [csvKeys.join(','), ...csvRows].join('\n'));

    // Markdown Report
    const md = [];
    md.push(`# Pullback Retest Strategy: HEAD-TO-HEAD Comparison`);
    md.push(`**Date**: ${new Date().toISOString()}`);
    md.push(`**Category**: SHORT_TERM_SWING_BO_DOWN`);
    md.push(`**Sample**: ${results.length} stocks across ${new Set(results.map(r => r.date)).size} dates`);
    md.push(``);

    md.push(`## Setup Type Distribution`);
    md.push(`| Setup Type | Count | % |`);
    md.push(`|---|---|---|`);
    Object.entries(setupCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
        md.push(`| ${k} | ${v} | ${(v / results.length * 100).toFixed(1)}% |`);
    });

    md.push(``);
    md.push(`## Head-to-Head: Immediate vs Pullback Entry`);
    md.push(`| Metric | Immediate (${withImm.length} trades) | Pullback (${withPB.length} trades) |`);
    md.push(`|---|---|---|`);
    md.push(`| **Win Rate (Time Exit)** | **${(immWinsTime / withImm.length * 100).toFixed(1)}%** | **${withPB.length ? (pbWinsTime / withPB.length * 100).toFixed(1) : 0}%** |`);
    md.push(`| Avg P&L (Time Exit) | ${immAvgPnlTime.toFixed(2)}% | ${pbAvgPnlTime.toFixed(2)}% |`);
    md.push(`| Total P&L (Time Exit) | ${immTotalPnlTime.toFixed(1)}% | ${pbTotalPnlTime.toFixed(1)}% |`);
    md.push(`| **Win Rate (Fixed SL/TP)** | **${(immWinsFixed / withImm.length * 100).toFixed(1)}%** | — |`);
    md.push(`| Avg P&L (Fixed SL/TP) | ${immAvgPnlFixed.toFixed(2)}% | — |`);
    md.push(`| **Avg MFE** | ${immAvgMfe.toFixed(2)}% | ${pbAvgMfe.toFixed(2)}% |`);
    md.push(`| **Avg MAE** | ${immAvgMae.toFixed(2)}% | ${pbAvgMae.toFixed(2)}% |`);
    md.push(`| **MFE/MAE Ratio** | ${(immAvgMfe / immAvgMae).toFixed(2)} | ${pbAvgMae > 0 ? (pbAvgMfe / pbAvgMae).toFixed(2) : 'N/A'} |`);

    if (withPB.length > 0) {
        md.push(``);
        md.push(`## Pullback Entry Details`);
        md.push(`- **Avg pullback day**: Day +${pbAvgDay.toFixed(1)} after breakout`);
        md.push(`- **Avg stop distance**: ${pbAvgStopPct.toFixed(2)}% (price-action based)`);
        md.push(`- **Stopped out**: ${pbStoppedCount}/${withPB.length} (${(pbStoppedCount / withPB.length * 100).toFixed(1)}%)`);
        md.push(`- **Rejection entries**: ${withPB.filter(r => r._pb.type === 'REJECTION').length}`);
        md.push(`- **Lower High entries**: ${withPB.filter(r => r._pb.type === 'LOWER_HIGH').length}`);
    }

    md.push(``);
    md.push(`## Top Pullback Trades`);
    if (withPB.length > 0) {
        const sortedPB = [...withPB].sort((a, b) => b._pb.pnl_time - a._pb.pnl_time);
        md.push(`### Winners`);
        sortedPB.filter(r => r._pb.pnl_time > 0).slice(0, 5).forEach(r => {
            md.push(`- **${r.symbol}** (${r.date}): Entry Day+${r._pb.day} via ${r._pb.type}, P&L=${r._pb.pnl_time.toFixed(2)}%, Stop=${r._pb.stopPct.toFixed(1)}%`);
        });
        md.push(`### Losers`);
        sortedPB.filter(r => r._pb.pnl_time <= 0).slice(-5).forEach(r => {
            md.push(`- **${r.symbol}** (${r.date}): Entry Day+${r._pb.day} via ${r._pb.type}, P&L=${r._pb.pnl_time.toFixed(2)}%, Stopped=${r._pb.stopped}`);
        });
    } else {
        md.push(`*No pullback entries triggered in the sample.*`);
    }

    md.push(``);
    md.push(`## Conclusion`);
    if (withPB.length === 0) {
        md.push(`No pullback setups were detected. The criteria may be too strict, or breakdowns in this category tend to be one-directional (no retests).`);
    } else {
        const immWR = (immWinsTime / withImm.length * 100);
        const pbWR = (pbWinsTime / withPB.length * 100);
        if (pbWR > immWR && pbTotalPnlTime > immTotalPnlTime) {
            md.push(`**Pullback entry OUTPERFORMS immediate entry.** WR: ${pbWR.toFixed(1)}% vs ${immWR.toFixed(1)}%, Total P&L: ${pbTotalPnlTime.toFixed(1)}% vs ${immTotalPnlTime.toFixed(1)}%.`);
        } else if (pbWR > immWR) {
            md.push(`**Pullback entry has better WR (${pbWR.toFixed(1)}%) but P&L comparison is mixed.**`);
        } else {
            md.push(`**Pullback entry did not outperform.** WR: ${pbWR.toFixed(1)}% vs ${immWR.toFixed(1)}%.`);
        }
    }

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_bo_pullback_comparison.md'), md.join('\n'));

    // Console summary
    console.log('══════════════════════════════════════════════════');
    console.log('SETUP DISTRIBUTION:');
    Object.entries(setupCounts).forEach(([k, v]) => console.log(`  ${k}: ${v} (${(v / results.length * 100).toFixed(1)}%)`));
    console.log('');
    console.log('IMMEDIATE ENTRY:');
    console.log(`  Trades: ${withImm.length} | WR(time): ${(immWinsTime / withImm.length * 100).toFixed(1)}% | Avg P&L: ${immAvgPnlTime.toFixed(2)}% | Total: ${immTotalPnlTime.toFixed(1)}%`);
    console.log(`  MFE: ${immAvgMfe.toFixed(2)}% | MAE: ${immAvgMae.toFixed(2)}% | Ratio: ${(immAvgMfe / immAvgMae).toFixed(2)}`);
    console.log('');
    console.log('PULLBACK ENTRY:');
    if (withPB.length > 0) {
        console.log(`  Trades: ${withPB.length} | WR(time): ${(pbWinsTime / withPB.length * 100).toFixed(1)}% | Avg P&L: ${pbAvgPnlTime.toFixed(2)}% | Total: ${pbTotalPnlTime.toFixed(1)}%`);
        console.log(`  MFE: ${pbAvgMfe.toFixed(2)}% | MAE: ${pbAvgMae.toFixed(2)}% | Ratio: ${pbAvgMae > 0 ? (pbAvgMfe / pbAvgMae).toFixed(2) : 'N/A'}`);
        console.log(`  Avg entry day: +${pbAvgDay.toFixed(1)} | Stopped: ${pbStoppedCount}/${withPB.length}`);
    } else {
        console.log('  No pullback entries triggered.');
    }
    console.log('══════════════════════════════════════════════════');
    console.log('\nReports saved.');

    await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
