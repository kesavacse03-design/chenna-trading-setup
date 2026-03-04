/**
 * SWING BREAKOUT QUICK EXPLORATION
 * 
 * Objective: Compare 4 categories to find the best edge.
 * 
 * Categories:
 * - SHORT_TERM_SWING_BO_UP
 * - SHORT_TERM_SWING_BO_DOWN
 * - LONG_TERM_SWING_BO_UP
 * - LONG_TERM_SWING_BO_DOWN
 * 
 * Methodology:
 * - Entry: Day after addedDate, at OPEN price.
 * - Stop: 2% fixed.
 * - Target: 3% fixed (1.5R).
 * - Max Hold: 10 days.
 * - Logic: Standard OHLC check (pessimistic for ambiguity).
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
    report.push('SWING BREAKOUT EXPLORATION REPORT');
    report.push('================================================');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push('');

    // Summary table rows
    const summaryData = [];

    for (const catKey of CATEGORIES) {
        console.log(`\nAnalyzing ${catKey}...`);

        try {
            const category = await prisma.category.findUnique({
                where: { key: catKey },
                include: { stocks: { include: { stock: true } } }
            });

            if (!category) {
                console.log(`  ❌ Not found in DB`);
                summaryData.push({ category: catKey, stocks: 0, range: 'N/A', wr: 0, pnl: 0, trades: 0 });
                continue;
            }

            const stocks = category.stocks;
            if (stocks.length === 0) {
                console.log(`  ❌ Empty category`);
                summaryData.push({ category: catKey, stocks: 0, range: 'N/A', wr: 0, pnl: 0, trades: 0 });
                continue;
            }

            // Get date range
            const dates = stocks.map(s => new Date(s.addedDate).getTime());
            const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
            const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];
            console.log(`  ✅ Found ${stocks.length} stocks (${minDate} to ${maxDate})`);

            // Run Simulation
            let wins = 0;
            let losses = 0;
            let totalPnl = 0;
            let totalHold = 0;
            let timeouts = 0;
            let trades = 0;

            // Pre-process distinct stocks (dedup if needed, though usually distinct per date)
            // But here distinct per stock? No, same stock can appear on different dates.
            // We treat each entry as a signal.

            for (const stock of stocks) {
                const sym = stock.stock.symbol;
                const entryDate = new Date(stock.addedDate);
                const from = new Date(entryDate);
                from.setDate(from.getDate() - 5); // Context
                const to = new Date(entryDate);
                to.setDate(to.getDate() + 20); // Look ahead

                let candles;
                try {
                    candles = await priceService.fetchPrice(
                        sym, stock.stock.instrumentKey,
                        from.toISOString().split('T')[0],
                        to.toISOString().split('T')[0], 'day'
                    );
                } catch (e) { continue; }

                if (!candles || candles.length < 5) continue;

                // Find signal index
                const addDateStr = entryDate.toISOString().split('T')[0];
                const idx = candles.findIndex(c => (c.timestamp || c.date).toString().startsWith(addDateStr));

                if (idx === -1 || idx >= candles.length - 1) continue; // No Next Day

                // SETUP
                const day0 = candles[idx]; // Signal Day
                const day1 = candles[idx + 1]; // Entry Day

                if (!day1) continue;

                // PARAMS
                const direction = catKey.includes('_UP') ? 'LONG' : 'SHORT';
                const entryPrice = day1.open; // Entry @ Open
                const riskPct = 0.02; // 2%
                const targetPct = 0.03; // 3% (1.5R)

                let stopLoss, target;
                if (direction === 'LONG') {
                    stopLoss = entryPrice * (1 - riskPct);
                    target = entryPrice * (1 + targetPct);
                } else {
                    stopLoss = entryPrice * (1 + riskPct);
                    target = entryPrice * (1 - targetPct);
                }

                // SIMULATE
                let result = 'TIMEOUT';
                let pnl = 0;
                let daysHeld = 10;

                // Check Day 1 Intraday first
                // Can we hit target/stop on Day 1 itself?
                // Logic: Open is entry. Then Price moves.
                // High/Low of Day 1 vs Target/Stop

                let hitT = false, hitS = false;

                // Day 1 check
                if (direction === 'LONG') {
                    if (day1.low <= stopLoss) hitS = true;
                    if (day1.high >= target) hitT = true;
                } else {
                    if (day1.high >= stopLoss) hitS = true;
                    if (day1.low <= target) hitT = true;
                }

                if (hitT && hitS) {
                    // Ambiguous Day 1 -> Loss
                    result = 'LOSS'; pnl = -1; daysHeld = 1;
                } else if (hitS) {
                    result = 'LOSS'; pnl = -1; daysHeld = 1;
                } else if (hitT) {
                    result = 'WIN'; pnl = 1.5; daysHeld = 1;
                } else {
                    // Day 2 to 10
                    for (let d = 2; d <= 10; d++) {
                        const ci = idx + d;
                        if (ci >= candles.length) { daysHeld = d - 1; break; }
                        const c = candles[ci];

                        let ht = false, hs = false;
                        if (direction === 'LONG') {
                            if (c.low <= stopLoss) hs = true;
                            if (c.high >= target) ht = true;
                        } else {
                            if (c.high >= stopLoss) hs = true;
                            if (c.low <= target) ht = true;
                        }

                        if (ht && hs) { result = 'LOSS'; pnl = -1; daysHeld = d; break; } // Pessimistic
                        if (hs) { result = 'LOSS'; pnl = -1; daysHeld = d; break; }
                        if (ht) { result = 'WIN'; pnl = 1.5; daysHeld = d; break; }
                    }
                }

                // TIMEOUT logic
                if (result === 'TIMEOUT') {
                    // Exit at close of last day
                    // PnL based on close
                    const lastC = candles[Math.min(idx + 10, candles.length - 1)];
                    if (direction === 'LONG') {
                        const rawPnl = (lastC.close - entryPrice) / entryPrice; // e.g. 0.01
                        // Convert to R? Risk was 0.02. So 0.01 / 0.02 = 0.5R
                        pnl = rawPnl / riskPct;
                    } else {
                        const rawPnl = (entryPrice - lastC.close) / entryPrice;
                        pnl = rawPnl / riskPct;
                    }
                    // Cap max loss at -1R for consistency? Or let it float?
                    // Usually timeout exit is effectively a "scratch" or small win/loss.
                    // Let's count it.
                }

                trades++;
                totalPnl += pnl;
                totalHold += daysHeld;
                if (pnl > 0) wins++;
                else losses++; // Timeout with neg pnl is loss
                if (result === 'TIMEOUT') timeouts++;
            }

            const wr = trades > 0 ? (wins / trades * 100) : 0;
            const avgHold = trades > 0 ? (totalHold / trades) : 0;
            const avgPnl = trades > 0 ? (totalPnl / trades) : 0;

            summaryData.push({
                category: catKey,
                stocks: stocks.length,
                range: `${minDate} to ${maxDate}`,
                wr: wr.toFixed(1),
                pnl: totalPnl.toFixed(1),
                avgPnl: avgPnl.toFixed(2),
                trades: trades,
                avgHold: avgHold.toFixed(1)
            });

        } catch (e) {
            console.error(e);
        }
    }

    // Print Table
    console.log('\n\n--- COMPARISON RESULTS ---');
    console.log(`Cat Code: ST=ShortTerm, LT=LongTerm, U=Up, D=Down`);
    console.log(`| Category | Stocks | Trades | Win Rate | Net P&L | Avg P&L | Avg Hold | Range |`);
    console.log(`|----------|--------|--------|----------|---------|---------|----------|-------|`);

    for (const d of summaryData) {
        console.log(`| ${d.category.replace('SHORT_TERM_SWING_BO_', 'ST_').replace('LONG_TERM_SWING_BO_', 'LT_')} | ${d.stocks} | ${d.trades} | ${d.wr}% | ${d.pnl}R | ${d.avgPnl}R | ${d.avgHold}d | ${d.range} |`);

        report.push(`Category: ${d.category}`);
        report.push(`  Stocks: ${d.stocks}, Trades Simulated: ${d.trades}`);
        report.push(`  Win Rate: ${d.wr}%, Net P&L: ${d.pnl}R`);
        report.push(`  Avg P&L: ${d.avgPnl}R, Avg Hold: ${d.avgHold} days`);
        report.push(`  Date Range: ${d.range}`);
        report.push('------------------------------------------------');
    }

    // Suggestion
    const best = summaryData.sort((a, b) => parseFloat(b.avgPnl) - parseFloat(a.avgPnl))[0];
    console.log(`\n🏆 BEST CATEGORY: ${best ? best.category : 'None'}`);

    report.push(`\nBest Category: ${best ? best.category : 'None'}`);
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_exploration_report.txt'), report.join('\n'));
}

run();
