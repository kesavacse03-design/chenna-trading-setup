const fs = require('fs');
const path = require('path');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const TARGET_DATE = '2026-02-19';

function load30mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const byDay = {};
        for (const c of raw) {
            const parts = String(c.timestamp || c.date).split('T');
            const d = parts[0];
            const t = parts[1].substring(0, 8);
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push({ ...c, timeStr: t });
        }
        return byDay;
    } catch (e) { return null; }
}

const symbols = ['AMBUJACEM', 'IRCTC', 'MANKIND', 'IDFCFIRSTB'];

for (const sym of symbols) {
    console.log(`\n\n=== ${sym} on ${TARGET_DATE} ===`);
    const data = load30mCache(sym);
    if (!data || !data[TARGET_DATE]) {
        console.log(`No data found for ${sym} on this date.`);
        continue;
    }

    const candles = data[TARGET_DATE];
    if (candles.length === 0) {
        console.log("Empty candle array");
        continue;
    }

    // Print all candles
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        console.log(`Candle ${i + 1} (${c.timeStr}): O: ${c.open} H: ${c.high} L: ${c.low} C: ${c.close} Vol: ${c.volume}`);
    }

    const c1 = candles[0];
    const orbHigh = parseFloat(c1.high);
    const orbLow = parseFloat(c1.low);
    console.log(`\nOpening Range: OR_High = ${orbHigh} | OR_Low = ${orbLow}`);

    let breakoutCandleIdx = -1;
    let setupType = null;
    let entryPrice = 0;
    let stopLoss = 0;

    for (let i = 1; i < candles.length; i++) {
        const cx = candles[i];
        const cls = parseFloat(cx.close);

        const closedAbove = cls > orbHigh;
        const closedBelow = cls < orbLow;
        console.log(`Candle ${i + 1}: Closed above OR_High? ${closedAbove ? 'YES' : 'NO'} | Closed below OR_Low? ${closedBelow ? 'YES' : 'NO'}`);

        if (breakoutCandleIdx === -1) {
            if (closedAbove) {
                breakoutCandleIdx = i;
                setupType = 'LONG';
                entryPrice = cls;
                stopLoss = orbLow;
            } else if (closedBelow) {
                breakoutCandleIdx = i;
                setupType = 'SHORT';
                entryPrice = cls;
                stopLoss = orbHigh;
            }
        }
    }

    if (breakoutCandleIdx !== -1) {
        const risk = Math.abs(entryPrice - stopLoss);
        const t1 = setupType === 'LONG' ? entryPrice + risk : entryPrice - risk;
        const t2 = setupType === 'LONG' ? entryPrice + (2 * risk) : entryPrice - (2 * risk);

        console.log(`\nBreakout Triggered on Candle ${breakoutCandleIdx + 1}`);
        console.log(`Direction: ${setupType}`);
        console.log(`Entry price: ${entryPrice}`);
        console.log(`Stop price: ${stopLoss}`);
        console.log(`Risk: ${risk.toFixed(2)}`);
        console.log(`T1 target (1:1): ${t1.toFixed(2)}`);

        let hitT1At = null;
        let hitStopAt = null;

        for (let j = breakoutCandleIdx + 1; j < candles.length; j++) {
            const cx = candles[j];
            const h = parseFloat(cx.high);
            const l = parseFloat(cx.low);

            if (setupType === 'LONG') {
                if (!hitStopAt && l <= stopLoss) hitStopAt = `Candle ${j + 1} (${cx.timeStr})`;
                if (!hitT1At && h >= t1) hitT1At = `Candle ${j + 1} (${cx.timeStr})`;
            } else {
                if (!hitStopAt && h >= stopLoss) hitStopAt = `Candle ${j + 1} (${cx.timeStr})`;
                if (!hitT1At && l <= t1) hitT1At = `Candle ${j + 1} (${cx.timeStr})`;
            }
        }

        console.log(`\nDid ANY subsequent candle hit T1? ${hitT1At ? hitT1At : 'NO'}`);
        console.log(`Did any candle hit the stop? ${hitStopAt ? hitStopAt : 'NO'}`);

        if (hitT1At && hitStopAt) {
            console.log(`NOTE: Both hit! Sequence depends on minute-by-minute order.`);
        }
    } else {
        console.log(`\nNo breakout triggered on Close basis.`);
    }
}
