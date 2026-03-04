const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

// ======= Indicator Helpers =======
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

function simulateWideStopTrade(dailyC, entryIdx, entryPrice) {
    if (entryIdx >= dailyC.length) return null;
    const signalIdx = entryIdx - 1;

    // Initial Stop is 2x ATR below entry
    const atr = calcATR(dailyC, signalIdx, 14);
    const initialStop = entryPrice - (2.0 * atr);

    const riskDistance = entryPrice - initialStop;
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

        // Stop Hit Validation
        if (c.open <= initialStop) {
            exitPrice = c.open;
            exitReason = 'Stop Hit (Gap)';
            break;
        } else if (c.low <= initialStop) {
            exitPrice = initialStop;
            exitReason = 'Stop Hit';
            break;
        }

        // Time Exit (No Trailing)
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
        r: (exitPrice - entryPrice) / riskDistance
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
        if (isDuplicate) {
            req.isDuplicate = true; // Mark to skip for First trades, but keep for Retests
        } else {
            req.isDuplicate = false;
        }

        stockLastSeen[req.symbol] = req.addedDateObj;

        // Base V5 Filters
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

    // --- 1. First Breakouts with Type A Confirmation ---
    const cleanFirstBOs = allSignals.filter(s => !s.isDuplicate && s.stage2 && s.rsiOk && s.niftyOk);
    const firstBO_Final = [];

    console.log(`Fetching 30m data to confirm Type A for First Breakouts...`);
    for (const req of cleanFirstBOs) {
        const minTo = toISTDateString(new Date(req.addedDateObj.getTime() + 86400000));
        try {
            const minD = await priceService.fetchFromUpstox(req.instrumentKey, req.addedDate, minTo, '30minute', req.symbol);
            if (minD && minD.length >= 2) {
                const close1H = minD[1].close;
                const dailyHigh = Math.max(...req.dailyC.slice(req.sIdx - 10, req.sIdx).map(c => c.high));
                if (close1H >= dailyHigh) {
                    firstBO_Final.push(req);
                }
            }
        } catch (e) { }
    }

    // --- 2. Retest Breakouts (Pullback held SMA20) ---
    const retests_Final = [];
    for (const sym of uniqueSymbolsMap) {
        const symSigs = allSignals.filter(s => s.symbol === sym).sort((a, b) => a.sIdx - b.sIdx);
        let leader = null;
        for (const sig of symSigs) {
            if (!sig.isDuplicate) { leader = sig; continue; }
            if (!leader) continue;

            const tDays = sig.sIdx - leader.sIdx;
            if (tDays > 10) { leader = null; continue; }

            let redCount = 0; let lowestLow = 999999;
            for (let j = leader.sIdx + 1; j < sig.sIdx; j++) {
                if (sig.dailyC[j].close < sig.dailyC[j].open) redCount++;
                lowestLow = Math.min(lowestLow, sig.dailyC[j].low);
            }

            if (redCount > 0) {
                const closes20 = sig.dailyC.slice(sig.sIdx - 20, sig.sIdx).map(c => c.close);
                const sma20 = calcSMA(closes20, 20);
                if (lowestLow >= sma20 && sig.stage2 && sig.rsiOk && sig.niftyOk) {
                    retests_Final.push(sig);
                }
                leader = null;
            }
        }
    }

    console.log(`Final Selection: ${firstBO_Final.length} First Type A BOs | ${retests_Final.length} SMA20 Retests`);

    function runScenario(signals) {
        let w = 0; let pnl = 0; let cnt = 0;
        let maxDrawdown = 0;
        let currentDrawdown = 0;
        let peakEquity = 100000;
        let currentEquity = 100000;

        // Sort chronologically for realistic drawdown tracking
        signals.sort((a, b) => a.addedDate.localeCompare(b.addedDate));

        for (const sig of signals) {
            let nextOpen = sig.dailyC[sig.sIdx + 1].open;
            const gap = ((nextOpen - sig.dailyC[sig.sIdx].close) / sig.dailyC[sig.sIdx].close) * 100;
            if (gap > 2.0 || gap < -3.0) continue;

            const t = simulateWideStopTrade(sig.dailyC, sig.sIdx + 1, nextOpen);
            if (!t) continue;

            cnt++;
            pnl += t.pnlAmount;

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

        return { cnt, wr: cnt > 0 ? (w / cnt) * 100 : 0, pnl, maxDrawdown };
    }

    const firstRun = runScenario(firstBO_Final);
    const retestRun = runScenario(retests_Final);

    // Combine both sets
    const combinedSignals = [...firstBO_Final, ...retests_Final];
    const combinedRun = runScenario(combinedSignals);

    const outData = [];
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════`);
    outData.push(` THE FINAL CONSOLIDATION (Filtered Entries + 2x ATR Wide Stops + No Trail)`);
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════\n`);

    outData.push(`FIRST BREAKOUTS ONLY (Filtered + Type A Confirmed):`);
    outData.push(`  ${firstRun.cnt} trades | ${firstRun.wr.toFixed(1)}% WR | Total P&L: ₹${Math.round(firstRun.pnl)} | Max DD: ${firstRun.maxDrawdown.toFixed(1)}%\n`);

    outData.push(`RETEST BREAKOUTS ONLY (Filtered + SMA20 Held):`);
    outData.push(`  ${retestRun.cnt} trades | ${retestRun.wr.toFixed(1)}% WR | Total P&L: ₹${Math.round(retestRun.pnl)} | Max DD: ${retestRun.maxDrawdown.toFixed(1)}%\n`);

    outData.push(`THE COMBINED PORTFOLIO (Running Both Strategies Simultaneously):`);
    outData.push(`  ${combinedRun.cnt} trades total | ${combinedRun.wr.toFixed(1)}% WR | Total P&L: ₹${Math.round(combinedRun.pnl)} | Max DD: ${combinedRun.maxDrawdown.toFixed(1)}%\n`);

    const fsWrite = require('fs');
    fsWrite.writeFileSync(path.join(__dirname, '../outputs/study_final_consolidation.txt'), outData.join('\n'));
    console.log("Successfully wrote Output to outputs/study_final_consolidation.txt");
    process.exit(0);
}

main().catch(console.error);
