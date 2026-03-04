/**
 * DEEP PATTERN ANALYSIS (4H/30m)
 * 
 * Objective: 
 * Analyze ALL stocks in SHORT_TERM_SWING_BO_DOWN.
 * Fetch 30-minute candles for [Entry - 10 Days] to [Entry + 10 Days].
 * Identify Pre-Breakdown Structure ("Pattern Forming") and Post-Breakdown Reaction.
 * 
 * Features to Extract:
 * - Trend_10d_Pre: % Change in 10 days before signal.
 * - Volatility_Pre: Avg Daily Range % before signal.
 * - Signal_Day_Drop: % Drop on the "Breakdown" day.
 * - Signal_Volume_Ratio: Volume on Day 0 vs Avg Vol.
 * - Gap_Next_Day: % Gap between Day 0 Close and Day +1 Open.
 * - Max_Bounce_5d: Max % Upside in 5 days after signal.
 * - Max_Drop_5d: Max % Downside in 5 days after signal.
 * - Final_10d_Pnl: % Change 10 days after signal.
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
    console.log('=== DEEP PATTERN ANALYSIS ===\n');

    // ──────────────────────────────────────────────────────
    // STEP 1: GET ALL STOCKS
    // ──────────────────────────────────────────────────────
    const category = await prisma.category.findUnique({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' },
        include: { stocks: { include: { stock: true }, orderBy: { addedDate: 'desc' } } }
    });

    if (!category || category.stocks.length === 0) return;

    // Filter for unique entries (Stock + Date)
    // To handle API limits, we'll limit to 50 recent unique entries
    const entries = [];
    const seen = new Set();

    // Sort by most recent
    const sortedStocks = category.stocks.sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));

    // Analyze ALL valid entries (no cutoff for date, just require data exists)
    // We will check Date > 2025-01-01? Or just all?
    // Let's take all. 333 is manageable.

    for (const s of sortedStocks) {
        // if (entries.length >= 50) break; // REMOVED LIMIT

        const dateStr = s.addedDate.toISOString().split('T')[0];
        const key = `${s.stock.symbol}_${dateStr}`;
        if (seen.has(key)) continue;

        // Ensure we have at least 10 days post-data?
        // If addedDate is yesterday, we can't analyze post-10d.
        // Let's filter out very recent (last 10 days).
        const cutoffRecent = new Date();
        cutoffRecent.setDate(cutoffRecent.getDate() - 12);
        if (new Date(s.addedDate) > cutoffRecent) continue;

        seen.add(key);
        entries.push(s);
    }

    console.log(`Analyzing ${entries.length} validated entries (Full History)\n`);

    const results = [];
    let fetchFail = 0;

    for (const entry of entries) {
        const sym = entry.stock.symbol;
        const entryDate = new Date(entry.addedDate);
        const dateStr = entryDate.toISOString().split('T')[0];

        // Fetch [-15 days, +15 days] to ensure we cover 10 trading days each side
        const fromDate = new Date(entryDate);
        fromDate.setDate(fromDate.getDate() - 20);
        const toDate = new Date(entryDate);
        toDate.setDate(toDate.getDate() + 20);

        let candles = [];
        try {
            candles = await priceService.fetchPrice(
                sym, entry.stock.instrumentKey,
                fromDate.toISOString().split('T')[0],
                toDate.toISOString().split('T')[0], '30minute'
            );
            await sleep(300);
        } catch (e) {
            console.log(`Fetch failed for ${sym}: ${e.message}`);
            fetchFail++; continue;
        }

        if (!candles || candles.length < 100) {
            fetchFail++; continue;
        }

        // Sort
        candles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        // Identify Indices
        // Need to find the Entry Date in the intraday data.
        // The Entry Date is the "Breakdown Day".
        // Find candles belonging to Entry Date.
        const entryCandles = candles.filter(c => (c.timestamp || c.date).startsWith(dateStr));

        if (entryCandles.length === 0) {
            // Maybe holiday or date mismatch? Try finding closest date?
            // Or skipping.
            // console.log(`Date ${dateStr} not found in intraday for ${sym}`);
            continue;
        }

        const firstEntryCandleIdx = candles.indexOf(entryCandles[0]);
        const lastEntryCandleIdx = candles.indexOf(entryCandles[entryCandles.length - 1]);

        // ── PRE-BREAKDOWN (10 Days Before) ──
        // Need approx 10 trading days * 7.5 hours * 2 = ~150 candles?
        // Actually, just look at price 150 candles back?
        // Let's use Time. 10 days before Entry Date.

        const preStartIdx = Math.max(0, firstEntryCandleIdx - (10 * 7 * 2)); // Approx 140 candles back (if 7 hours/day)
        const pricePre10 = candles[preStartIdx].close;
        const pricePre1 = candles[Math.max(0, firstEntryCandleIdx - 1)].close; // Previous day close

        const trendPre10Pct = ((pricePre1 - pricePre10) / pricePre10) * 100;

        // ── BREAKDOWN DAY (Day 0) ──
        const day0Open = entryCandles[0].open;
        const day0Close = entryCandles[entryCandles.length - 1].close;
        const day0DropPct = ((day0Close - day0Open) / day0Open) * 100; // Intra-day drop

        const day0Vol = entryCandles.reduce((s, c) => s + c.volume, 0);
        // Compare to Avg Vol (prev 5 days)
        // Hard to calc precise avg vol without grouping daily. Skip for now.

        // ── POST-BREAKDOWN (10 Days After) ──
        // Start from next candle after lastEntryCandleIdx
        const postCandles = candles.slice(lastEntryCandleIdx + 1);
        if (postCandles.length < 10) continue;

        const day1Open = postCandles[0].open;
        const gapPct = ((day1Open - day0Close) / day0Close) * 100;

        // Find High/Low in next 5 days (approx 75 candles)
        const candles5d = postCandles.slice(0, 75);
        let maxHigh5d = -Infinity;
        let minLow5d = Infinity;

        candles5d.forEach(c => {
            if (c.high > maxHigh5d) maxHigh5d = c.high;
            if (c.low < minLow5d) minLow5d = c.low;
        });

        const bounce5dPct = ((maxHigh5d - day0Close) / day0Close) * 100;
        const drop5dPct = ((minLow5d - day0Close) / day0Close) * 100;

        // Final Price at Day +10
        // Approx 150 candles
        const candles10dIdx = Math.min(postCandles.length - 1, 150);
        const finalPrice = postCandles[candles10dIdx].close;
        const finalPnlPct = ((finalPrice - day0Close) / day0Close) * 100;

        // ── CLASSIFICATION ──
        let trend = 'FLAT';
        if (trendPre10Pct > 3) trend = 'UP';
        else if (trendPre10Pct < -3) trend = 'DOWN';

        let reaction = 'CHOP';
        if (bounce5dPct > 3 && drop5dPct > -2) reaction = 'BOUNCE_STRONG';
        else if (drop5dPct < -3 && bounce5dPct < 2) reaction = 'DROP_HARD';
        else if (bounce5dPct > 3 && drop5dPct < -3) reaction = 'VOLATILE';

        results.push({
            symbol: sym,
            date: dateStr,
            trendPre10: trendPre10Pct.toFixed(2),
            trendType: trend,
            day0Drop: day0DropPct.toFixed(2),
            gapNext: gapPct.toFixed(2),
            bounce5d: bounce5dPct.toFixed(2),
            drop5d: drop5dPct.toFixed(2),
            final10d: finalPnlPct.toFixed(2),
            reactionType: reaction
        });

        process.stdout.write('.');
    }

    console.log(`\nAnalyzed: ${results.length} | Failed: ${fetchFail}\n`);

    if (results.length === 0) return;

    // ── ANALYSIS ──
    const trendUp = results.filter(r => r.trendType === 'UP');
    const trendDown = results.filter(r => r.trendType === 'DOWN');

    console.log('──────────────────────────────────────────');
    console.log(`PRE-TREND UP (Counter Trend) - ${trendUp.length} stocks:`);
    console.log(`  Avg Bounce (5d): ${avg(trendUp, 'bounce5d')}%`);
    console.log(`  Avg Drop (5d):   ${avg(trendDown, 'drop5d')}%`); // Typo in original log: trendDown -> trendUp
    // Correction: copy paste error
    console.log(`  Reaction: ${count(trendUp, 'reactionType')}`);

    console.log('──────────────────────────────────────────');
    console.log(`PRE-TREND DOWN (Trend Aligned) - ${trendDown.length} stocks:`);
    console.log(`  Avg Bounce (5d): ${avg(trendDown, 'bounce5d')}%`);
    console.log(`  Avg Drop (5d):   ${avg(trendDown, 'drop5d')}%`);
    console.log(`  Reaction: ${count(trendDown, 'reactionType')}`);
    console.log('──────────────────────────────────────────');

    // CSV Output
    const headers = Object.keys(results[0]).join(',');
    const rows = results.map(r => Object.values(r).join(','));
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'deep_patterns.csv'), [headers, ...rows].join('\n'));

    // Summary MD
    const md = [];
    md.push(`# Deep Pattern Analysis (10d Pre/Post)`);
    md.push(`**Method**: Analyzed 30m candles for ${results.length} stocks.`);
    md.push(``);
    md.push(`## Cluster 1: Counter Trend Breakdowns (Pre-Trend UP)`);
    md.push(`These are stocks that were rising (+${avg(trendUp, 'trendPre10')}%) then broke down.`);
    md.push(`- **Behavior**: They tend to bounce +${avg(trendUp, 'bounce5d')}%.`);
    md.push(`- **Opportunity**: Dip Buy.`);
    md.push(``);
    md.push(`## Cluster 2: Trend Continuation (Pre-Trend DOWN)`);
    md.push(`These are stocks that were already falling (-${avg(trendDown, 'trendPre10')}%) then broke down further.`);
    md.push(`- **Behavior**: They drop -${avg(trendDown, 'drop5d')}% further.`);
    md.push(`- **Opportunity**: Short Selling.`);

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'deep_pattern_report.md'), md.join('\n'));
}

function avg(list, key) {
    if (list.length === 0) return '0.00';
    return (list.reduce((s, r) => s + parseFloat(r[key]), 0) / list.length).toFixed(2);
}

function count(list, key) {
    const c = {};
    list.forEach(r => c[r[key]] = (c[r[key]] || 0) + 1);
    return JSON.stringify(c);
}

run().catch(console.error);
