const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    return closes.slice(closes.length - period).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
    return ema;
}

function calcRSI(closes, period) {
    if (closes.length <= period) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    return avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
}

function calcATR(dailyC, index, period = 14) {
    if (index < period) return 0;
    let trSum = 0;
    for (let i = index - period + 1; i <= index; i++) {
        const high = dailyC[i].high;
        const low = dailyC[i].low;
        const prevClose = dailyC[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trSum += tr;
    }
    return trSum / period;
}

const RISK_PER_TRADE = 1000;

function simulateTrade(dailyC, entryIdx, entryPrice, stopMode) {
    if (entryIdx >= dailyC.length) return null;
    const signalIdx = entryIdx - 1;

    let initialStop = 0;

    if (stopMode === 'E1') {
        let lowestLow = Math.min(dailyC[entryIdx].low, dailyC[signalIdx]?.low || dailyC[entryIdx].low);
        let rawRiskPct = ((entryPrice - lowestLow) / entryPrice) * 100;
        if (rawRiskPct < 1.5) lowestLow = entryPrice * (1 - 0.015);
        else if (rawRiskPct > 4.0) lowestLow = entryPrice * (1 - 0.040);
        initialStop = lowestLow;
    } else if (stopMode === 'E2') {
        initialStop = dailyC[signalIdx].low;
    } else if (stopMode === 'E3') {
        const atr = calcATR(dailyC, signalIdx, 14);
        initialStop = entryPrice - (1.5 * atr);
    } else if (stopMode === 'E4') {
        initialStop = 0.0001; // virtually no stop
    }

    let currentStop = initialStop;

    let qty = 1;
    if (stopMode !== 'E4' && (entryPrice - currentStop) > 0) {
        qty = Math.floor(RISK_PER_TRADE / (entryPrice - currentStop));
    } else {
        qty = Math.floor(100000 / entryPrice); // arbitrary sizing for unmanaged comparison
    }
    if (qty <= 0) qty = 1;

    let exitPrice = 0;
    let exitReason = 'Timeout';
    let stopHitDay = -1;

    for (let i = 1; i <= 10; i++) {
        const dIdx = entryIdx + i;
        if (dIdx >= dailyC.length) {
            exitPrice = dailyC[dailyC.length - 1].close;
            break;
        }

        const c = dailyC[dIdx];

        if (stopMode !== 'E4') {
            if (c.open <= currentStop) {
                exitPrice = c.open;
                exitReason = currentStop === initialStop ? 'Stop Hit (Gap)' : 'Trail Hit (Gap)';
                stopHitDay = i;
                break;
            } else if (c.low <= currentStop) {
                exitPrice = currentStop;
                exitReason = currentStop === initialStop ? 'Stop Hit' : 'Trail Hit';
                stopHitDay = i;
                break;
            }

            const currentProfitPct = ((c.close - entryPrice) / entryPrice) * 100;
            if (i >= 3 && currentProfitPct >= 1.5) {
                currentStop = Math.max(currentStop, entryPrice * 0.99); // breakeven - 1%
            }
            if (i >= 5) {
                currentStop = Math.max(currentStop, dailyC[dIdx - 1].low);
            }
        }

        if (i === 10) {
            exitPrice = c.close;
            break;
        }
    }

    const rawRtrn = (exitPrice - entryPrice) / entryPrice;

    // Day 10 theoretical price
    let unmanagedPrice = 0;
    if (entryIdx + 10 < dailyC.length) unmanagedPrice = dailyC[entryIdx + 10].close;
    else unmanagedPrice = dailyC[dailyC.length - 1].close;

    return {
        entryPrice, exitPrice, exitReason, stopHitDay,
        initialStop,
        stopDistPct: ((entryPrice - initialStop) / entryPrice) * 100,
        pnlPct: rawRtrn * 100,
        pnlAmount: (exitPrice - entryPrice) * qty,
        isWin: rawRtrn > 0,
        day10Price: unmanagedPrice,
        unmanagedWin: unmanagedPrice > entryPrice
    };
}


async function main() {
    console.log('Fetching NIFTY baseline...');
    const niftyCandles = await priceService.fetchFromUpstox('NSE_INDEX|Nifty 50', '2025-01-01', '2026-06-01', 'day', 'NIFTY50');
    const niftyMap = {};
    const niftyCloses = [];
    for (let c of niftyCandles) {
        niftyCloses.push(c.close);
        const ema20 = calcEMA(niftyCloses, 20);
        niftyMap[String(c.timestamp).split('T')[0]] = { close: c.close, ema20: ema20 };
    }

    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id, addedDate: { gte: new Date('2025-08-01T00:00:00Z') } },
        include: { stock: true }
    });

    const uniqueSignals = Array.from(new Map(stockEntries.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, s])).values())
        .map(sc => ({
            symbol: sc.stock.symbol, instrumentKey: sc.stock.instrumentKey,
            addedDate: toISTDateString(sc.addedDate), addedDateObj: sc.addedDate
        })).sort((a, b) => a.addedDate.localeCompare(b.addedDate));

    console.log(`Fetching comprehensive price data for all symbols...`);
    const uniqueSymbolsMap = [...new Set(uniqueSignals.map(s => s.symbol))];
    const stockDataMap = {};

    for (const sym of uniqueSymbolsMap) {
        const req = uniqueSignals.find(s => s.symbol === sym);
        try {
            const data = await priceService.fetchFromUpstox(req.instrumentKey, '2025-01-01', '2026-06-01', 'day', sym);
            if (data && data.length > 0) {
                stockDataMap[sym] = data.map(c => ({
                    date: String(c.timestamp || c.date).split('T')[0],
                    open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
                })).sort((a, b) => a.date.localeCompare(b.date));
            }
        } catch (e) { }
    }

    const allSignals = [];
    const stockLastSeen = {};

    for (const req of uniqueSignals) {
        const dayOfWeek = req.addedDateObj.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const dailyC = stockDataMap[req.symbol];
        if (!dailyC) continue;

        const sIdx = dailyC.findIndex(c => c.date === req.addedDate);
        if (sIdx < 60 || sIdx + 11 >= dailyC.length) continue;

        let isDuplicate = false;
        if (stockLastSeen[req.symbol]) {
            const daysSinceLast = (req.addedDateObj.getTime() - stockLastSeen[req.symbol].getTime()) / (1000 * 3600 * 24);
            if (daysSinceLast <= 7) isDuplicate = true;
        }

        req.sIdx = sIdx;
        req.dailyC = dailyC;

        const highestClosePrior10 = Math.max(...dailyC.slice(sIdx - 10, sIdx).map(c => c.close));
        const isTrueBO = dailyC[sIdx].close > highestClosePrior10;

        if (!isTrueBO) continue;
        if (isDuplicate) continue;

        stockLastSeen[req.symbol] = req.addedDateObj;

        const closes200 = dailyC.slice(sIdx - 200 > 0 ? sIdx - 200 : 0, sIdx + 1).map(c => c.close);
        const sma50 = calcSMA(closes200, 50);
        const sma200 = calcSMA(closes200, 200);
        req.stage2 = dailyC[sIdx].close > sma50 && sma50 > sma200;

        const rsi14 = calcRSI(closes200.slice(closes200.length - 15), 14);
        req.rsiOk = rsi14 >= 60 && rsi14 <= 70;

        const nDay = niftyMap[req.addedDate];
        req.niftyOk = nDay && nDay.ema20 ? (nDay.close > nDay.ema20 * 0.98) : false;

        allSignals.push(req);
    }

    // Method E Base
    const methodE_candidates = allSignals.filter(s => s.stage2 && s.rsiOk && s.niftyOk);
    const methodE_final = [];

    console.log(`Fetching 30m intraday data for Type A checks on ${methodE_candidates.length} candidates...`);
    for (const req of methodE_candidates) {
        const minTo = toISTDateString(new Date(req.addedDateObj.getTime() + 86400000));
        try {
            const minD = await priceService.fetchFromUpstox(req.instrumentKey, req.addedDate, minTo, '30minute', req.symbol);
            if (minD && minD.length >= 2) {
                const close1H = minD[1].close;
                const dailyHigh = Math.max(...req.dailyC.slice(req.sIdx - 10, req.sIdx).map(c => c.high));
                if (close1H >= dailyHigh) {
                    methodE_final.push(req);
                }
            }
        } catch (e) { }
    }

    console.log(`Found ${methodE_final.length} exact Method E signals.`);

    const outData = [];
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════`);
    outData.push(` METHOD E STOP LOSS AUTOPSY (${methodE_final.length} Trades)`);
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════\n`);

    outData.push(`--- DETAILED TRADE LOG FOR E1 (Current 1.5-4% Structure Stop) ---`);
    outData.push(`Symbol       | Entry   | Stop    | Dist% | Hit? | HitDay | Day10Prc  | U.Win? | Outcome`);
    outData.push(`───────────────────────────────────────────────────────────────────────────────────────`);

    let whipsaws = 0;
    let savedLosers = 0;
    let survivors = 0;
    let trailWinners = 0;

    for (const sig of methodE_final) {
        const nextOpen = sig.dailyC[sig.sIdx + 1].open;

        const gap = ((nextOpen - sig.dailyC[sig.sIdx].close) / sig.dailyC[sig.sIdx].close) * 100;
        if (gap > 2.0 || gap < -3.0) continue; // align with Master Comparison logic

        const t = simulateTrade(sig.dailyC, sig.sIdx + 1, nextOpen, 'E1');
        if (!t) continue;

        const isStopHit = t.exitReason.includes('Stop Hit');
        const isTrailHit = t.exitReason.includes('Trail Hit');
        const isTarget = t.exitReason.includes('Target');
        const isTimeout = t.exitReason === 'Timeout';

        if (isStopHit && t.unmanagedWin) whipsaws++;
        if (isStopHit && !t.unmanagedWin) savedLosers++;
        if (isTimeout) survivors++;
        if ((isTrailHit && t.isWin) || isTarget) trailWinners++;

        outData.push(`${sig.symbol.padEnd(12)} | ${t.entryPrice.toFixed(1).padStart(7)} | ${t.initialStop.toFixed(1).padStart(7)} | ${t.stopDistPct.toFixed(1).padStart(4)}% | ${isStopHit ? 'YES ' : 'NO  '} | ${t.stopHitDay > 0 ? String(t.stopHitDay).padStart(6) : '    --'} | ${t.day10Price.toFixed(1).padStart(9)} | ${t.unmanagedWin ? ' YES   ' : ' NO    '} | ${t.exitReason.padEnd(16)} (Win: ${t.isWin ? 'Y' : 'N'})`);
    }

    outData.push(`\n--- E1 AUTOPSY METRICS ---`);
    outData.push(`Trades where stop hit BUT Day 10 > entry (Whipsaws): ${whipsaws} out of ${methodE_final.length}`);
    outData.push(`Trades where stop hit AND Day 10 < entry (Saved):    ${savedLosers} out of ${methodE_final.length}`);
    outData.push(`Trades that survived to Day 10 timeout:              ${survivors} out of ${methodE_final.length}`);
    outData.push(`Trades exited via trailing stop with profit:         ${trailWinners} out of ${methodE_final.length}\n`);

    outData.push(`--- FOUR STOP COMPARISONS ON ${methodE_final.length} TRADES ---`);

    function runAgg(mode) {
        let w = 0; let pnl = 0; let cnt = 0;
        for (const sig of methodE_final) {
            const nextOpen = sig.dailyC[sig.sIdx + 1].open;
            const gap = ((nextOpen - sig.dailyC[sig.sIdx].close) / sig.dailyC[sig.sIdx].close) * 100;
            if (gap > 2.0 || gap < -3.0) continue;

            const t = simulateTrade(sig.dailyC, sig.sIdx + 1, nextOpen, mode);
            if (!t) continue;
            cnt++;
            if (mode !== 'E4') pnl += t.pnlAmount; // Managed uses ₹1000 risk
            else pnl += t.pnlPct; // Unmanaged reports simple average returns for comparison, or we can use ₹100k sizing

            if (t.isWin) w++;
        }
        return { cnt, w, pnl };
    }

    const r1 = runAgg('E1');
    const r2 = runAgg('E2');
    const r3 = runAgg('E3');
    const r4 = runAgg('E4');

    outData.push(`E1: Current structure stop (1.5-4%):    ${r1.cnt} trades | ${((r1.w / r1.cnt) * 100).toFixed(1)}% WR | P&L ₹${Math.round(r1.pnl)}`);
    outData.push(`E2: Strict Signal Day Low as stop:      ${r2.cnt} trades | ${((r2.w / r2.cnt) * 100).toFixed(1)}% WR | P&L ₹${Math.round(r2.pnl)}`);
    outData.push(`E3: Volatility-based ATR Stop (1.5x):   ${r3.cnt} trades | ${((r3.w / r3.cnt) * 100).toFixed(1)}% WR | P&L ₹${Math.round(r3.pnl)}`);
    outData.push(`E4: NO stop, Day 10 timeout (Theory):   ${r4.cnt} trades | ${((r4.w / r4.cnt) * 100).toFixed(1)}% WR | P&L +${(r4.pnl / r4.cnt).toFixed(2)}% Avg Ret`);

    const fsWrite = require('fs');
    fsWrite.writeFileSync(path.join(__dirname, '../outputs/stop_loss_autopsy.txt'), outData.join('\n'));
    console.log("Successfully wrote Autopsy to outputs/stop_loss_autopsy.txt");
    process.exit(0);
}

main().catch(console.error);
