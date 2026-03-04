/**
 * PRACTICAL SWING BREAKDOWN ANALYSIS
 * 
 * Fixes from previous attempt:
 * 1. Diverse dates (not all same day) — deduplicate by addedDate, pick 1-2 per date
 * 2. Measure only what's calculable with available data
 * 3. Test 5 strategy variants with REAL P&L (% based)
 * 4. Generate comparison report
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
    console.log('=== PRACTICAL SWING BREAKDOWN ANALYSIS ===\n');

    // ──────────────────────────────────────────────────────
    // STEP 1: GET DIVERSE SAMPLE (spread across dates)
    // ──────────────────────────────────────────────────────
    const category = await prisma.category.findUnique({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' },
        include: { stocks: { include: { stock: true }, orderBy: { addedDate: 'desc' } } }
    });

    if (!category || category.stocks.length === 0) {
        console.log('No stocks found.');
        return;
    }

    // Group by addedDate
    const dateMap = {};
    for (const s of category.stocks) {
        const d = s.addedDate.toISOString().split('T')[0];
        if (!dateMap[d]) dateMap[d] = [];
        dateMap[d].push(s);
    }

    const uniqueDates = Object.keys(dateMap).sort().reverse(); // newest first
    console.log(`Total unique dates: ${uniqueDates.length}`);
    console.log(`Total stocks: ${category.stocks.length}\n`);

    // Pick up to 3 stocks per date, across as many dates as needed, targeting 50
    const selected = [];
    const MAX_PER_DATE = 3;
    const TARGET = 50;

    // Skip dates too recent (need 7+ trading days after for follow-through)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 10); // At least 10 calendar days ago

    for (const dateStr of uniqueDates) {
        if (selected.length >= TARGET) break;
        if (new Date(dateStr) > cutoffDate) continue; // too recent

        const batch = dateMap[dateStr].slice(0, MAX_PER_DATE);
        selected.push(...batch);
    }

    console.log(`Selected ${selected.length} stocks across ${new Set(selected.map(s => s.addedDate.toISOString().split('T')[0])).size} unique dates`);
    console.log(`Date range: ${selected[selected.length - 1]?.addedDate.toISOString().split('T')[0]} to ${selected[0]?.addedDate.toISOString().split('T')[0]}\n`);

    // ──────────────────────────────────────────────────────
    // STEP 2: FETCH DATA AND MEASURE
    // ──────────────────────────────────────────────────────
    const trades = [];
    let fetchOk = 0, fetchFail = 0, skipNoData = 0;

    for (const stock of selected) {
        const sym = stock.stock.symbol;
        const entryDate = new Date(stock.addedDate);
        const addDateStr = entryDate.toISOString().split('T')[0];

        // Fetch: 10 days before + 10 days after
        const from = new Date(entryDate);
        from.setDate(from.getDate() - 15);
        let to = new Date(entryDate);
        to.setDate(to.getDate() + 15);
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

        if (!candles || candles.length < 3) {
            skipNoData++;
            process.stdout.write('.');
            continue;
        }

        // Find Day 0 (trigger day) — fuzzy ±3
        let idx = -1;
        for (let offset = 0; offset <= 3; offset++) {
            for (const dir of [0, -1, 1]) {
                const tryDate = new Date(entryDate);
                tryDate.setDate(tryDate.getDate() + (offset * (dir || 1)));
                const tryStr = tryDate.toISOString().split('T')[0];
                const found = candles.findIndex(c => {
                    const ts = (c.timestamp || c.date || '').toString();
                    return ts.startsWith(tryStr);
                });
                if (found !== -1) { idx = found; break; }
            }
            if (idx !== -1) break;
        }

        if (idx === -1 || idx < 1) {
            skipNoData++;
            process.stdout.write('-');
            continue;
        }

        // Need at least Day 0 + Day +1 through +5
        const day0 = candles[idx];
        const dayM1 = candles[idx - 1]; // Day -1
        const day1 = candles[idx + 1];  // Day +1

        if (!day1) {
            skipNoData++;
            process.stdout.write('?');
            continue;
        }

        // ── Day 0 Metrics ──
        const d0_color = day0.close >= day0.open ? 'GREEN' : 'RED';
        const d0_range = day0.high - day0.low;
        const d0_close_position = d0_range > 0 ? (day0.close - day0.low) / d0_range : 0.5;
        const d0_body_ratio = d0_range > 0 ? Math.abs(day0.close - day0.open) / d0_range : 0;
        const d0_vol_vs_prev = dayM1.volume > 0 ? day0.volume / dayM1.volume : 1;

        // ── Day +1 Metrics ──
        const d1_gap_pct = ((day1.open - day0.close) / day0.close) * 100;
        const d1_close_vs_d0low = day1.close < day0.low ? 'BELOW' : 'ABOVE';
        const d1_direction = day1.close < day1.open ? 'DOWN' : 'UP';

        // ── MFE / MAE (Day +1 to +5) ──
        const entryPrice = day1.open; // SHORT entry
        let lowestLow = entryPrice;
        let highestHigh = entryPrice;
        let day5Close = entryPrice;
        let daysAvail = 0;

        for (let d = 1; d <= 5; d++) {
            const c = candles[idx + d];
            if (!c) break;
            daysAvail = d;
            if (c.low < lowestLow) lowestLow = c.low;
            if (c.high > highestHigh) highestHigh = c.high;
            day5Close = c.close;
        }

        if (daysAvail < 3) {
            skipNoData++;
            process.stdout.write('?');
            continue;
        }

        const mfe_pct = ((entryPrice - lowestLow) / entryPrice) * 100; // Favorable for SHORT
        const mae_pct = ((highestHigh - entryPrice) / entryPrice) * 100; // Adverse for SHORT
        const final_pnl_pct = ((entryPrice - day5Close) / entryPrice) * 100; // P&L if held 5 days

        // ── Strategy Simulations ──
        const strats = {};

        // Strategy A: Fixed 2% Stop / 3% Target (SHORT)
        {
            const stop = entryPrice * 1.02;
            const target = entryPrice * 0.97;
            let result = 'TIMEOUT';
            let pnl = 0;
            for (let d = 1; d <= 5; d++) {
                const c = candles[idx + d];
                if (!c) break;
                // Check stop first (conservative)
                if (c.high >= stop) { result = 'LOSS'; pnl = -2.0; break; }
                if (c.low <= target) { result = 'WIN'; pnl = 3.0; break; }
            }
            if (result === 'TIMEOUT') {
                pnl = final_pnl_pct;
                result = pnl > 0 ? 'WIN' : 'LOSS';
            }
            strats.A = { result, pnl };
        }

        // Strategy B: Time Exit (Day +5 Close, no stop)
        {
            const pnl = final_pnl_pct;
            strats.B = { result: pnl > 0 ? 'WIN' : 'LOSS', pnl };
        }

        // Strategy C: Confirmed Entry (only if Day +1 closes below Day 0 low)
        {
            if (day1.close < day0.low) {
                // Enter at Day +2 open
                const c2 = candles[idx + 2];
                if (c2) {
                    const entry2 = c2.open;
                    let low2 = entry2, high2 = entry2, close5 = entry2;
                    for (let d = 2; d <= 5; d++) {
                        const c = candles[idx + d];
                        if (!c) break;
                        if (c.low < low2) low2 = c.low;
                        if (c.high > high2) high2 = c.high;
                        close5 = c.close;
                    }
                    const pnl = ((entry2 - close5) / entry2) * 100;
                    strats.C = { result: pnl > 0 ? 'WIN' : 'LOSS', pnl };
                } else {
                    strats.C = null; // No data
                }
            } else {
                strats.C = null; // Filtered out
            }
        }

        // Strategy D: Gap Down Filter (only if Day +1 gap down > 0.5%)
        {
            if (d1_gap_pct < -0.5) {
                strats.D = { result: final_pnl_pct > 0 ? 'WIN' : 'LOSS', pnl: final_pnl_pct };
            } else {
                strats.D = null; // Filtered out
            }
        }

        // Strategy E: Low Volume Filter (only if Day 0 vol < 1.5x prev)
        {
            if (d0_vol_vs_prev < 1.5) {
                strats.E = { result: final_pnl_pct > 0 ? 'WIN' : 'LOSS', pnl: final_pnl_pct };
            } else {
                strats.E = null; // Filtered out (high volume)
            }
        }

        trades.push({
            symbol: sym,
            date: addDateStr,
            d0_color,
            d0_close_position: d0_close_position.toFixed(2),
            d0_body_ratio: d0_body_ratio.toFixed(2),
            d0_vol_vs_prev: d0_vol_vs_prev.toFixed(2),
            d1_gap_pct: d1_gap_pct.toFixed(2),
            d1_close_vs_d0low,
            d1_direction,
            mfe_pct: mfe_pct.toFixed(2),
            mae_pct: mae_pct.toFixed(2),
            final_pnl_pct: final_pnl_pct.toFixed(2),
            strat_A: strats.A ? `${strats.A.result}(${strats.A.pnl.toFixed(1)}%)` : 'N/A',
            strat_B: strats.B ? `${strats.B.result}(${strats.B.pnl.toFixed(1)}%)` : 'N/A',
            strat_C: strats.C ? `${strats.C.result}(${strats.C.pnl.toFixed(1)}%)` : 'SKIP',
            strat_D: strats.D ? `${strats.D.result}(${strats.D.pnl.toFixed(1)}%)` : 'SKIP',
            strat_E: strats.E ? `${strats.E.result}(${strats.E.pnl.toFixed(1)}%)` : 'SKIP',
            _strats: strats // For aggregation
        });

        process.stdout.write(strats.B.pnl > 0 ? '+' : '-');
    }

    console.log(`\n\nFetched: ${fetchOk + trades.length} | Failed: ${fetchFail} | Skipped: ${skipNoData}`);
    console.log(`Analyzed: ${trades.length} trades\n`);

    if (trades.length === 0) {
        console.log('No trades to analyze.');
        await prisma.$disconnect();
        return;
    }

    // ──────────────────────────────────────────────────────
    // STEP 3: AGGREGATE STRATEGY RESULTS
    // ──────────────────────────────────────────────────────
    function calcStats(label, tradeList) {
        const valid = tradeList.filter(Boolean);
        if (valid.length === 0) return { label, trades: 0, wr: 0, avgPnl: 0, totalPnl: 0 };
        const wins = valid.filter(t => t.result === 'WIN').length;
        const wr = (wins / valid.length * 100);
        const avgPnl = valid.reduce((s, t) => s + t.pnl, 0) / valid.length;
        const totalPnl = valid.reduce((s, t) => s + t.pnl, 0);
        return { label, trades: valid.length, wr, avgPnl, totalPnl };
    }

    const stratResults = {
        A: calcStats('A: Fixed 2%SL/3%TP', trades.map(t => t._strats.A)),
        B: calcStats('B: Time Exit (5d)', trades.map(t => t._strats.B)),
        C: calcStats('C: Confirmed Entry', trades.map(t => t._strats.C)),
        D: calcStats('D: Gap Down Filter', trades.map(t => t._strats.D)),
        E: calcStats('E: Low Vol Filter', trades.map(t => t._strats.E)),
    };

    // ──────────────────────────────────────────────────────
    // STEP 4: DAY 0 BEHAVIOR ANALYSIS
    // ──────────────────────────────────────────────────────
    const winners = trades.filter(t => t._strats.B.result === 'WIN');
    const losers = trades.filter(t => t._strats.B.result === 'LOSS');

    function pctWithCondition(arr, condFn) {
        if (arr.length === 0) return 0;
        return (arr.filter(condFn).length / arr.length * 100);
    }

    const behaviorAnalysis = [
        {
            factor: 'Day 0 RED candle',
            winPct: pctWithCondition(winners, t => t.d0_color === 'RED'),
            losePct: pctWithCondition(losers, t => t.d0_color === 'RED')
        },
        {
            factor: 'Day 0 close near low (<0.3)',
            winPct: pctWithCondition(winners, t => parseFloat(t.d0_close_position) < 0.3),
            losePct: pctWithCondition(losers, t => parseFloat(t.d0_close_position) < 0.3)
        },
        {
            factor: 'Day 0 big body (>0.6)',
            winPct: pctWithCondition(winners, t => parseFloat(t.d0_body_ratio) > 0.6),
            losePct: pctWithCondition(losers, t => parseFloat(t.d0_body_ratio) > 0.6)
        },
        {
            factor: 'Day 0 vol spike (>1.5x)',
            winPct: pctWithCondition(winners, t => parseFloat(t.d0_vol_vs_prev) > 1.5),
            losePct: pctWithCondition(losers, t => parseFloat(t.d0_vol_vs_prev) > 1.5)
        },
        {
            factor: 'Day +1 gap down',
            winPct: pctWithCondition(winners, t => parseFloat(t.d1_gap_pct) < -0.5),
            losePct: pctWithCondition(losers, t => parseFloat(t.d1_gap_pct) < -0.5)
        },
        {
            factor: 'Day +1 closes below D0 low',
            winPct: pctWithCondition(winners, t => t.d1_close_vs_d0low === 'BELOW'),
            losePct: pctWithCondition(losers, t => t.d1_close_vs_d0low === 'BELOW')
        },
        {
            factor: 'Day +1 direction DOWN',
            winPct: pctWithCondition(winners, t => t.d1_direction === 'DOWN'),
            losePct: pctWithCondition(losers, t => t.d1_direction === 'DOWN')
        }
    ];

    // ──────────────────────────────────────────────────────
    // STEP 5: GENERATE REPORTS
    // ──────────────────────────────────────────────────────

    // CSV
    const csvKeys = ['symbol', 'date', 'd0_color', 'd0_close_position', 'd0_body_ratio',
        'd0_vol_vs_prev', 'd1_gap_pct', 'd1_close_vs_d0low', 'd1_direction',
        'mfe_pct', 'mae_pct', 'final_pnl_pct', 'strat_A', 'strat_B', 'strat_C', 'strat_D', 'strat_E'];
    const csvHeader = csvKeys.join(',');
    const csvRows = trades.map(t => csvKeys.map(k => t[k]).join(','));
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_bo_down_trades.csv'), [csvHeader, ...csvRows].join('\n'));

    // Markdown Report
    const md = [];
    md.push(`# Practical Swing Breakdown Analysis`);
    md.push(`**Date**: ${new Date().toISOString()}`);
    md.push(`**Category**: SHORT_TERM_SWING_BO_DOWN`);
    md.push(`**Sample**: ${trades.length} stocks across ${new Set(trades.map(t => t.date)).size} unique dates`);
    md.push(`**Date Range**: ${trades[trades.length - 1]?.date} to ${trades[0]?.date}`);
    md.push(``);

    md.push(`## Strategy Comparison`);
    md.push(`| Strategy | Trades | Win Rate | Avg P&L | Total P&L |`);
    md.push(`|---|---|---|---|---|`);
    Object.values(stratResults).forEach(s => {
        md.push(`| ${s.label} | ${s.trades} | **${s.wr.toFixed(1)}%** | ${s.avgPnl.toFixed(2)}% | ${s.totalPnl.toFixed(1)}% |`);
    });

    md.push(``);
    md.push(`## Winner vs Loser Behavior (Strategy B baseline)`);
    md.push(`| Factor | Winners (${winners.length}) | Losers (${losers.length}) | Diff |`);
    md.push(`|---|---|---|---|`);
    behaviorAnalysis.forEach(b => {
        const diff = (b.winPct - b.losePct).toFixed(1);
        md.push(`| ${b.factor} | ${b.winPct.toFixed(1)}% | ${b.losePct.toFixed(1)}% | **${diff}%** |`);
    });

    md.push(``);
    md.push(`## MFE/MAE Distribution`);
    const avgMFE = average(trades.map(t => parseFloat(t.mfe_pct)));
    const avgMAE = average(trades.map(t => parseFloat(t.mae_pct)));
    md.push(`- **Avg MFE (Max Favorable)**: ${avgMFE.toFixed(2)}% (how far price went in our favor)`);
    md.push(`- **Avg MAE (Max Adverse)**: ${avgMAE.toFixed(2)}% (how far price went against us)`);
    md.push(`- **MFE/MAE Ratio**: ${(avgMFE / avgMAE).toFixed(2)} (>1 = more reward than risk)`);

    md.push(``);
    md.push(`## Top 5 Winners (by P&L)`);
    const sorted = [...trades].sort((a, b) => parseFloat(b.final_pnl_pct) - parseFloat(a.final_pnl_pct));
    sorted.slice(0, 5).forEach(t => {
        md.push(`- **${t.symbol}** (${t.date}): P&L=${t.final_pnl_pct}%, MFE=${t.mfe_pct}%, D0=${t.d0_color}, VolRatio=${t.d0_vol_vs_prev}x`);
    });

    md.push(``);
    md.push(`## Top 5 Losers (by P&L)`);
    sorted.slice(-5).reverse().forEach(t => {
        md.push(`- **${t.symbol}** (${t.date}): P&L=${t.final_pnl_pct}%, MAE=${t.mae_pct}%, D0=${t.d0_color}, VolRatio=${t.d0_vol_vs_prev}x`);
    });

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_bo_down_strategy_comparison.md'), md.join('\n'));

    // Console summary
    console.log('──────────────────────────────────────────');
    console.log('STRATEGY COMPARISON:');
    console.log('──────────────────────────────────────────');
    Object.values(stratResults).forEach(s => {
        console.log(`${s.label.padEnd(25)} | Trades: ${String(s.trades).padStart(3)} | WR: ${s.wr.toFixed(1).padStart(5)}% | Avg: ${s.avgPnl.toFixed(2).padStart(6)}% | Total: ${s.totalPnl.toFixed(1).padStart(7)}%`);
    });
    console.log('──────────────────────────────────────────');
    console.log('\nReports saved.');

    await prisma.$disconnect();
}

function average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

run().catch(e => { console.error(e); process.exit(1); });
