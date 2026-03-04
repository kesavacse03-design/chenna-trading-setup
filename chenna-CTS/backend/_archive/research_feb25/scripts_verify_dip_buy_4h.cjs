/**
 * VERIFY DIP BUY HYPOTHESIS (4H/30m Analysis)
 * 
 * Objective: Check "what happened" in the 5 days following the breakdown signal
 * for "Counter Trend" (Weekly UP) stocks vs "Trend Aligned" (Weekly DOWN).
 * 
 * Hypothesis: 
 * - Counter Trend stocks (Dip Buys) should BOUNCE (Price goes UP).
 * - Trend Aligned stocks should CONTINUE DOWN.
 * 
 * Data:
 * - Daily (250 days) for Trend Classification (100 SMA).
 * - 30minute (5 days) for Intraday Analysis (proxy for 4H).
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
    console.log('=== VERIFY DIP BUY HYPOTHESIS ===\n');

    // ──────────────────────────────────────────────────────
    // STEP 1: GET DIVERSE SAMPLE
    // ──────────────────────────────────────────────────────
    const category = await prisma.category.findUnique({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' },
        include: { stocks: { include: { stock: true }, orderBy: { addedDate: 'desc' } } }
    });

    if (!category) return;

    // Group by date, pick diverse sample
    const dateMap = {};
    category.stocks.forEach(s => {
        const d = s.addedDate.toISOString().split('T')[0];
        if (!dateMap[d]) dateMap[d] = [];
        dateMap[d].push(s);
    });

    const selected = [];
    const cutoffDate = new Date(); // No Recency filter needed? Need 5 days history.
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    // We need Intraday data. Upstox Intraday API usually provides last ~7-10 days 
    // OR historical intraday (if paid/avail).
    // `priceService` V2 path suggests it can fetch historical intraday.
    // Let's try fetching for stocks from 2-3 months ago.

    for (const dateStr of Object.keys(dateMap).sort().reverse()) {
        if (selected.length >= 30) break;
        // Ensure date is at least 5 days ago
        if (new Date(dateStr) > cutoffDate) continue;
        selected.push(...dateMap[dateStr].slice(0, 1)); // 1 per date for max diversity
    }

    console.log(`Selected ${selected.length} stocks across ${selected.length} dates\n`);

    // ──────────────────────────────────────────────────────
    // STEP 2: ANALYZE EACH
    // ──────────────────────────────────────────────────────
    const results = [];
    let fetchFail = 0, skipNoData = 0;

    for (const stock of selected) {
        const sym = stock.stock.symbol;
        const entryDate = new Date(stock.addedDate);
        const addDateStr = entryDate.toISOString().split('T')[0];

        // 1. Fetch Daily (for Trend)
        const fromDaily = new Date(entryDate);
        fromDaily.setDate(fromDaily.getDate() - 250);
        let dailyCandles = [];

        try {
            dailyCandles = await priceService.fetchPrice(
                sym, stock.stock.instrumentKey,
                fromDaily.toISOString().split('T')[0],
                addDateStr, 'day'
            );
            await sleep(200);
        } catch (e) {
            console.log(`Daily fetch failed for ${sym}`);
            fetchFail++; continue;
        }

        if (!dailyCandles || dailyCandles.length < 100) {
            console.log(`Skip ${sym}: Insufficient daily history`);
            skipNoData++; continue;
        }

        // Ensure sorted
        dailyCandles.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calc Trend (100 SMA at Entry, which is last candle)
        const day0 = dailyCandles[dailyCandles.length - 1];
        const sma100 = TA.calculateSMA(dailyCandles, 100);
        const sma50 = TA.calculateSMA(dailyCandles, 50);
        const trend = (day0.close < sma100) ? 'DOWN' : 'UP';

        // 2. Fetch Intraday (30min) for Entry + 5 Days
        const fromIntra = new Date(entryDate); // Start from Entry Day
        const toIntra = new Date(entryDate);
        toIntra.setDate(toIntra.getDate() + 7); // +5 trading days approx

        let intraCandles = [];
        try {
            intraCandles = await priceService.fetchPrice(
                sym, stock.stock.instrumentKey,
                fromIntra.toISOString().split('T')[0],
                toIntra.toISOString().split('T')[0], '30minute'
            );
            await sleep(500); // Be gentle with intraday
        } catch (e) {
            console.log(`Intraday fetch failed for ${sym}: ${e.message}`);
            // Fallback: If cannot fetch historical intraday (some plans restrict), skip
            // Note: Upstox Basic API might only give recent intraday.
            skipNoData++; continue;
        }

        if (!intraCandles || intraCandles.length === 0) {
            console.log(`Skip ${sym}: No intraday data`);
            skipNoData++; continue;
        }

        // Sort Intraday
        intraCandles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        // Analyze Price Action (5 Days)
        // Entry at Open of Day +1? Or Open of Day 0?
        // Let's assume Entry at Day 0 Closing (traditional EOD scan) -> so Trade starts Day +1 Open.
        // We generally use Day +1 Open as entry for Swing.

        // Find Day +1 Open
        // Group by Date first
        const days = {};
        intraCandles.forEach(c => {
            const d = new Date(c.timestamp || c.date).toISOString().split('T')[0];
            if (!days[d]) days[d] = [];
            days[d].push(c);
        });

        const sortedDates = Object.keys(days).sort();
        const day0Date = addDateStr;
        const day1Date = sortedDates.find(d => d > day0Date);

        if (!day1Date) {
            console.log(`Skip ${sym}: No Day+1 data`);
            skipNoData++; continue;
        }

        const day1Open = days[day1Date][0].open;

        // Sim Buy at Day 1 Open
        let maxHigh = day1Open;
        let minLow = day1Open;
        let finalClose = day1Open;

        // Iterate all 30m candles from Day 1 onwards
        let candlesAnalyzed = 0;
        intraCandles.forEach(c => {
            const d = new Date(c.timestamp || c.date).toISOString().split('T')[0];
            if (d >= day1Date) {
                if (c.high > maxHigh) maxHigh = c.high;
                if (c.low < minLow) minLow = c.low;
                finalClose = c.close;
                candlesAnalyzed++;
            }
        });

        if (candlesAnalyzed === 0) continue;

        const maxUpPct = ((maxHigh - day1Open) / day1Open) * 100;
        const maxDownPct = ((minLow - day1Open) / day1Open) * 100; // Negative
        const closePct = ((finalClose - day1Open) / day1Open) * 100;

        results.push({
            symbol: sym,
            date: addDateStr,
            trend,
            day1Open: day1Open.toFixed(2),
            maxUp: maxUpPct.toFixed(2),
            maxDown: maxDownPct.toFixed(2),
            final: closePct.toFixed(2)
        });

        process.stdout.write(trend === 'UP' ? 'U' : 'D');
    }

    console.log(`\n\nAnalyzed: ${results.length} | Failed/Skipped: ${fetchFail + skipNoData}\n`);

    if (results.length === 0) return;

    // ──────────────────────────────────────────────────────
    // STEP 3: COMPARISON
    // ──────────────────────────────────────────────────────
    const trendUp = results.filter(r => r.trend === 'UP'); // Counter Trend (Dip Buy Candidates)
    const trendDown = results.filter(r => r.trend === 'DOWN'); // Trend Aligned (Short Candidates)

    function getStats(list) {
        if (list.length === 0) return { count: 0, avgUp: 0, avgDown: 0, avgFinal: 0, winRateLong: 0 };
        const avgUp = list.reduce((s, r) => s + parseFloat(r.maxUp), 0) / list.length;
        const avgDown = list.reduce((s, r) => s + parseFloat(r.maxDown), 0) / list.length;
        const avgFinal = list.reduce((s, r) => s + parseFloat(r.final), 0) / list.length;
        const winsLong = list.filter(r => parseFloat(r.final) > 0).length;
        return {
            count: list.length,
            avgUp,
            avgDown,
            avgFinal,
            winRateLong: (winsLong / list.length * 100)
        };
    }

    const statsUp = getStats(trendUp);
    const statsDown = getStats(trendDown);

    // ──────────────────────────────────────────────────────
    // STEP 4: REPORT
    // ──────────────────────────────────────────────────────
    console.log('──────────────────────────────────────────');
    console.log('DIP BUY VERIFICATION (Counter Trend Stocks)');
    console.log('──────────────────────────────────────────');
    console.log(`COUNTER TREND (Weekly UP) - ${statsUp.count} stocks:`);
    console.log(`  Avg Max Bounce: +${statsUp.avgUp.toFixed(2)}%`);
    console.log(`  Avg Max Drop:   ${statsUp.avgDown.toFixed(2)}%`);
    console.log(`  Avg Final P&L (Long): ${statsUp.avgFinal.toFixed(2)}%`);
    console.log(`  Win Rate (Buying Day 1 Open, Hold 5 Days): ${statsUp.winRateLong.toFixed(1)}%`);
    console.log('');
    console.log(`TREND ALIGNED (Weekly DOWN) - ${statsDown.count} stocks:`);
    console.log(`  Avg Max Bounce: +${statsDown.avgUp.toFixed(2)}%`);
    console.log(`  Avg Max Drop:   ${statsDown.avgDown.toFixed(2)}%`);
    console.log(`  Avg Final P&L (Long): ${statsDown.avgFinal.toFixed(2)}%`);
    console.log('──────────────────────────────────────────');

    const csvRows = results.map(r => `${r.symbol},${r.date},${r.trend},${r.maxUp},${r.maxDown},${r.final}`);
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'dip_buy_verification.csv'), ['Symbol,Date,Trend,MaxUp,MaxDown,FinalPnl'].concat(csvRows).join('\n'));
}

run().catch(console.error);
