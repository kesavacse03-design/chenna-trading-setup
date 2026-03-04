/**
 * Generate Signal Cards for Verification
 * 
 * Generates day-by-day signal cards simulating real-time user experience 
 * for 5 specific trades from the full V5 backtest.
 */
const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

const TRADES_TO_TEST = [
    { symbol: 'TATASTEEL', signalDate: '2026-02-09' },
    { symbol: 'HEROMOTOCO', signalDate: '2025-08-04' },
    { symbol: 'SAIL', signalDate: '2025-09-03' },
    { symbol: 'CAMS', signalDate: '2025-11-20' },
    { symbol: 'PIIND', signalDate: '2025-07-29' } // Loss example
];

async function main() {
    console.log('Generating Signal Cards...\n');
    let outText = '';

    for (const req of TRADES_TO_TEST) {
        const stock = await prisma.stock.findUnique({ where: { symbol: req.symbol } });
        if (!stock) continue;

        const fetchFrom = new Date(new Date(req.signalDate).getTime() - 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const fetchTo = new Date(new Date(req.signalDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let rawData = await priceService.fetchPrice(req.symbol, stock.instrumentKey, fetchFrom, fetchTo);
        if (!rawData) continue;

        let candles = rawData.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp)).map(c => ({
            date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseFloat(c.volume)
        }));

        const signalIdx = candles.findIndex(c => c.date === req.signalDate);
        if (signalIdx === -1) continue;

        const signalCandle = candles[signalIdx];
        const closesAtSignal = candles.slice(0, signalIdx + 1).map(c => c.close);
        const sma50 = calcSMA(closesAtSignal, 50);
        const distSMA = sma50 ? (((signalCandle.close - sma50) / sma50) * 100).toFixed(1) : 'N/A';
        const vol50 = candles.slice(Math.max(0, signalIdx - 50), signalIdx).reduce((sum, c) => sum + c.volume, 0) / 50;
        const volRatio = vol50 > 0 ? (signalCandle.volume / vol50).toFixed(1) : 'N/A';
        const candleType = signalCandle.close >= signalCandle.open ? 'Green' : 'Red';

        const prelimStop = (signalCandle.close * 0.96).toFixed(2);
        const targetFloor = (signalCandle.close * 0.97).toFixed(2);
        const targetCeil = (signalCandle.close * 1.03).toFixed(2);

        outText += `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n`;
        outText += `SIGNAL: ${req.symbol} | ${req.signalDate}\n`;
        outText += `Category: ST_SWING_BO_UP\n`;
        outText += `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n`;

        outText += `SIGNAL DAY DATA:\n`;
        outText += `  Close: \u20B9${signalCandle.close.toFixed(2)} | High: \u20B9${signalCandle.high.toFixed(2)} | Low: \u20B9${signalCandle.low.toFixed(2)}\n`;
        outText += `  Volume: ${signalCandle.volume} (${volRatio}x avg) \u2014 ${candleType} breakout\n`;
        outText += `  Distance from SMA50: ${distSMA}%\n\n`;

        outText += `ENTRY RANGE: \u20B9${targetFloor} - \u20B9${targetCeil} (signal close +/- 3%)\n`;
        outText += `  Buy if: Stock opens within this range on Day+2 to Day+5\n`;
        outText += `  Preliminary Stop: \u20B9${prelimStop} (4% below close)\n`;
        outText += `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n`;

        // Find Entry Day
        let entryIdx = -1;
        let entryPrice = 0;
        let lowestPb = Infinity;

        for (let i = 1; i <= 5; i++) {
            const checkIdx = signalIdx + i;
            if (checkIdx >= candles.length) break;
            const c = candles[checkIdx];

            if (c.low < lowestPb) lowestPb = c.low;

            outText += `DAY+${i}: ${c.date}\n`;
            outText += `  Open: \u20B9${c.open.toFixed(2)} | High: \u20B9${c.high.toFixed(2)} | Low: \u20B9${c.low.toFixed(2)} | Close: \u20B9${c.close.toFixed(2)}\n`;

            if (i > 1 && entryIdx === -1) {
                // Check original V5 entry logic (didn't crash)
                const gapDiff = Math.abs(c.open - signalCandle.close) / signalCandle.close;
                const highDiff = (c.open - signalCandle.close) / signalCandle.close;

                if (gapDiff <= 0.02 && highDiff <= 0.03 && c.open >= lowestPb) {
                    entryIdx = checkIdx;
                    entryPrice = c.open;

                    let stopPrice = lowestPb;
                    const minStop = entryPrice * 0.985;
                    const maxStop = entryPrice * 0.96;
                    if (stopPrice > minStop) stopPrice = minStop;
                    if (stopPrice < maxStop) stopPrice = maxStop;

                    outText += `  \u2605 ENTRY TRIGGERED (V5 Logic) \u2605\n`;
                    outText += `  Entered at: \u20B9${entryPrice.toFixed(2)} (Open)\n`;
                    outText += `  Structure Stop: \u20B9${stopPrice.toFixed(2)}\n`;
                    outText += `  Quantity: ${Math.floor(1000 / (entryPrice - stopPrice))}\n\n`;
                    break;
                } else {
                    outText += `  Action: WAIT (Conditions not met)\n\n`;
                }
            } else {
                outText += `  Action: WAIT. Watching next day.\n\n`;
            }
        }

        if (entryIdx !== -1) {
            let currentStop = entryPrice * 0.96;
            let lowestSinceSignal = Infinity;
            for (let i = signalIdx + 1; i < entryIdx; i++) if (candles[i].low < lowestSinceSignal) lowestSinceSignal = candles[i].low;
            currentStop = lowestSinceSignal;
            if (currentStop > entryPrice * 0.985) currentStop = entryPrice * 0.985;
            if (currentStop < entryPrice * 0.96) currentStop = entryPrice * 0.96;

            const target = entryPrice + (entryPrice - currentStop) * 2; // rough 2R
            const qty = Math.floor(1000 / (entryPrice - currentStop));

            let holdDay = 1;
            let highSinceEntry = entryPrice;

            for (let j = entryIdx; j < candles.length && holdDay <= 10; j++) {
                const c = candles[j];
                outText += `HOLDING DAY ${holdDay}: ${c.date}\n`;

                // Gap down slip check
                let actualExitPrice = currentStop;
                let stopHit = false;

                // If it gaps down completely past stop at open
                if (c.open < currentStop) {
                    stopHit = true;
                    actualExitPrice = c.open;
                    outText += `  \u26A0 GAP DOWN below stop!\n`;
                } else if (c.low <= currentStop) {
                    stopHit = true;
                    actualExitPrice = currentStop;
                }

                if (stopHit) {
                    const pnl = (actualExitPrice - entryPrice) * qty;
                    outText += `  \u26A0 STOP HIT \u26A0\n`;
                    outText += `  Exit Price: \u20B9${actualExitPrice.toFixed(2)}\n`;
                    outText += `  P&L: \u20B9${pnl.toFixed(2)} ${pnl > 0 ? 'WIN \u2713' : 'LOSS'}\n`;
                    break;
                }

                if (c.high >= target && holdDay === 1) { // roughly check if target hit
                    // in v5 we don't have hard target for phase 3, but let's say target was 2x ATR. 
                    // Let's just track the actual price action to max 10 days
                }

                outText += `  Open: \u20B9${c.open.toFixed(2)} | High: \u20B9${c.high.toFixed(2)} | Low: \u20B9${c.low.toFixed(2)} | Close: \u20B9${c.close.toFixed(2)}\n`;

                const pnl = (c.close - entryPrice) * qty;
                outText += `  P&L vs Close: \u20B9${pnl.toFixed(2)}\n`;

                if (c.high > highSinceEntry) highSinceEntry = c.high;

                // V5 Phase logic
                if (holdDay < 4) {
                    outText += `  Phase 1: Kept stop at \u20B9${currentStop.toFixed(2)}\n\n`;
                } else if (holdDay >= 4 && holdDay <= 5) {
                    const profitPct = (c.close - entryPrice) / entryPrice;
                    if (profitPct >= 0.015) {
                        currentStop = entryPrice * 0.99;
                        outText += `  Phase 2: Profit > 1.5%. Trailed stop to \u20B9${currentStop.toFixed(2)}\n\n`;
                    } else {
                        outText += `  Phase 2: Profit < 1.5%. Stop remains \u20B9${currentStop.toFixed(2)}\n\n`;
                    }
                } else if (holdDay >= 6) {
                    const prevLow = candles[j - 1].low;
                    currentStop = prevLow;
                    outText += `  Phase 3: Trailed stop to previous day low \u20B9${currentStop.toFixed(2)}\n\n`;
                }

                holdDay++;
            }
        }

        outText += `\n`;
    }

    fs.writeFileSync(path.join(__dirname, '..', 'outputs', 'signal_cards.txt'), outText);
    console.log('Saved to outputs/signal_cards.txt');
}

main().catch(console.error).finally(() => prisma.$disconnect());
