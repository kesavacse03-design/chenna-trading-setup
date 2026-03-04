/**
 * Momentum Continuation Factor Analyzer
 * 
 * Analyzes the 115 trades from the V5 backtest (specifically the momentum entries)
 * to determine which factors separate the 53% winners from the 47% losers.
 */

const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

let niftyCandles = [];
async function fetchNiftyData() {
    process.stdout.write('Fetching NIFTY 50 data...');
    const data = await priceService.fetchPrice('NIFTY 50', 'NSE_INDEX|Nifty 50', '2023-01-01', new Date().toISOString().split('T')[0]);
    data.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));
    niftyCandles = data.map(c => ({
        date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
        open: parseFloat(c.open),
        close: parseFloat(c.close)
    }));
    console.log(` \u2705 Got ${niftyCandles.length} candles`);
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
            outcome: parts[12],
            pnl: parseFloat(parts[11])
        };
    });

    // Calculate same-day signals map
    const dateCounts = {};
    for (const t of trades) {
        dateCounts[t.signalDate] = (dateCounts[t.signalDate] || 0) + 1;
    }

    await fetchNiftyData();
    console.log(`Analyzing ${trades.length} trades for Momentum Factors...`);

    const evaluatedTrades = [];

    for (const t of trades) {
        const stock = await prisma.stock.findUnique({ where: { symbol: t.symbol } });
        if (!stock) continue;

        const fetchFrom = new Date(new Date(t.signalDate).getTime() - 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const fetchTo = new Date(new Date(t.entryDate).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const rawData = await priceService.fetchPrice(t.symbol, stock.instrumentKey, fetchFrom, fetchTo);
        if (!rawData || rawData.length < 55) continue; // Need at least 50 for SMA50

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
        if (signalIdx < 50 || entryIdx === -1 || entryIdx <= signalIdx) continue;

        const signalCandle = candles[signalIdx];
        const entryCandle = candles[entryIdx];

        const closesBeforeEntry = candles.slice(0, entryIdx).map(c => c.close);
        const sma50AtEntry = calcSMA(closesBeforeEntry, 50);

        // 1. GAP FROM SIGNAL CLOSE
        const gapPct = ((t.entryPrice - signalCandle.close) / signalCandle.close) * 100;
        let gapSplit = '';
        if (gapPct < 1) gapSplit = '<1%';
        else if (gapPct < 2) gapSplit = '1-2%';
        else if (gapPct < 3) gapSplit = '2-3%';
        else gapSplit = '>3%';

        // 2. DAYS TO ENTRY
        let daysToEntry = `Day+${entryIdx - signalIdx}`;
        if (entryIdx - signalIdx > 5) daysToEntry = '>Day+5';

        // 3. ENTRY DAY CANDLE COLOR
        const entryColor = entryCandle.close >= entryCandle.open ? 'GREEN' : 'RED';

        // 4. VOLUME TREND (Entry vol vs Signal vol)
        const volTrend = entryCandle.volume > signalCandle.volume ? 'INCREASE' : 'DECREASE';

        // 5. DISTANCE FROM SMA50
        let distSplit = '';
        if (sma50AtEntry) {
            const dist = ((t.entryPrice - sma50AtEntry) / sma50AtEntry) * 100;
            if (dist < 1) distSplit = '<1%';
            else if (dist < 3) distSplit = '1-3%';
            else if (dist < 5) distSplit = '3-5%';
            else if (dist < 8) distSplit = '5-8%';
            else distSplit = '>8%';
        } else {
            distSplit = 'UNKNOWN';
        }

        // 6. NIFTY MOMENTUM
        const nIdx = niftyCandles.findIndex(c => c.date >= t.entryDate);
        let niftyMom = 'UNKNOWN';
        if (nIdx >= 3) {
            let actualNIdx = nIdx;
            if (niftyCandles[nIdx].date !== t.entryDate) actualNIdx = Math.max(0, nIdx - 1);
            const nStart = niftyCandles[actualNIdx - 3].close;
            const nEnd = niftyCandles[actualNIdx].close;
            niftyMom = nEnd > nStart ? 'UP' : 'DOWN';
        }

        // 7. SAME DAY SIGNALS
        const clusterCount = dateCounts[t.signalDate];
        let clusterSplit = '';
        if (clusterCount === 1) clusterSplit = '1';
        else if (clusterCount === 2) clusterSplit = '2';
        else if (clusterCount === 3) clusterSplit = '3';
        else clusterSplit = '4+';

        evaluatedTrades.push({
            outcome: t.outcome,
            pnl: t.pnl,
            gapSplit,
            daysToEntry,
            entryColor,
            volTrend,
            distSplit,
            niftyMom,
            clusterSplit
        });
    }

    function printSplitStats(name, attributeName, possibleValues) {
        console.log(`\n${name}:`);
        for (const val of possibleValues) {
            const trds = evaluatedTrades.filter(x => x[attributeName] === val);
            if (trds.length === 0) continue;
            const wins = trds.filter(x => x.outcome === 'WIN').length;
            const wr = (wins / trds.length * 100).toFixed(1);
            const avgPnl = (trds.reduce((a, b) => a + b.pnl, 0) / trds.length).toFixed(0);
            console.log(`  ${String(val).padEnd(10)}: ${String(trds.length).padStart(3)} trades, ${wr.padStart(5)}% win rate, avg P&L ₹${avgPnl.padStart(4)}`);
        }
    }

    console.log('\n--- MOMENTUM CONTINUATION FACTOR ANALYSIS ---');

    printSplitStats('1. Gap from signal close', 'gapSplit', ['<1%', '1-2%', '2-3%', '>3%']);
    printSplitStats('2. Days to entry', 'daysToEntry', ['Day+1', 'Day+2', 'Day+3', 'Day+4', 'Day+5', '>Day+5']);
    printSplitStats('3. Entry day candle color', 'entryColor', ['GREEN', 'RED']);
    printSplitStats('4. Signal to entry volume trend', 'volTrend', ['INCREASE', 'DECREASE']);
    printSplitStats('5. Distance from SMA50', 'distSplit', ['<1%', '1-3%', '3-5%', '5-8%', '>8%', 'UNKNOWN']);
    printSplitStats('6. NIFTY momentum (3d before entry)', 'niftyMom', ['UP', 'DOWN', 'UNKNOWN']);
    printSplitStats('7. Same-day signal clusters', 'clusterSplit', ['1', '2', '3', '4+']);
}

main().catch(console.error).finally(() => prisma.$disconnect());
