const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('Intraday Breakout Quality Assessment POC\n');

    for (const req of [
        { symbol: 'GLENMARK', signalDate: '2026-02-19', fromStr: '2026-02-05', toStr: '2026-02-26' },
        { symbol: 'UPL', signalDate: '2026-02-19', fromStr: '2026-02-05', toStr: '2026-02-26' },
        { symbol: 'EICHERMOT', signalDate: '2026-02-19', fromStr: '2026-02-05', toStr: '2026-02-26' }
    ]) {
        const stock = await prisma.stock.findUnique({ where: { symbol: req.symbol } });
        if (!stock) { console.log(`Missing ${req.symbol}`); continue; }

        // Fetch daily data to find the breakout level
        // 5 trading days before the 19th
        const dRaw = await priceService.fetchFromUpstox(stock.instrumentKey, '2026-02-12', '2026-02-19', 'day');
        let breakoutLevel = 0;
        if (dRaw && dRaw.length > 0) {
            const priorDays = dRaw.filter(c => {
                const cDate = String(c.timestamp || c.date).split('T')[0].split(' ')[0];
                return cDate < req.signalDate;
            });
            if (priorDays.length > 0) {
                breakoutLevel = Math.max(...priorDays.map(c => c.high));
            }
        }

        // Fetch 30min
        const raw = await priceService.fetchFromUpstox(stock.instrumentKey, req.fromStr, req.toStr, '30minute');
        if (!raw || raw.length === 0) { console.log(`No 30min data for ${req.symbol}`); continue; }

        // Compile 1H candles
        const byDay = {};
        for (const c of raw) {
            // timestamp example: 2026-02-05T09:15:00+05:30
            let ts = String(c.timestamp || c.date);
            const dateStr = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
            if (!byDay[dateStr]) byDay[dateStr] = [];
            byDay[dateStr].push(c);
        }

        const hourly = [];
        for (const date of Object.keys(byDay).sort()) {
            const dayCandles = byDay[date].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            for (let i = 0; i < dayCandles.length; i += 2) {
                const c1 = dayCandles[i];
                if (i + 1 < dayCandles.length) {
                    const c2 = dayCandles[i + 1];
                    hourly.push({
                        timestamp: c1.timestamp,
                        open: parseFloat(c1.open),
                        high: Math.max(parseFloat(c1.high), parseFloat(c2.high)),
                        low: Math.min(parseFloat(c1.low), parseFloat(c2.low)),
                        close: parseFloat(c2.close),
                        volume: parseFloat(c1.volume) + parseFloat(c2.volume)
                    });
                } else {
                    hourly.push({
                        timestamp: c1.timestamp,
                        open: parseFloat(c1.open),
                        high: parseFloat(c1.high),
                        low: parseFloat(c1.low),
                        close: parseFloat(c1.close),
                        volume: parseFloat(c1.volume)
                    });
                }
            }
        }

        console.log(`\n══════════════════════════════════════════════`);
        console.log(`STOCK: ${req.symbol} | Signal Date: ${req.signalDate}`);
        console.log(`Breakout Level: \u20B9${breakoutLevel.toFixed(2)} (highest high of Feb 12-18)`);
        console.log(`══════════════════════════════════════════════\n`);

        // Condition A: Consolidation
        const signalDateStart = req.signalDate + 'T00:00:00+05:30';
        const priorCandles = hourly.filter(c => c.timestamp < signalDateStart && c.timestamp >= '2026-02-14T00:00:00+05:30');
        const nearResCount = priorCandles.filter(c => c.high >= breakoutLevel * 0.98 && c.low <= breakoutLevel * 1.02).length;
        const totalPrior = priorCandles.length;
        const pctNear = totalPrior > 0 ? ((nearResCount / totalPrior) * 100).toFixed(1) : 0;

        console.log(`CONDITION A \u2014 CONSOLIDATION AT RESISTANCE:`);
        console.log(`  Hours spent within 2% of breakout level`);
        console.log(`  in the 3 days BEFORE signal:`);
        console.log(`  Count: ${nearResCount} hourly candles out of ${totalPrior} total`);
        console.log(`  Score: ${pctNear}% of candles near resistance\n`);

        // Find Breakout Candle
        let breakoutCandleIdx = -1;
        for (let i = 0; i < hourly.length; i++) {
            // Find first candle on signal date that crosses or gaps above breakout level
            if (hourly[i].timestamp >= signalDateStart && hourly[i].high > breakoutLevel && breakoutCandleIdx === -1) {
                breakoutCandleIdx = i;
            }
        }

        if (breakoutCandleIdx === -1) {
            console.log(`ERROR: No 1H candle broke above resistance on signal date.`);
            console.log(`══════════════════════════════════════════════\n`);
            continue;
        }

        // Condition B: EMA Alignment
        const closes = hourly.map(c => c.close);
        const calcEmaUpTo = (idx, pe) => {
            if (idx < pe - 1) return null;
            const slice = closes.slice(0, idx + 1);
            const k = 2 / (pe + 1);
            let ema = slice.slice(0, pe).reduce((a, b) => a + b, 0) / pe;
            for (let i = pe; i < slice.length; i++) ema = slice[i] * k + ema * (1 - k);
            return ema;
        };

        const e20 = calcEmaUpTo(breakoutCandleIdx, 20);
        const e50 = calcEmaUpTo(breakoutCandleIdx, 50);
        const e20_prev5 = calcEmaUpTo(breakoutCandleIdx - 5, 20);

        const isRising = (e20 && e20_prev5 && e20 > e20_prev5) ? 'RISING' : 'FALLING';
        const gapPct = (e20 && e50) ? (((e20 - e50) / e50) * 100).toFixed(2) : '0.00';

        console.log(`CONDITION B \u2014 1H EMA ALIGNMENT AT SIGNAL:`);
        console.log(`  1H EMA 20 at signal close: \u20B9${e20 ? e20.toFixed(2) : 'N/A'}`);
        console.log(`  1H EMA 50 at signal close: \u20B9${e50 ? e50.toFixed(2) : 'N/A'}`);
        console.log(`  EMA 20 > EMA 50: ${e20 > e50 ? 'YES' : 'NO'}`);
        console.log(`  EMA 20 slope (last 5 candles): ${isRising}`);
        console.log(`  Gap: ${gapPct}%\n`);

        // Condition C: Breakout Candle Quality
        const bC = hourly[breakoutCandleIdx];
        const volSlice = hourly.slice(Math.max(0, breakoutCandleIdx - 20), breakoutCandleIdx);
        const avgVol = volSlice.reduce((s, c) => s + c.volume, 0) / (volSlice.length || 1);

        const tr = bC.high - bC.low;
        const bodyPct = tr > 0 ? (Math.abs(bC.close - bC.open) / tr * 100).toFixed(1) : '0.0';
        const volMul = avgVol > 0 ? (bC.volume / avgVol).toFixed(1) : '0.0';

        const timeFmt = new Date(bC.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        const dtFmt = new Date(bC.timestamp).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

        console.log(`CONDITION C \u2014 BREAKOUT CANDLE QUALITY (1H):`);
        console.log(`  The 1H candle that broke above resistance:`);
        console.log(`  Time: ${timeFmt} on ${dtFmt}`);
        console.log(`  Open: \u20B9${bC.open.toFixed(2)} | High: \u20B9${bC.high.toFixed(2)} | Low: \u20B9${bC.low.toFixed(2)} | Close: \u20B9${bC.close.toFixed(2)}`);
        console.log(`  Body %: ${bodyPct}% of range`);
        console.log(`  Volume vs 20-period avg: ${volMul}x\n`);

        // Condition D: Post Breakout Hold
        console.log(`CONDITION D \u2014 POST-BREAKOUT HOLD:`);
        console.log(`  Next 5 hourly candles after breakout:`);
        let holdCount = 0;
        for (let n = 1; n <= 5; n++) {
            if (breakoutCandleIdx + n < hourly.length) {
                const nc = hourly[breakoutCandleIdx + n];
                const holds = nc.close >= breakoutLevel;
                if (holds) holdCount++;
                console.log(`  Candle ${n}: O:\u20B9${nc.open.toFixed(1)}/H:\u20B9${nc.high.toFixed(1)}/L:\u20B9${nc.low.toFixed(1)}/C:\u20B9${nc.close.toFixed(1)} \u2014 Above resistance? ${holds ? 'Y' : 'N'}`);
            } else {
                console.log(`  Candle ${n}: N/A (End of data)`);
            }
        }
        console.log(`  Hold rate: ${holdCount}/5 candles held above resistance\n`);

        // Verdict
        const conditionA = pctNear > 20; // At least 20% of candles near resistance
        const conditionB = e20 > e50 && isRising === 'RISING';
        const conditionC = parseFloat(bodyPct) > 50 && parseFloat(volMul) > 1.2;
        const conditionD = holdCount >= 3;

        let verdict = 'REAL';
        if (!conditionA || !conditionB || holdCount < 2) verdict = 'FAKE';

        console.log(`VERDICT: ${verdict} BREAKOUT`);
        console.log(`══════════════════════════════════════════════\n`);
    }

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
