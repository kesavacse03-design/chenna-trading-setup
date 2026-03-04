/**
 * SWING BREAKOUT QUICK EXPLORATION (SUPER FAST SAMPLE N=10)
 * 
 * Objective: Compare 4 categories to find the best edge.
 * Optimization: Sample top 10 most recent stocks per category.
 * Added: Delays between requests to avoid ECONNRESET.
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

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    const report = [];
    report.push('SWING BREAKOUT EXPLORATION REPORT (SUPER FAST SAMPLE N=10)');
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

            // SORT DESC by addedDate and TAKE TOP 10
            const allStocks = category.stocks.sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));
            const stocks = allStocks.slice(0, 10);

            const dates = stocks.map(s => new Date(s.addedDate).getTime());
            const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
            const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];
            console.log(`  ✅ Sampling 10/${allStocks.length} stocks (${minDate} to ${maxDate})`);

            // Run Simulation
            let wins = 0;
            let losses = 0;
            let totalPnl = 0;
            let totalHold = 0;
            let trades = 0;
            let timeouts = 0;

            for (const stock of stocks) {
                const sym = stock.stock.symbol;
                const entryDate = new Date(stock.addedDate);
                const from = new Date(entryDate);
                from.setDate(from.getDate() - 5);

                // Cap 'to' date at TODAY
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
                    await sleep(100); // Friendly delay
                } catch (e) {
                    process.stdout.write('x');
                    continue;
                }

                if (!candles || candles.length < 5) { process.stdout.write('.'); continue; }

                const addDateStr = entryDate.toISOString().split('T')[0];
                const idx = candles.findIndex(c => (c.timestamp || c.date).toString().startsWith(addDateStr));

                if (idx === -1) { process.stdout.write('-'); continue; }
                if (idx >= candles.length - 1) { process.stdout.write('T'); continue; }

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
                    // Estimate PnL at close
                    const lastC = candles[Math.min(idx + 10, candles.length - 1)];
                    if (isLong) pnl = (lastC.close - entryPrice) / entryPrice / riskPct;
                    else pnl = (entryPrice - lastC.close) / entryPrice / riskPct;
                    // Cap max loss at -1R?? Or let it float.
                    // Let's cap at -1.5R to be safe against disasters
                    // And cap win at +2R for timeouts? No, let it float.
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

    const finalReport = [];
    finalReport.push('SWING BREAKOUT EXPLORATION REPORT (SUPER FAST SAMPLE N=10)');
    finalReport.push('================================================');
    finalReport.push('');

    console.log('\n\n--- COMPARISON RESULTS (N=10) ---');
    console.log(`| Category | Total | Sampled | Win Rate | Net P&L | Avg P&L | Avg Hold |`);
    console.log(`|----------|-------|---------|----------|---------|---------|----------|`);
    finalReport.push(`| Category | Total | Sampled | Win Rate | Net P&L | Avg P&L | Avg Hold |`);
    finalReport.push(`|----------|-------|---------|----------|---------|---------|----------|`);

    for (const d of summaryData) {
        const line = `| ${d.category.replace('SHORT_TERM_SWING_BO_', 'ST_').replace('LONG_TERM_SWING_BO_', 'LT_')} | ${d.stocks} | ${d.sampled} | ${d.wr}% | ${d.pnl}R | ${d.avgPnl}R | ${d.avgHold}d |`;
        console.log(line);
        finalReport.push(line);
    }

    // Write robustly
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_exploration_superfast_report.txt'), finalReport.join('\n'));
}

run();
