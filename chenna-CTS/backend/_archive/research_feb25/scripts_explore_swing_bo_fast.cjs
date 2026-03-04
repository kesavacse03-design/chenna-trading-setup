/**
 * SWING BREAKOUT QUICK EXPLORATION (FAST SAMPLE)
 * 
 * Objective: Compare 4 categories to find the best edge.
 * Optimization: Sample top 50 most recent stocks per category.
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');

const CATEGORIES = [
    'SHORT_TERM_SWING_BO_UP',
    'SHORT_TERM_SWING_BO_DOWN',
    'LONG_TERM_SWING_BO_UP',
    'LONG_TERM_SWING_BO_DOWN'
];

async function run() {
    const report = [];
    report.push('SWING BREAKOUT EXPLORATION REPORT (FAST SAMPLE N=50)');
    report.push('================================================');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push('');

    const summaryData = [];

    for (const catKey of CATEGORIES) {
        console.log(`\nAnalyzing ${catKey}...`);

        try {
            const category = await prisma.category.findUnique({
                where: { key: catKey },
                include: { stocks: { include: { stock: true } } }
            });

            if (!category || category.stocks.length === 0) {
                console.log(`  ❌ Empty/Not Found`);
                summaryData.push({ category: catKey, stocks: 0, range: 'N/A', wr: 0, pnl: 0, trades: 0 });
                continue;
            }

            // SORT DESC by addedDate and TAKE TOP 50
            const allStocks = category.stocks.sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));
            const stocks = allStocks.slice(0, 50);

            const dates = stocks.map(s => new Date(s.addedDate).getTime());
            const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
            const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];
            console.log(`  ✅ Sampling 50/${allStocks.length} stocks (${minDate} to ${maxDate})`);

            // Run Simulation
            let wins = 0;
            let losses = 0;
            let totalPnl = 0;
            let totalHold = 0;
            let timeouts = 0;
            let trades = 0;

            for (const stock of stocks) {
                const sym = stock.stock.symbol;
                const entryDate = new Date(stock.addedDate);
                const from = new Date(entryDate);
                from.setDate(from.getDate() - 5);

                // Cap 'to' date at TODAY to avoid future data requests
                let to = new Date(entryDate);
                to.setDate(to.getDate() + 20);
                if (to > new Date()) to = new Date();

                let candles;
                try {
                    candles = await priceService.fetchPrice(
                        sym, stock.stock.instrumentKey,
                        from.toISOString().split('T')[0],
                        to.toISOString().split('T')[0], 'day'
                    );
                } catch (e) {
                    // Log error for first few failures to debug
                    if (losses + wins + timeouts < 3) console.log(`Err ${sym}: ${e.message}`);
                    process.stdout.write('x');
                    continue;
                }

                if (!candles || candles.length < 5) { process.stdout.write('.'); continue; }

                const addDateStr = entryDate.toISOString().split('T')[0];
                const idx = candles.findIndex(c => (c.timestamp || c.date).toString().startsWith(addDateStr));

                if (idx === -1) {
                    // Date not found in candles?
                    if (losses + wins + timeouts < 3) console.log(`DateNotFound ${sym} ${addDateStr}`);
                    process.stdout.write('-');
                    continue;
                }

                if (idx >= candles.length - 1) {
                    // Last candle is entry date -> No Day 1 data yet
                    // Only happened TODAY/YESTERDAY?
                    process.stdout.write('T');
                    continue;
                }

                const day1 = candles[idx + 1];
                if (!day1) continue;

                // Direction & Params
                const isLong = catKey.includes('_UP');
                const entryPrice = day1.open;
                const riskPct = 0.02;
                const targetPct = 0.03;

                const stopLoss = isLong ? entryPrice * (1 - riskPct) : entryPrice * (1 + riskPct);
                const target = isLong ? entryPrice * (1 + targetPct) : entryPrice * (1 - targetPct);

                let result = 'TIMEOUT';
                let pnl = 0;
                let daysHeld = 10;

                // Day 1 Checks
                let hitT = false, hitS = false;
                if (isLong) {
                    if (day1.low <= stopLoss) hitS = true;
                    if (day1.high >= target) hitT = true;
                } else {
                    if (day1.high >= stopLoss) hitS = true;
                    if (day1.low <= target) hitT = true;
                }

                if (hitT && hitS) { result = 'LOSS'; pnl = -1; daysHeld = 1; }
                else if (hitS) { result = 'LOSS'; pnl = -1; daysHeld = 1; }
                else if (hitT) { result = 'WIN'; pnl = 1.5; daysHeld = 1; }
                else {
                    // Day 2-10 loop
                    for (let d = 2; d <= 10; d++) {
                        const ci = idx + d;
                        if (ci >= candles.length) { daysHeld = d - 1; break; }
                        const c = candles[ci];

                        let ht = false, hs = false;
                        if (isLong) {
                            if (c.low <= stopLoss) hs = true;
                            if (c.high >= target) ht = true;
                        } else {
                            if (c.high >= stopLoss) hs = true;
                            if (c.low <= target) ht = true;
                        }

                        if (ht && hs) { result = 'LOSS'; pnl = -1; daysHeld = d; break; }
                        else if (hs) { result = 'LOSS'; pnl = -1; daysHeld = d; break; }
                        else if (ht) { result = 'WIN'; pnl = 1.5; daysHeld = d; break; }
                    }
                }

                if (result === 'TIMEOUT') {
                    const lastC = candles[Math.min(idx + 10, candles.length - 1)];
                    if (isLong) pnl = (lastC.close - entryPrice) / entryPrice / riskPct;
                    else pnl = (entryPrice - lastC.close) / entryPrice / riskPct;
                }

                trades++;
                totalPnl += pnl;
                totalHold += daysHeld;
                if (pnl > 0) wins++;
                else losses++;

                process.stdout.write(pnl > 0 ? '+' : pnl < 0 ? '-' : 'o');
            }

            const wr = trades > 0 ? (wins / trades * 100) : 0;
            const avgHold = trades > 0 ? (totalHold / trades) : 0;
            const avgPnl = trades > 0 ? (totalPnl / trades) : 0;

            summaryData.push({
                category: catKey,
                stocks: allStocks.length,
                sampled: trades,
                range: `${minDate} to ${maxDate}`,
                wr: wr.toFixed(1),
                pnl: totalPnl.toFixed(1),
                avgPnl: avgPnl.toFixed(2),
                avgHold: avgHold.toFixed(1)
            });

        } catch (e) {
            console.error(e);
        }
    }

    console.log('\n\n--- COMPARISON RESULTS (N=50) ---');
    console.log(`| Category | Total | Sampled | Win Rate | Net P&L | Avg P&L | Avg Hold |`);
    console.log(`|----------|-------|---------|----------|---------|---------|----------|`);

    for (const d of summaryData) {
        console.log(`| ${d.category.replace('SHORT_TERM_SWING_BO_', 'ST_').replace('LONG_TERM_SWING_BO_', 'LT_')} | ${d.stocks} | ${d.sampled} | ${d.wr}% | ${d.pnl}R | ${d.avgPnl}R | ${d.avgHold}d |`);

        report.push(`Category: ${d.category}`);
        report.push(`  Total Stocks: ${d.stocks}, Sampled: ${d.sampled}`);
        report.push(`  Win Rate: ${d.wr}%, Net P&L: ${d.pnl}R`);
        report.push(`  Avg P&L: ${d.avgPnl}R, Avg Hold: ${d.avgHold} days`);
        report.push('------------------------------------------------');
    }

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_exploration_fast_report.txt'), report.join('\n'));
}

run();
