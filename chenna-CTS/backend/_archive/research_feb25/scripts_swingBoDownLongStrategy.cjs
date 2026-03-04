/**
 * SWING BO DOWN - LONG ONLY STRATEGY (3-TIER SYSTEM)
 * 
 * Objective:
 * Backtest the "Mean Reversion" strategy on SHORT_TERM_SWING_BO_DOWN stocks.
 * Classify signals into 3 Tiers based on Pre-Trend (10 Days).
 * Apply specific Target/Stop rules per Tier.
 * 
 * TIER 1: OVERSOLD REVERSAL (Best)
 * - Filter: Pre-Trend < -5%
 * - Entry: Day +1 Open
 * - Target: +6%
 * - Stop: -3%
 * 
 * TIER 2: FRESH DIP (Good)
 * - Filter: Pre-Trend -5% to 0%
 * - Entry: Day +1 Open
 * - Target: +4%
 * - Stop: -2%
 * 
 * TIER 3: UPTREND PULLBACK (Standard)
 * - Filter: Pre-Trend > 0%
 * - Entry: Day +1 Open
 * - Target: +4%
 * - Stop: -2%
 * 
 * EXIT RULES:
 * - Target Hit: Take Profit
 * - Stop Hit: Stop Loss
 * - Time Stop: Close at Day +5 Close if neither hit.
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
    console.log('=== SWING BO DOWN STRATEGY BACKTEST ===\n');

    // 1. Fetch Data
    const category = await prisma.category.findUnique({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' },
        include: { stocks: { include: { stock: true } } }
    });

    if (!category) return;

    // Filter valid dates (Aug 2025 - Feb 2026)
    // And limit to ensuring we have post-data
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const entries = category.stocks
        .filter(s => new Date(s.addedDate) < cutoff)
        .sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));

    console.log(`Analyzing ${entries.length} signals...`);

    const results = [];
    const trades = [];

    for (const entry of entries) {
        const sym = entry.stock.symbol;
        const dateStr = entry.addedDate.toISOString().split('T')[0];

        // Fetch [-15d, +10d]
        const fromDate = new Date(entry.addedDate);
        fromDate.setDate(fromDate.getDate() - 20);
        const toDate = new Date(entry.addedDate);
        toDate.setDate(toDate.getDate() + 10);

        let candles = [];
        try {
            candles = await priceService.fetchPrice(sym, entry.stock.instrumentKey,
                fromDate.toISOString().split('T')[0],
                toDate.toISOString().split('T')[0], '30minute');
        } catch (e) {
            console.log(`Failed ${sym}: ${e.message}`);
            continue;
        }

        if (!candles || candles.length < 50) continue;
        candles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        // Find Signal Day
        const signalCandles = candles.filter(c => (c.timestamp || c.date).startsWith(dateStr));
        if (signalCandles.length === 0) continue;

        const signalIdx = candles.indexOf(signalCandles[0]);
        const closeBox = signalCandles[signalCandles.length - 1];

        // Calc Pre-Trend (10 Days back from signal open)
        // Approx 75 candles back?
        // Let's use time-based search for 10 days prior
        const trendStartIdx = Math.max(0, signalIdx - 150); // Rough approx
        const price10d = candles[trendStartIdx].close;
        const price0d = signalCandles[0].open; // Compare to open of signal day
        const trendPct = ((price0d - price10d) / price10d) * 100;

        // Classify Tier
        let tier = 'NONE';
        let targetPct = 0;
        let stopPct = 0;

        if (trendPct < -5) {
            tier = 'TIER 1 (OVERSOLD)';
            targetPct = 6.0;
            stopPct = 5.0; // WIDENED STOP to survive volatility
        } else if (trendPct <= 0) {
            tier = 'TIER 2 (FRESH)';
            targetPct = 4.0;
            stopPct = 2.0;
        } else {
            tier = 'TIER 3 (UPTREND)';
            targetPct = 4.0;
            stopPct = 2.0;
        }

        // Simulate Trade
        // Entry: Next Day Open
        const postCandles = candles.slice(candles.indexOf(closeBox) + 1);
        if (postCandles.length === 0) continue;

        const entryPrice = postCandles[0].open;
        const targetPrice = entryPrice * (1 + targetPct / 100);
        const stopPrice = entryPrice * (1 - stopPct / 100);

        // Check next 5 days candles for Target/Stop
        let exitPrice = postCandles[Math.min(postCandles.length - 1, 75)].close; // Default Time Stop
        let exitReason = 'TIME_STOP';
        let outcome = 'FLAT';

        for (const c of postCandles.slice(0, 75)) { // 5 days * 15 candles/day? No 30min is 13/day. 75 is ~5-6 days.
            if (c.high >= targetPrice) {
                exitPrice = targetPrice;
                exitReason = 'TARGET';
                outcome = 'WIN';
                break;
            }
            if (c.low <= stopPrice) {
                exitPrice = stopPrice;
                exitReason = 'STOP';
                outcome = 'LOSS';
                break;
            }
        }

        const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;

        trades.push({
            Symbol: sym,
            Date: dateStr,
            Tier: tier,
            Trend10d: trendPct.toFixed(2),
            Entry: entryPrice,
            Exit: exitPrice,
            Reason: exitReason,
            Pnl: pnlPct.toFixed(2)
        });

        process.stdout.write('.');
    }

    console.log(`\nSimulated ${trades.length} trades.`);

    // Summary Stats
    const summary = {};
    ['TIER 1 (OVERSOLD)', 'TIER 2 (FRESH)', 'TIER 3 (UPTREND)'].forEach(t => {
        const subset = trades.filter(tr => tr.Tier === t);
        const wins = subset.filter(tr => tr.Pnl > 0).length;
        const total = subset.length;
        const wr = total > 0 ? (wins / total * 100).toFixed(1) : 0;
        const avgPnl = total > 0 ? (subset.reduce((s, tr) => s + parseFloat(tr.Pnl), 0) / total).toFixed(2) : 0;

        summary[t] = { Count: total, WR: wr, AvgPnl: avgPnl };
    });

    console.table(summary);

    // Generate Report
    const md = [];
    md.push(`# Long Strategy Backtest Results`);
    md.push(`**Signals**: ${trades.length}`);
    md.push(``);
    md.push(`| Tier | Count | Win Rate | Avg P&L |`);
    md.push(`|---|---|---|---|`);
    for (const [key, val] of Object.entries(summary)) {
        md.push(`| **${key}** | ${val.Count} | ${val.WR}% | **${val.AvgPnl}%** |`);
    }

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_long_strategy_results.md'), md.join('\n'));

    // CSV
    const csv = ['Symbol,Date,Tier,Trend10d,Entry,Exit,Reason,Pnl'];
    trades.forEach(t => csv.push(Object.values(t).join(',')));
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'final_long_trades.csv'), csv.join('\n'));
}

run().catch(console.error);
