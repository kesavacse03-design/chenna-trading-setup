/**
 * CONTEXT-AWARE SWING STRATEGY
 * 
 * Implements the "Pro Trader Decision Tree":
 * 1. Filter raw scanner output by Weekly Trend (approximated by Daily 100 SMA).
 * 2. Classify: Trend Aligned (Short) vs Counter Trend (Values/Bounce).
 * 3. Simulate specific setup: Pullback to 20-Day EMA.
 * 
 * Target: SHORT_TERM_SWING_BO_DOWN
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function run() {
    console.log('=== CONTEXT-AWARE SWING STRATEGY ===\n');

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
    cutoffDate.setDate(cutoffDate.getDate() - 20); // Need time for post-breakout

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

        // Fetch: 250 days before (safe for 100 SMA) + 25 days after
        const from = new Date(entryDate);
        from.setDate(from.getDate() - 250);
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
            console.log(`Fetch failed for ${sym}: ${e.message}`);
            fetchFail++;
            continue;
        }

        if (!candles || candles.length < 110) {
            console.log(`Skip ${sym}: Insufficient candles (${candles ? candles.length : 0})`);
            skipNoData++;
            continue;
        }

        // Sort ASCENDING (Oldest first)
        candles.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

        // Find Day 0
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

        if (idx === -1) {
            console.log(`Skip ${sym}: Date ${addDateStr} not found in range ${candles[0].date} - ${candles[candles.length - 1].date}`);
            skipNoData++;
            continue;
        }

        if (idx < 100) {
            console.log(`Skip ${sym}: Index ${idx} < 100 (Need history for SMA). Range: ${candles[0].date} to ${candles[candles.length - 1].date}`);
            skipNoData++;
            continue;
        }

        const day0 = candles[idx];

        // ── 1. CONTEXT (Day 0) ──
        // Calculate SMA 100 (Weekly Trend Proxy)
        const sma100 = TA.calculateSMA(candles.slice(0, idx + 1), 100);
        const sma50 = TA.calculateSMA(candles.slice(0, idx + 1), 50);
        const ema20 = TA.calculateEMA(candles.slice(0, idx + 1), 20);
        const rsi = TA.calculateRSI(candles.slice(0, idx + 1), 14);

        // Determine Trend
        const weeklyTrend = (day0.close < sma100) ? 'DOWN' : 'UP';
        const dailyTrend = (day0.close < ema20) ? 'DOWN' : 'UP';

        let classification = 'NOISE';
        if (weeklyTrend === 'DOWN' && dailyTrend === 'DOWN') classification = 'ALIGNED_SHORT';
        else if (weeklyTrend === 'UP' && dailyTrend === 'DOWN') classification = 'COUNTER_PULLBACK'; // Potential Buy Dip
        else if (weeklyTrend === 'UP' && dailyTrend === 'UP') classification = 'ALIGNED_LONG'; // Shouldn't happen in BO DOWN?
        else classification = 'MIXED';

        // ── 2. EXECUTION (Simulate Short Setup) ──
        // Strategy: Wait for price to touch 20 EMA from below (Pullback)
        // Entry: Rejection at 20 EMA

        let entry = null;

        // Scan Day +1 to +10 for pullback to 20 EMA
        for (let d = 1; d <= 15; d++) {
            const c = candles[idx + d];
            if (!c) break;

            // Recalculate EMA for this day (dynamic)
            // Efficient: Update previous EMA? Or recalc window?
            // Simple: Recalc precise EMA using TA (slow but accurate)
            const currentEma20 = TA.calculateEMA(candles.slice(0, idx + d + 1), 20);

            // Check touch
            // High >= EMA (touched from below)
            if (c.high >= currentEma20) {
                // Check Rejection (Close < Open, Wick)
                const isRed = c.close < c.open;
                const rejection = c.close < currentEma20; // Closed back below EMA?

                if (rejection) {
                    // Valid Entry
                    const entryPrice = c.close;
                    const stopPrice = Math.max(c.high, currentEma20) * 1.005; // Swing high/EMA
                    const stopPct = ((stopPrice - entryPrice) / entryPrice) * 100;

                    // Track Outcome
                    let result = 'TIMEOUT'; // 5 days hold? Or Trail?
                    let pnl = 0;

                    // Trail Stop: Previous Day High? Or Swing High?
                    // Let's use Time Exit (5 Days) for comparison baseline
                    let close5 = entryPrice;
                    let stopped = false;
                    for (let dd = 1; dd <= 5; dd++) {
                        const cc = candles[idx + d + dd];
                        if (!cc) break;
                        if (cc.high >= stopPrice) { stopped = true; break; }
                        close5 = cc.close;
                    }

                    pnl = stopped ? -stopPct : ((entryPrice - close5) / entryPrice) * 100;

                    entry = {
                        day: d,
                        ema: currentEma20,
                        price: entryPrice,
                        stopPct,
                        pnl,
                        stopped
                    };
                    break;
                }
            }
        }

        results.push({
            symbol: sym,
            date: addDateStr,
            weeklyTrend,
            dailyTrend,
            rsi: rsi.toFixed(1),
            classification,
            entryDay: entry ? entry.day : 'N/A',
            entryPnl: entry ? entry.pnl.toFixed(2) : 'N/A',
            stopped: entry ? entry.stopped : 'N/A'
        });

        process.stdout.write(entry && entry.pnl > 0 ? '+' : '-');
    }

    console.log(`\n\nAnalyzed: ${results.length} | Failed: ${fetchFail} | Skipped: ${skipNoData}\n`);

    if (results.length === 0) {
        console.log('No trades to analyze.');
        await prisma.$disconnect();
        return;
    }

    // ──────────────────────────────────────────────────────
    // STEP 3: COMPARE PERFORMANCE
    // ──────────────────────────────────────────────────────
    function calcStats(label, list) {
        const trades = list.filter(r => r.entryDay !== 'N/A');
        if (trades.length === 0) return { label, count: 0, wr: 0, avg: 0, total: 0 };
        const wins = trades.filter(r => parseFloat(r.entryPnl) > 0).length;
        const totalPnl = trades.reduce((s, r) => s + parseFloat(r.entryPnl), 0);
        return {
            label,
            count: trades.length,
            wr: (wins / trades.length * 100),
            avg: totalPnl / trades.length,
            total: totalPnl
        };
    }

    const alignedShorts = results.filter(r => r.classification === 'ALIGNED_SHORT');
    const counterShorts = results.filter(r => r.classification === 'COUNTER_PULLBACK');

    const statsAligned = calcStats('ALIGNED (Weekly DOWN)', alignedShorts);
    const statsCounter = calcStats('COUNTER (Weekly UP)', counterShorts);
    const statsAll = calcStats('ALL TRADES', results);

    // ──────────────────────────────────────────────────────
    // STEP 4: REPORT
    // ──────────────────────────────────────────────────────
    const md = [];
    md.push(`# Context-Aware Swing Strategy Report`);
    md.push(`**Date**: ${new Date().toISOString()}`);
    md.push(`**Method**: Filter by Weekly Trend (100 SMA) -> Enter on Pullback to 20 EMA`);
    md.push(``);

    md.push(`## Classification Distribution`);
    const counts = {};
    results.forEach(r => counts[r.classification] = (counts[r.classification] || 0) + 1);
    Object.entries(counts).forEach(([k, v]) => md.push(`- **${k}**: ${v} (${(v / results.length * 100).toFixed(1)}%)`));

    md.push(``);
    md.push(`## Performance by Context`);
    md.push(`| Context | Trades | Win Rate | Avg P&L | Total P&L |`);
    md.push(`|---|---|---|---|---|`);
    [statsAligned, statsCounter, statsAll].forEach(s => {
        md.push(`| ${s.label} | ${s.count} | **${s.wr.toFixed(1)}%** | ${s.avg.toFixed(2)}% | ${s.total.toFixed(1)}% |`);
    });

    md.push(``);
    md.push(`## Key Insight`);
    if (statsAligned.wr > statsCounter.wr) {
        md.push(`**Trend Alignment WORKS.** Trading WITH the Weekly Trend (${statsAligned.wr.toFixed(1)}% WR) outperforms Counter Trend (${statsCounter.wr.toFixed(1)}% WR).`);
    } else {
        md.push(`**Trend Alignment did NOT outperform.** Counter Trend trades performed similarly or better.`);
    }

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_context_report.md'), md.join('\n'));

    console.log('──────────────────────────────────────────');
    console.log(`ALIGNED (Weekly DOWN): ${statsAligned.count} trades | WR: ${statsAligned.wr.toFixed(1)}% | Total: ${statsAligned.total.toFixed(1)}%`);
    console.log(`COUNTER (Weekly UP):   ${statsCounter.count} trades | WR: ${statsCounter.wr.toFixed(1)}% | Total: ${statsCounter.total.toFixed(1)}%`);
    console.log('──────────────────────────────────────────');
    console.log('\nReport saved.');

    await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
