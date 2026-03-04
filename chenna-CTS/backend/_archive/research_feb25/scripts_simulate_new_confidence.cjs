/**
 * Revised Confidence Score & Portfolio Simulator
 */
const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Shuffle array
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

async function main() {
    const csvPath = path.join(__dirname, '..', 'outputs', 'full_backtest_st_up_v5.csv');
    if (!fs.existsSync(csvPath)) {
        console.error('CSV not found:', csvPath);
        process.exit(1);
    }

    const rows = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
    const trades = rows.slice(1).map(r => {
        const parts = r.split(',');
        return {
            symbol: parts[0],
            signalDate: parts[1],
            entryDate: parts[2],
            entryPrice: parseFloat(parts[3]),
            exitPrice: parseFloat(parts[8]),
            exitDate: parts[9],
            outcome: parts[12],
            pnl: parseFloat(parts[11]),
            originalRow: r
        };
    });

    // Cluster breadth mapped from signal dates (only among the 115 trades)
    // Wait, the real scanner might have had more signals, but we use the 115 to represent 'passed Nifty/Stage2' clusters
    const dateCounts = {};
    for (const t of trades) {
        dateCounts[t.signalDate] = (dateCounts[t.signalDate] || 0) + 1;
    }

    console.log(`Evaluating ${trades.length} trades with Revised Confidence Model...`);

    const validTrades = [];
    let blockedByRed = 0;

    for (const t of trades) {
        const stock = await prisma.stock.findUnique({ where: { symbol: t.symbol } });
        if (!stock) continue;

        const fetchFrom = new Date(new Date(t.signalDate).getTime() - 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const fetchTo = new Date(new Date(t.entryDate).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const rawData = await priceService.fetchPrice(t.symbol, stock.instrumentKey, fetchFrom, fetchTo);

        if (!rawData || rawData.length < 50) continue;

        const candles = rawData.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp)).map(c => ({
            date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
        }));

        const signalIdx = candles.findIndex(c => c.date === t.signalDate);
        const entryIdx = candles.findIndex(c => c.date === t.entryDate);

        if (signalIdx === -1 || entryIdx === -1 || entryIdx <= signalIdx) continue;

        const signalCandle = candles[signalIdx];
        const entryCandle = candles[entryIdx];

        // MANDATORY GATE: Entry day candle must be GREEN
        const isGreen = entryCandle.close >= entryCandle.open;
        if (!isGreen) {
            blockedByRed++;
            continue;
        }

        // --- SCORE CALCULATION ---
        let score = 0;

        // 1. Cluster Breadth (0-35)
        const cluster = dateCounts[t.signalDate];
        if (cluster >= 4) score += 35;
        else if (cluster === 3) score += 20;
        else score += 0;

        // 2. SMA50 Distance (0-25)
        const closesBeforeEntry = candles.slice(0, entryIdx).map(c => c.close);
        const sma50 = calcSMA(closesBeforeEntry, 50);
        if (sma50) {
            const dist = ((t.entryPrice - sma50) / sma50) * 100;
            if (dist >= 1 && dist < 3) score += 25;
            else if (dist >= 3 && dist < 5) score += 15;
            else if (dist >= 5 && dist < 8) score += 5;
            else score += 0; // <1% or >8%
        }

        // 3. Gap from Signal Close (0-20)
        const gapPct = ((t.entryPrice - signalCandle.close) / signalCandle.close) * 100;
        if (gapPct < 1 && gapPct >= -5) score += 20; // assuming positive gap or slight negative
        else if (gapPct >= 1 && gapPct < 2) score += 10;
        else score += 0;

        // 4. Days to Entry (0-20)
        const daysToEntry = entryIdx - signalIdx;
        if (daysToEntry >= 4) score += 20;
        else if (daysToEntry === 3) score += 12;
        else if (daysToEntry === 2) score += 5;

        let tier = 'TIER 3';
        if (score >= 70) tier = 'TIER 1';
        else if (score >= 40) tier = 'TIER 2';

        const pnlPct = (t.exitPrice - t.entryPrice) / t.entryPrice;

        validTrades.push({
            ...t,
            score,
            tier,
            pnlPct
        });
    }

    console.log(`\n\u2705 Mandatory Gate (GREEN candle) blocked ${blockedByRed} trades.`);
    console.log(`\u2705 Surviving trades: ${validTrades.length}`);

    // Tier Split
    console.log('\n--- REVISED CONFIDENCE SCORE TIERS ---');
    const tiers = ['TIER 1', 'TIER 2', 'TIER 3'];
    for (const tr of tiers) {
        const trds = validTrades.filter(x => x.tier === tr);
        const wins = trds.filter(x => x.outcome === 'WIN').length;
        const wr = trds.length > 0 ? (wins / trds.length * 100).toFixed(1) : 0;
        const avgPnl = trds.length > 0 ? (trds.reduce((a, b) => a + b.pnl, 0) / trds.length).toFixed(0) : 0;
        console.log(`${tr}: ${String(trds.length).padStart(2)} trades | ${String(wr).padStart(4)}% win rate | Avg P&L \u20B9${avgPnl}`);
    }

    // PORTFOLIO SIMULATION
    console.log('\n--- PORTFOLIO SIMULATION ---');
    console.log('Parameters: \u20B950,000 Starting Capital, Max 3 Positions, Signal Priority by Score, 100 Runs');

    // Get unique dates
    const allDatesSet = new Set();
    for (const t of validTrades) {
        allDatesSet.add(t.entryDate);
        allDatesSet.add(t.exitDate);
    }
    const timeline = Array.from(allDatesSet).sort((a, b) => new Date(a) - new Date(b));

    // Group trades by entry date
    const tradesByEntry = {};
    for (const t of validTrades) {
        if (!tradesByEntry[t.entryDate]) tradesByEntry[t.entryDate] = [];
        tradesByEntry[t.entryDate].push(t);
    }

    const finalCapitals = [];
    const runWinRates = [];

    for (let run = 0; run < 100; run++) {
        let capital = 50000;
        let positions = [];
        let totalWins = 0;
        let totalTaken = 0;

        for (const date of timeline) {
            // 1. Process exits
            const nextPositions = [];
            for (const pos of positions) {
                if (pos.exitDate === date) {
                    // Realize PnL
                    capital += pos.allocated * (1 + pos.pnlPct);
                    if (pos.pnlPct > 0) totalWins++;
                } else {
                    nextPositions.push(pos);
                }
            }
            positions = nextPositions;

            // 2. Process entries
            if (tradesByEntry[date] && positions.length < 3) {
                // Shuffle first to randomize ties
                let todaysTrades = shuffle([...tradesByEntry[date]]);
                // Sort by score descending
                todaysTrades.sort((a, b) => b.score - a.score);

                // Filter out tier 3?
                // "TIER 3 (Score < 40): SKIP"
                todaysTrades = todaysTrades.filter(t => t.score >= 40);

                const openSlots = 3 - positions.length;
                const tradesToTake = todaysTrades.slice(0, openSlots);

                for (const t of tradesToTake) {
                    // Allocate 1/3 of total equity (or available capital, whichever is smaller)
                    // Wait, if we use 1/3 of fixed initial 50k = ~16,666 or trailing equity?
                    // Let's use trailing equity
                    const estimatedTotalEquity = capital + positions.reduce((sum, p) => sum + p.allocated, 0);
                    let alloc = estimatedTotalEquity / 3;
                    if (alloc > capital) alloc = capital; // can't invest more than cash on hand

                    if (alloc > 0) {
                        capital -= alloc;
                        positions.push({
                            ...t,
                            allocated: alloc
                        });
                        totalTaken++;
                    }
                }
            }
        }

        const finalEquity = capital + positions.reduce((sum, p) => sum + p.allocated * (1 + p.pnlPct), 0);
        finalCapitals.push(finalEquity);
        if (totalTaken > 0) runWinRates.push(totalWins / totalTaken * 100);
    }

    const avgCap = finalCapitals.reduce((a, b) => a + b, 0) / 100;
    const minCap = Math.min(...finalCapitals);
    const maxCap = Math.max(...finalCapitals);
    const avgWr = runWinRates.reduce((a, b) => a + b, 0) / 100;

    console.log(`Runs Complete: 100`);
    console.log(`Average Final Equity: \u20B9${avgCap.toFixed(2)} (${((avgCap / 50000 - 1) * 100).toFixed(1)}% Return)`);
    console.log(`Worst Run Equity  : \u20B9${minCap.toFixed(2)}`);
    console.log(`Best Run Equity   : \u20B9${maxCap.toFixed(2)}`);
    console.log(`Average Win Rate  : ${avgWr.toFixed(1)}%`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
