/**
 * REGULAR NR7 VERIFICATION (Short Only)
 * 
 * Objectives:
 * 1. Analyze performance of Regular NR7 (isNR7 && !isInsideDay)
 * 2. Compare with Insider NR7 results
 * 3. Use PESSIMISTIC logic (Stop-First for ambiguous trades)
 * 4. Only check SHORT trades (since LONG is proven bad)
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
    // Only interested in SHORT for this study
    if (day1.close < day0.low) return 'SHORT';
    return null;
}

// Simulate trade with PESSIMISTIC assumption
function simulatePessimistic(candles, nr7Idx) {
    const day0 = candles[nr7Idx];
    const day1 = candles[nr7Idx + 1];
    if (!day1) return null;

    // SHORT logic only
    const entryPrice = day1.close;
    const stopLoss = day0.high * 1.005;
    const risk = Math.abs(entryPrice - stopLoss);
    if (risk <= 0) return null;
    const target = entryPrice - risk * 1.5;

    let exitDay = 'TIMEOUT';
    let pnl = 0;
    let exitReason = 'TIMEOUT';
    let ambiguous = false;

    for (let d = 1; d <= 5; d++) {
        const ci = nr7Idx + 1 + d;
        if (ci >= candles.length) break;
        const c = candles[ci];

        const hitTarget = c.low <= target;
        const hitStop = c.high >= stopLoss;

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
    out.push('║   REGULAR NR7 VERIFICATION (SHORT ONLY, PESSIMISTIC)      ║');
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

        const trades = [];
        let totalRegularNR7 = 0;
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
                if (isInsideDay(candles, i)) continue; // SKIP INSIDE DAYS (Pure Regular)

                totalRegularNR7++;

                const direction = getDirection(candles, i);
                if (direction !== 'SHORT') continue;

                // Perform pessimistic simulation
                const result = simulatePessimistic(candles, i);
                if (!result) continue;

                const dateStr = (candles[i].timestamp || candles[i].date).toString().split('T')[0];
                trades.push({
                    symbol: sym,
                    nr7Date: dateStr,
                    ...result
                });
            }
        }

        // RESULTS
        out.push(`\n\nTotal Regular (Non-Insider) NR7 signals: ${totalRegularNR7}`);
        out.push(`Breakout Signals (SHORT only, Day+1 Close < Low): ${trades.length}`);

        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl < 0);
        const winRate = trades.length > 0 ? (wins.length / trades.length * 100) : 0;
        const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
        const avgPnl = trades.length > 0 ? totalPnl / trades.length : 0;
        const ambiguousCount = trades.filter(t => t.ambiguous).length;

        out.push(`\n--- PESSIMISTIC PERFORMANCE (Stop-First) ---`);
        out.push(`Sample Size:      ${trades.length} trades`);
        out.push(`Win Rate:         ${winRate.toFixed(1)}%`);
        out.push(`Net P&L:          ${totalPnl.toFixed(1)}R`);
        out.push(`Avg P&L/Trade:    ${avgPnl.toFixed(3)}R`);
        out.push(`Ambiguous Trades: ${ambiguousCount} (counted as LOSS)`);

        out.push(`\n--- TRADE LIST ---`);
        out.push(`Symbol          | NR7 Date   | Entry    | P&L   | Exit    | Result               | Ambig?`);
        out.push(`${'─'.repeat(100)}`);
        for (const t of trades) {
            out.push(`${t.symbol.padEnd(15)} | ${t.nr7Date} | ${String(t.entry).padStart(8)} | ${String(t.pnl).padStart(5)} | ${t.exitDay.padEnd(7)} | ${t.exitReason.padEnd(20)} | ${t.ambiguous ? '⚠️' : ''}`);
        }

        // COMPARISON WITH INSIDE NR7
        out.push(`\n\n${'='.repeat(60)}`);
        out.push(`COMPARISON: Insider (Prev) vs Regular (This Report)`);
        out.push(`${'='.repeat(60)}`);
        out.push(`Metric          | Insider (8 trades) | Regular (${trades.length} trades)`);
        out.push(`────────────────┼────────────────────┼──────────────────────────`);
        out.push(`Win Rate        | 37.5%              | ${winRate.toFixed(1)}%`);
        out.push(`Net P&L         | -0.5R              | ${totalPnl.toFixed(1)}R`);
        out.push(`Avg P&L         | -0.063R            | ${avgPnl.toFixed(3)}R`);

    } catch (e) {
        out.push(`ERROR: ${e.message}`);
        out.push(e.stack);
    } finally {
        await prisma.$disconnect();
    }

    const reportPath = path.join(ARTIFACT_DIR, 'regular_nr7_report.txt');
    const report = out.join('\n');
    fs.writeFileSync(reportPath, report);
    console.log('\n\n' + report);
    console.log(`\nReport saved to: ${reportPath}`);
}

run();
