/**
 * Retroactive Confidence Score Analyzer
 */
const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
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
    const outPath = path.join(__dirname, '..', 'outputs', 'full_backtest_st_up_v5_scored.csv');

    if (!fs.existsSync(csvPath)) {
        console.error('CSV not found:', csvPath);
        process.exit(1);
    }

    const rows = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
    const headers = rows[0].split(',');
    const outHeaders = [...headers, 'Trend_Score', 'RSI_Score', 'Candle_Score', 'Pullback_Score', 'Weekly_Score', 'Sector_Score', 'Total_Score', 'Tier'];
    const outLines = [outHeaders.join(',')];

    const results = [];
    const trades = rows.slice(1).map(r => {
        const parts = r.split(',');
        return {
            symbol: parts[0],
            signalDate: parts[1],
            entryDate: parts[2],
            entryPrice: parseFloat(parts[3]),
            pullbackLow: parseFloat(parts[4]),
            outcome: parts[12],
            pnl: parseFloat(parts[11]),
            originalRow: r
        };
    });

    await fetchNiftyData();
    console.log(`Analyzing ${trades.length} trades for Confidence Score...`);

    for (const t of trades) {
        const stock = await prisma.stock.findUnique({ where: { symbol: t.symbol } });
        if (!stock) continue;

        const fetchFrom = new Date(new Date(t.signalDate).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const fetchTo = new Date(new Date(t.entryDate).getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const rawData = await priceService.fetchPrice(t.symbol, stock.instrumentKey, fetchFrom, fetchTo);
        if (!rawData || rawData.length < 200) continue;

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
        if (signalIdx < 200 || entryIdx === -1) continue;

        const history = candles.slice(0, signalIdx + 1);
        const closes = history.map(c => c.close);

        const price = closes[closes.length - 1];
        const sma50 = calcSMA(closes, 50);
        const sma200 = calcSMA(closes, 200);
        const sma50_5d = calcSMA(closes.slice(0, -5), 50);
        const rsi = calcRSI(closes, 14);
        const signalCandle = history[history.length - 1];

        let score = 0, trend = 0, rsip = 0, candle = 0, pullback = 0, weekly = 0, sector = 0;

        // 1. Trend Strength (0-25 points)
        const p50Gap = ((price - sma50) / sma50) * 100;
        const smGap = ((sma50 - sma200) / sma200) * 100;
        if (p50Gap >= 5) trend += 10;
        if (smGap >= 3) trend += 8;
        if (sma50 > sma50_5d) trend += 7;

        // 2. RSI Precision (0-15 points)
        if (rsi >= 63 && rsi <= 67) rsip += 15;
        else if ((rsi >= 60 && rsi < 63) || (rsi > 67 && rsi <= 70)) rsip += 8;

        // 3. Signal Candle (0-20 points)
        const range = signalCandle.high - signalCandle.low;
        const body = Math.abs(signalCandle.close - signalCandle.open);
        const bodyPct = range > 0 ? body / range : 0;
        const upper = range > 0 ? (signalCandle.close - signalCandle.low) / range : 0;
        const vol50 = history.slice(-50).reduce((s, c) => s + c.volume, 0) / 50;
        const volRatio = vol50 > 0 ? signalCandle.volume / vol50 : 0;

        if (bodyPct > 0.70) candle += 7;
        if (upper >= 0.80) candle += 5;
        if (volRatio > 1.5) candle += 8;

        // 4. Pullback Quality (0-20 points)
        const pbDepth = ((signalCandle.close - t.pullbackLow) / signalCandle.close) * 100;
        let pbVolSum = 0, pbDays = 0;
        for (let j = signalIdx + 1; j <= entryIdx; j++) {
            pbVolSum += candles[j].volume;
            pbDays++;
        }
        const avgPbVol = pbDays > 0 ? pbVolSum / pbDays : 0;
        const pbVolRatio = signalCandle.volume > 0 ? avgPbVol / signalCandle.volume : 0;

        if (pbDepth < 2) pullback += 10;
        if (pbVolRatio < 0.8) pullback += 10;

        // 5. Weekly Alignment (0-10 points)
        const wSlice = history.slice(-5);
        if (wSlice.length === 5) {
            const wOpen = wSlice[0].open;
            const wClose = wSlice[4].close;
            if (wClose > wOpen) weekly += 5;
            const ema25 = calcEMA(closes, 25);
            if (wClose > ema25) weekly += 5;
        }

        // 6. Sector Strength (0-10 points)
        const sRet = wSlice.length === 5 ? ((wSlice[4].close - wSlice[0].open) / wSlice[0].open) * 100 : 0;
        let nIdx = niftyCandles.findIndex(c => c.date >= t.signalDate);
        if (nIdx === -1) nIdx = niftyCandles.length - 1;
        else if (niftyCandles[nIdx].date !== t.signalDate) nIdx = Math.max(0, nIdx - 1);

        if (nIdx >= 4) {
            const nStart = niftyCandles[nIdx - 4].open;
            const nEnd = niftyCandles[nIdx].close;
            const nRet = ((nEnd - nStart) / nStart) * 100;
            if (sRet > nRet + 1) sector += 10;
            else if (sRet >= nRet - 1) sector += 5;
        }

        score = trend + rsip + candle + pullback + weekly + sector;
        let tier = 'TIER 3';
        if (score >= 75) tier = 'TIER 1';
        else if (score >= 50) tier = 'TIER 2';

        const rowOut = `${t.originalRow},${trend},${rsip},${candle},${pullback},${weekly},${sector},${score},${tier}`;
        outLines.push(rowOut);
        results.push({ outcome: t.outcome, pnl: t.pnl, score, tier });
    }

    fs.writeFileSync(outPath, outLines.join('\n'));
    console.log(`\n\u2705 Saved scored CSV to ${outPath}\n`);

    // Summary
    console.log('--- CONFIDENCE SCORE ANALYSIS ---');
    const tiers = ['TIER 1', 'TIER 2', 'TIER 3'];
    for (const tr of tiers) {
        const trds = results.filter(x => x.tier === tr);
        const wins = trds.filter(x => x.outcome === 'WIN').length;
        const wr = trds.length > 0 ? (wins / trds.length * 100).toFixed(1) : 0;
        const avgPnl = trds.length > 0 ? (trds.reduce((a, b) => a + b.pnl, 0) / trds.length).toFixed(0) : 0;
        console.log(`Trades with score ${tr === 'TIER 1' ? '75+' : tr === 'TIER 2' ? '50-74' : '<50'} (${tr}): ${trds.length} trades, ${wr}% win rate, avg P&L ₹${avgPnl}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
