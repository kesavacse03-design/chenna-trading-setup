const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs');

const prisma = new PrismaClient();

async function run() {
    // Debug specific winning stocks to see why they got low context scores
    const targets = ['HCLTECH', 'NMDC', 'PHOENIXLTD'];

    for (const symbol of targets) {
        console.log(`\nAnalyzing ${symbol}...`);

        // Fetch data
        const stock = await prisma.stock.findFirst({ where: { symbol } });
        if (!stock) continue;

        const candles = await priceService.fetchPrice(
            symbol, stock.instrumentKey, '2025-10-01', '2026-02-17', 'day'
        );

        // Find the trade entry date
        // HCLTECH: ~Jan 7
        // NMDC: ~Dec 31
        // PHOENIX: ~Jan 12

        let targetDate = null;
        if (symbol === 'HCLTECH') targetDate = '2026-01-07';
        if (symbol === 'NMDC') targetDate = '2025-12-31';
        if (symbol === 'PHOENIXLTD') targetDate = '2026-01-12';

        const idx = candles.findIndex(c => c.timestamp.startsWith(targetDate));
        if (idx === -1) { console.log('Date not found'); continue; }

        // NR7 is idx-1 (Setup)
        const nr7Idx = idx - 1;
        const nr7Candle = candles[nr7Idx];

        console.log(`NR7 Date: ${nr7Candle.timestamp}`);
        console.log(`NR7 Close: ${nr7Candle.close}`);

        // 1. Key Level Check form previous script
        const lookback = 20;
        const subset = candles.slice(nr7Idx - lookback, nr7Idx);
        const highest = Math.max(...subset.map(c => c.high));
        const lowest = Math.min(...subset.map(c => c.low));

        const nearHigh = (highest - nr7Candle.close) / highest < 0.02;
        const nearLow = (nr7Candle.close - lowest) / lowest < 0.02;

        console.log(`20d High: ${highest} (Diff: ${((highest - nr7Candle.close) / highest * 100).toFixed(2)}%)`);
        console.log(`20d Low:  ${lowest}  (Diff: ${((nr7Candle.close - lowest) / lowest * 100).toFixed(2)}%)`);
        console.log(`Key Level? ${nearHigh ? 'RESISTANCE' : nearLow ? 'SUPPORT' : 'NONE'}`);

        // 2. RSI Divergence Check
        const rsiPeriod = 14;
        const history = candles.slice(0, nr7Idx + 1);
        const rsiNow = TA.calculateRSI(history, rsiPeriod);
        const rsi5Ago = TA.calculateRSI(history.slice(0, -5), rsiPeriod);

        const priceNow = candles[nr7Idx].close;
        const price5Ago = candles[nr7Idx - 5].close;
        const priceSlope = priceNow - price5Ago;
        const rsiSlope = rsiNow - rsi5Ago;

        console.log(`Price Slope: ${priceSlope.toFixed(2)} (${price5Ago} -> ${priceNow})`);
        console.log(`RSI Slope:   ${rsiSlope.toFixed(2)} (${rsi5Ago.toFixed(2)} -> ${rsiNow.toFixed(2)})`);

        let div = 'NONE';
        // Simulating the script logic
        // Bullish (LONG): Price Slope <= 0, RSI Slope > 5
        if (priceSlope <= 0 && rsiSlope > 5) div = 'BULLISH';
        // Bearish (SHORT): Price Slope >= 0, RSI Slope < -5
        if (priceSlope >= 0 && rsiSlope < -5) div = 'BEARISH';

        console.log(`Divergence? ${div}`);
    }
}

run();
