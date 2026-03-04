const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const strategy = require('../services/strategies/swingBoDownLongStrategy.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');

async function run() {
    console.log('=== RIGOROUS STRATEGY BACKTEST (LONG ONLY) ===\n');

    // 1. Fetch Candidates
    const category = await prisma.category.findUnique({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' },
        include: { stocks: { include: { stock: true } } }
    });

    if (!category) {
        console.error('Category not found');
        return;
    }

    // Filter valid dates (Aug 2025 - Feb 2026)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 5); // Ensure at least 5 days for outcome

    const entries = category.stocks
        .filter(s => new Date(s.addedDate) < cutoff)
        .sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate))
        .slice(0, 100); // LIMIT TO 100 FOR SPEED CHECK

    console.log(`Processing ${entries.length} signals...`);

    const trades = [];
    let processed = 0;

    for (const entry of entries) {
        const sym = entry.stock.symbol;
        const dateStr = entry.addedDate.toISOString().split('T')[0];

        // 2. Run Strategy Analysis (Logic Check)
        // Note: Strategy fetches its own history. 
        // We could optimize by fetching once here, but for correctness let's use the service as is.
        // Wait, the service uses `priceService.fetchPrice`. That is cached. So it's fine.

        let plan = null;
        try {
            // We need price history for analysis
            // But the service fetches it.
            // We ALSO need price history for Outcome verification (Post-Signal).
            // Let's fetch a large chunk here and pass it?
            // The service `analyze` takes symbol/date.

            // Let's call analyze first.
            // It internally fetches -20 days to SignalDate.
            plan = await strategy.analyze(sym, dateStr);
        } catch (e) {
            console.error(`Analysis failed for ${sym}:`, e);
            continue;
        }

        if (plan.error) {
            // content not enough usually
            continue;
        }

        // 3. Simulate Trade Outcome (Verification)
        // Fetch Future Data (Signal Date + 10 days)
        const fromDate = new Date(entry.addedDate);
        const toDate = new Date(entry.addedDate);
        toDate.setDate(toDate.getDate() + 15);

        let candles = [];
        try {
            candles = await priceService.fetchPrice(sym, null,
                fromDate.toISOString().split('T')[0],
                toDate.toISOString().split('T')[0], '30minute');
        } catch (e) { continue; }

        if (!candles || candles.length < 10) continue;
        candles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        // Locate Signal Day End
        const dayCandles = candles.filter(c => (c.timestamp || c.date).startsWith(dateStr));
        if (dayCandles.length === 0) continue;

        const lastSignalCandle = dayCandles[dayCandles.length - 1];
        const postIndex = candles.indexOf(lastSignalCandle) + 1;
        const postCandles = candles.slice(postIndex);

        if (postCandles.length === 0) continue;

        // ENTRY: Next Open
        const entryPrice = postCandles[0].open;
        const targetPrice = entryPrice * (1 + plan.targetPct / 100);
        const stopPrice = entryPrice * (1 - plan.stopPct / 100);

        // SIMULATE
        let exitPrice = postCandles[Math.min(postCandles.length - 1, 75)].close; // Default Time Stop
        let exitReason = 'TIME_STOP';
        let outcome = 'FLAT';
        let daysHeld = 0;

        for (let i = 0; i < postCandles.length && i < 75; i++) { // Max 5-6 days
            const c = postCandles[i];

            // Check Target
            if (c.high >= targetPrice) {
                exitPrice = targetPrice;
                exitReason = 'TARGET';
                outcome = 'WIN';
                daysHeld = Math.ceil(i / 13); // Approx days
                break;
            }
            // Check Stop
            if (c.low <= stopPrice) {
                exitPrice = stopPrice;
                exitReason = 'STOP';
                outcome = 'LOSS';
                daysHeld = Math.ceil(i / 13);
                break;
            }
        }

        const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;

        trades.push({
            Symbol: sym,
            Date: dateStr,
            Tier: plan.tier,
            Action: plan.action,
            Entry: entryPrice,
            Target: targetPrice.toFixed(2),
            Stop: stopPrice.toFixed(2),
            Exit: exitPrice,
            Pnl: pnlPct.toFixed(2),
            Outcome: outcome,
            Reason: exitReason
        });

        process.stdout.write('.');
        processed++;
    }

    console.log(`\nProcessed ${processed} trades.`);

    // 4. Generate Report
    const summary = {};
    const tiers = ['TIER 1 (OVERSOLD)', 'TIER 2 (FRESH)', 'TIER 3 (UPTREND)'];

    tiers.forEach(t => {
        const subset = trades.filter(tr => tr.Tier === t);
        const total = subset.length;
        const wins = subset.filter(tr => tr.Pnl > 0).length;
        const wr = total > 0 ? (wins / total * 100).toFixed(1) : 0;
        const avgPnl = total > 0 ? (subset.reduce((s, tr) => s + parseFloat(tr.Pnl), 0) / total).toFixed(2) : 0;

        summary[t] = { Count: total, WR: wr, AvgPnl: avgPnl };
    });

    console.table(summary);

    // Markdown
    const md = [];
    md.push(`# Rigorous Backtest Report: Swing Long Strategy`);
    md.push(`**Date**: ${new Date().toISOString().split('T')[0]}`);
    md.push(`**Total Trades**: ${trades.length}`);
    md.push(``);
    md.push(`| Tier | Count | Win Rate | Avg P&L |`);
    md.push(`|---|---|---|---|`);
    for (const [key, val] of Object.entries(summary)) {
        md.push(`| **${key}** | ${val.Count} | ${val.WR}% | **${val.AvgPnl}%** |`);
    }

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'rigorous_strategy_backtest.md'), md.join('\n'));
    console.log('Saved report to rigorous_strategy_backtest.md');
}

run().catch(console.error).finally(() => prisma.$disconnect());
