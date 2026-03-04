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

function simulateBreathingTrade(dailyC, entryIdx, entryPrice, stopMode) {
    if (entryIdx >= dailyC.length) return null;
    const signalIdx = entryIdx - 1;

    // Initial Stop is strictly 2x ATR below entry
    const atr = calcATR(dailyC, signalIdx, 14);
    const initialStop = entryPrice - (2.0 * atr);

    let currentStop = initialStop;

    // Wide stop sizes naturally smaller
    const riskDistance = entryPrice - currentStop;
    let qty = 1;
    if (riskDistance > 0) {
        qty = Math.floor(RISK_PER_TRADE / riskDistance);
    }
    if (qty <= 0) qty = 1;

    let exitPrice = 0;
    let exitReason = 'Timeout';

    for (let i = 1; i <= 10; i++) {
        const dIdx = entryIdx + i;
        if (dIdx >= dailyC.length) {
            exitPrice = dailyC[dailyC.length - 1].close;
            break;
        }

        const c = dailyC[dIdx];

        // --- 1. Check for Stop Hit FIRST ---
        if (c.open <= currentStop) {
            exitPrice = c.open;
            exitReason = currentStop === initialStop ? 'Stop Hit (Gap)' : 'Trail Hit (Gap)';
            break;
        } else if (c.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = currentStop === initialStop ? 'Stop Hit' : 'Trail Hit';
            break;
        }

        // --- 2. Process Trail Updates (for NEXT day) ---
        if (stopMode === 'Breathing Room') {
            // Day 1-5: No trail
            // Day 6-10: Trail to prior low
            if (i >= 6) {
                currentStop = Math.max(currentStop, dailyC[dIdx - 1].low);
            }
        }
        else if (stopMode === 'Medium Approach') {
            // Day 4: Trail to Entry (if profitable)
            if (i >= 4 && c.close > entryPrice) {
                currentStop = Math.max(currentStop, entryPrice);
            }
            // Day 7+: Trail prior low
            if (i >= 7) {
                currentStop = Math.max(currentStop, dailyC[dIdx - 1].low);
            }
        }
        else if (stopMode === 'Wide Stop No Trail') {
            // No trail ever. Only 2x ATR stop or Day 10 Exit.
            currentStop = initialStop;
        }

        // --- 3. Time Exit ---
        if (i === 10) {
            exitPrice = c.close;
            break;
        }
    }

    const rawRtrn = (exitPrice - entryPrice) / entryPrice;

    return {
        entryPrice, exitPrice, exitReason,
        pnlPct: rawRtrn * 100,
        pnlAmount: (exitPrice - entryPrice) * qty,
        isWin: rawRtrn > 0,
        qty: qty,
        posSize: qty * entryPrice
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

    console.log('Building 296 Clean Signal BASE...');
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

    // Isolate the 26 E Trades again
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
                if (close1H >= dailyHigh) { // Type A
                    methodE_final.push(req);
                }
            }
        } catch (e) { }
    }


    function runBatch(signals, modeName, entryType = 'NextMarketOpen') {
        let w = 0; let pnl = 0; let cnt = 0;
        let maxDrawdown = 0;
        let currentDrawdown = 0;
        let peakEquity = 100000;
        let currentEquity = 100000;
        let totalPctReturn = 0;

        for (const sig of signals) {
            let nextOpen = sig.dailyC[sig.sIdx + 1].open;

            if (entryType === 'NextMarketOpen') {
                const gap = ((nextOpen - sig.dailyC[sig.sIdx].close) / sig.dailyC[sig.sIdx].close) * 100;
                if (gap > 2.0 || gap < -3.0) continue; // align with Master Comparison logic
            }

            const t = simulateBreathingTrade(sig.dailyC, sig.sIdx + 1, nextOpen, modeName);
            if (!t) continue;

            cnt++;
            pnl += t.pnlAmount;
            totalPctReturn += t.pnlPct;

            currentEquity += t.pnlAmount;
            if (currentEquity > peakEquity) {
                peakEquity = currentEquity;
                currentDrawdown = 0;
            } else {
                currentDrawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
                maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
            }

            if (t.isWin) w++;
        }

        return {
            cnt,
            wr: cnt > 0 ? (w / cnt) * 100 : 0,
            pnl,
            maxDrawdown,
            avgPnl: cnt > 0 ? pnl / cnt : 0
        };
    }

    const outData = [];
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════`);
    outData.push(` THE BREATHING ROOM APPROACH (2x ATR Stops & Delayed Trailing)`);
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════\n`);

    // Test the 3 modes on Method E
    outData.push(`--- COMPARISON ON 26 METHOD-E TRADES ---`);
    const tm1 = runBatch(methodE_final, 'Wide Stop No Trail');
    outData.push(`WIDE STOP NO TRAIL (pure time exit):`);
    outData.push(`  Stop: 2x ATR | Exit: Day 10 close only`);
    outData.push(`  ${tm1.cnt} trades | ${tm1.wr.toFixed(1)}% WR | Avg P&L: ₹${Math.round(tm1.avgPnl)} | Total P&L: ₹${Math.round(tm1.pnl)} | Max DD: ${tm1.maxDrawdown.toFixed(1)}%\n`);

    const tm2 = runBatch(methodE_final, 'Breathing Room');
    outData.push(`BREATHING ROOM (The Sweet Spot):`);
    outData.push(`  Stop: 2x ATR | Trail: NONE Days 1-5, Prior Low Days 6-10`);
    outData.push(`  ${tm2.cnt} trades | ${tm2.wr.toFixed(1)}% WR | Avg P&L: ₹${Math.round(tm2.avgPnl)} | Total P&L: ₹${Math.round(tm2.pnl)} | Max DD: ${tm2.maxDrawdown.toFixed(1)}%\n`);

    const tm3 = runBatch(methodE_final, 'Medium Approach');
    outData.push(`MEDIUM APPROACH:`);
    outData.push(`  Stop: 2x ATR | Trail: Entry Day 4+, Prior Low Day 7+`);
    outData.push(`  ${tm3.cnt} trades | ${tm3.wr.toFixed(1)}% WR | Avg P&L: ₹${Math.round(tm3.avgPnl)} | Total P&L: ₹${Math.round(tm3.pnl)} | Max DD: ${tm3.maxDrawdown.toFixed(1)}%\n`);

    // Run best on full sets
    outData.push(`--- SCALING "BREATHING ROOM" TO LARGER BATCHES ---`);

    const tmAll = runBatch(allSignals, 'Breathing Room');
    outData.push(`BREATHING ROOM on full 296 clean signals:`);
    outData.push(`  ${tmAll.cnt} trades | ${tmAll.wr.toFixed(1)}% WR | Avg P&L: ₹${Math.round(tmAll.avgPnl)} | Total P&L: ₹${Math.round(tmAll.pnl)} | Max DD: ${tmAll.maxDrawdown.toFixed(1)}%\n`);

    const fSignals = allSignals.filter(s => s.stage2 && s.rsiOk && s.niftyOk);
    const tmFiltered = runBatch(fSignals, 'Breathing Room');
    outData.push(`BREATHING ROOM on 38 Stage2 + RSI + NIFTY filtered signals:`);
    outData.push(`  ${tmFiltered.cnt} trades | ${tmFiltered.wr.toFixed(1)}% WR | Avg P&L: ₹${Math.round(tmFiltered.avgPnl)} | Total P&L: ₹${Math.round(tmFiltered.pnl)} | Max DD: ${tmFiltered.maxDrawdown.toFixed(1)}%`);


    const fsWrite = require('fs');
    fsWrite.writeFileSync(path.join(__dirname, '../outputs/study_breathing_room.txt'), outData.join('\n'));
    console.log("Successfully wrote Breathing Room Study to outputs/study_breathing_room.txt");
    process.exit(0);
}

main().catch(console.error);
