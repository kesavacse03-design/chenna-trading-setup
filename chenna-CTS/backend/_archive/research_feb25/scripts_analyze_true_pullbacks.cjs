/**
 * Retroactive True Pullback Analyzer
 * 
 * Analyzes the 115 trades from the V5 backtest to see how many were "True Pullbacks"
 * versus "Loose Entries" (just entering because the gap was small).
 */

const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

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
            pullbackLow: parseFloat(parts[4]),
            outcome: parts[12],
            pnl: parseFloat(parts[11])
        };
    });

    console.log(`Analyzing ${trades.length} trades for True Pullback logic...`);

    let truePullbacks = [];
    let looseEntries = [];

    for (const t of trades) {
        const stock = await prisma.stock.findUnique({ where: { symbol: t.symbol } });
        if (!stock) continue;

        const fetchFrom = new Date(new Date(t.signalDate).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const fetchTo = new Date(new Date(t.entryDate).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const rawData = await priceService.fetchPrice(t.symbol, stock.instrumentKey, fetchFrom, fetchTo);
        if (!rawData || rawData.length === 0) continue;

        const candles = rawData.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp)).map(c => ({
            date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseFloat(c.volume)
        }));

        const signalIdx = candles.findIndex(c => c.date === t.signalDate);
        const entryIdx = candles.findIndex(c => c.date === t.entryDate);

        if (signalIdx === -1 || entryIdx === -1 || entryIdx <= signalIdx) {
            looseEntries.push(t);
            continue;
        }

        const signalCandle = candles[signalIdx];
        const confirmationCandle = candles[entryIdx - 1]; // The day before entry

        // CONDITION 1: PULLBACK EXISTS (At least one red candle between signal and entry)
        let hasRedCandle = false;
        let lowestLow = Infinity;
        let pbVolSum = 0;
        let pbCount = 0;

        for (let i = signalIdx + 1; i < entryIdx; i++) {
            const c = candles[i];
            if (c.close < c.open) hasRedCandle = true;
            if (c.low < lowestLow) lowestLow = c.low;
            pbVolSum += c.volume;
            pbCount++;
        }

        // CONDITION 2: PULLBACK DEPTH (lowest low within 3% of signal close)
        // Means lowestLow >= signalCandle.close * 0.97
        const depthValid = lowestLow >= (signalCandle.close * 0.97);

        // CONDITION 3: VOLUME DECLINE (avg volume on pullback < signal volume)
        const avgPbVol = pbCount > 0 ? pbVolSum / pbCount : 0;
        const volValid = avgPbVol < signalCandle.volume;

        // CONDITION 4: CONFIRMATION CANDLE (day before entry is green and close > prev high)
        let confValid = false;
        if (entryIdx - 1 > signalIdx) {
            const prevToConf = candles[entryIdx - 2];
            if (confirmationCandle.close > confirmationCandle.open && confirmationCandle.close > prevToConf.high) {
                confValid = true;
            }
        }

        if (hasRedCandle && depthValid && volValid && confValid) {
            truePullbacks.push(t);
        } else {
            looseEntries.push(t);
        }
    }

    console.log('\n--- TRUE PULLBACK ANALYSIS ---');

    function printStats(name, arr) {
        const wins = arr.filter(x => x.outcome === 'WIN').length;
        const wr = arr.length > 0 ? (wins / arr.length * 100).toFixed(1) : 0;
        const avgPnl = arr.length > 0 ? (arr.reduce((a, b) => a + b.pnl, 0) / arr.length).toFixed(0) : 0;
        console.log(`${name}: ${arr.length} trades, ${wr}% win rate, avg P&L ₹${avgPnl}`);
    }

    printStats("True Pullback Entries", truePullbacks);
    printStats("Loose Entries (Didn't Crash)", looseEntries);

}

main().catch(console.error).finally(() => prisma.$disconnect());
