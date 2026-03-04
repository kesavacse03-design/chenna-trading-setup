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

// ======= Full Trailing Stop Simulator =======
const RISK_PER_TRADE = 1000;

function simulateTrade(dailyC, entryIdx, entryPrice) {
    if (entryIdx >= dailyC.length) return null;

    // Structure Stop Calculation (Lowest low of entry day + prior day, max 4%, min 1.5%)
    let lowestLow = Math.min(dailyC[entryIdx].low, dailyC[entryIdx - 1]?.low || dailyC[entryIdx].low);
    let rawRiskPct = ((entryPrice - lowestLow) / entryPrice) * 100;

    if (rawRiskPct < 1.5) lowestLow = entryPrice * (1 - 0.015);
    else if (rawRiskPct > 4.0) lowestLow = entryPrice * (1 - 0.040);

    let currentStop = lowestLow;

    const qty = Math.floor(RISK_PER_TRADE / (entryPrice - currentStop));
    if (qty <= 0) return null;

    let exitPrice = 0;
    let exitReason = 'Timeout';

    for (let i = 1; i <= 10; i++) {
        const dIdx = entryIdx + i;
        if (dIdx >= dailyC.length) {
            exitPrice = dailyC[dailyC.length - 1].close;
            break;
        }

        const c = dailyC[dIdx];

        // Stop Hit
        if (c.open <= currentStop) {
            exitPrice = c.open; // slippage gap expected
            exitReason = 'Stop Hit (Gap)';
            break;
        } else if (c.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = 'Stop Hit';
            break;
        }

        // T1 Hit (2x Risk)
        const t1Price = entryPrice + ((entryPrice - lowestLow) * 2);
        if (c.high >= t1Price) {
            exitPrice = t1Price;
            exitReason = 'Target Hit';
            break;
        }

        // Phase 2 Breathing Trailing Stop
        const currentProfitPct = ((c.close - entryPrice) / entryPrice) * 100;
        if (i >= 3 && currentProfitPct >= 1.5) {
            currentStop = Math.max(currentStop, entryPrice * 0.99); // breakeven - 1%
        }

        // Phase 3 Aggressive Trail
        if (i >= 5) {
            currentStop = Math.max(currentStop, dailyC[dIdx - 1].low);
        }

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
        r: (exitPrice - entryPrice) / (entryPrice - lowestLow)
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
    const minuteDataMap = {}; // for Type A validation

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
    let dupCount = 0; let falseCount = 0;
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

        if (!isTrueBO) { falseCount++; continue; }

        if (isDuplicate) {
            dupCount++;
            // We KEEP the object for Retest cluster analysis later, but mark it
            req.isDuplicate = true;
        } else {
            req.isDuplicate = false;
        }

        stockLastSeen[req.symbol] = req.addedDateObj;

        // Calculate Filters
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

    const cleanFirstBOs = allSignals.filter(s => !s.isDuplicate);

    // Process Retests
    const retests = [];
    for (const sym of uniqueSymbolsMap) {
        const symSigs = allSignals.filter(s => s.symbol === sym).sort((a, b) => a.sIdx - b.sIdx);
        let leader = null;
        for (const sig of symSigs) {
            if (!sig.isDuplicate) { leader = sig; continue; }
            if (!leader) continue;

            const tDays = sig.sIdx - leader.sIdx;
            if (tDays > 10) continue;

            let redCount = 0; let lowestLow = 999999;
            for (let j = leader.sIdx + 1; j < sig.sIdx; j++) {
                if (sig.dailyC[j].close < sig.dailyC[j].open) redCount++;
                lowestLow = Math.min(lowestLow, sig.dailyC[j].low);
            }

            if (redCount > 0) {
                const closes20 = sig.dailyC.slice(sig.sIdx - 20, sig.sIdx).map(c => c.close);
                const sma20 = calcSMA(closes20, 20);
                sig.sma20Held = lowestLow >= sma20;
                retests.push(sig);
                leader = null;
            }
        }
    }

    console.log(`- Base: ${cleanFirstBOs.length} Clean BOs, ${retests.length} Red Retests`);

    // Needed for Method E (Type A Confirmation)
    console.log(`Fetching 30m intraday data for Type A checks...`);
    for (const req of cleanFirstBOs) {
        const minTo = toISTDateString(new Date(req.addedDateObj.getTime() + 86400000));
        try {
            const minD = await priceService.fetchFromUpstox(req.instrumentKey, req.addedDate, minTo, '30minute', req.symbol);
            if (minD && minD.length >= 2) {
                // Approximate 1H close using 2nd 30m candle
                req.close1H = minD[1].close;
            }
        } catch (e) { }
    }


    // ======= STRATEGY EXECUTION RUNNER =======
    function runStrategySet(signals, name, runOptions) {
        let totalPnl = 0;
        let wins = 0;
        let losses = 0;
        let maxDrawdown = 0;
        let currentDrawdown = 0;
        let peakEquity = 100000;
        let currentEquity = 100000;
        let consecLosses = 0;
        let maxConsecLosses = 0;

        let validEntries = 0;

        for (const sig of signals) {
            // Apply Entry Conditions
            if (runOptions.requireStage2 && !sig.stage2) continue;
            if (runOptions.requireRsi && !sig.rsiOk) continue;
            if (runOptions.requireNifty && !sig.niftyOk) continue;
            if (runOptions.requireSma20 && !sig.sma20Held) continue;
            if (runOptions.requireTypeA) {
                if (!sig.close1H) continue;
                const dailyHigh = Math.max(...sig.dailyC.slice(sig.sIdx - 10, sig.sIdx).map(c => c.high));
                if (sig.close1H < dailyHigh) continue; // Not a Type A hold
            }

            let trade;

            if (runOptions.entryType === 'SameDayClose') {
                trade = simulateTrade(sig.dailyC, sig.sIdx, sig.dailyC[sig.sIdx].close);
            } else if (runOptions.entryType === 'NextMarketOpen') {
                const nextOpen = sig.dailyC[sig.sIdx + 1].open;
                // strict gap control
                const gap = ((nextOpen - sig.dailyC[sig.sIdx].close) / sig.dailyC[sig.sIdx].close) * 100;
                if (gap > 2.0 || gap < -3.0) continue; // skip unrealistic open
                trade = simulateTrade(sig.dailyC, sig.sIdx + 1, nextOpen);
            } else if (runOptions.entryType === 'NextMarketLimit') {
                const targetLimit = sig.dailyC[sig.sIdx].close * 0.98; // 2% pullback limit
                if (sig.dailyC[sig.sIdx + 1].low <= targetLimit && sig.dailyC[sig.sIdx + 1].open >= targetLimit) {
                    trade = simulateTrade(sig.dailyC, sig.sIdx + 1, targetLimit);
                }
            }

            if (!trade) continue;

            validEntries++;
            totalPnl += trade.pnlAmount;

            currentEquity += trade.pnlAmount;
            if (currentEquity > peakEquity) {
                peakEquity = currentEquity;
                currentDrawdown = 0;
            } else {
                currentDrawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
                maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
            }

            if (trade.isWin) {
                wins++;
                consecLosses = 0;
            } else {
                losses++;
                consecLosses++;
                maxConsecLosses = Math.max(maxConsecLosses, consecLosses);
            }
        }

        const winRate = validEntries > 0 ? ((wins / validEntries) * 100).toFixed(1) : 0;
        const avgTrade = validEntries > 0 ? (totalPnl / validEntries).toFixed(0) : 0;

        return {
            name: name.padEnd(30),
            signals: String(signals.length).padStart(4),
            entered: String(validEntries).padStart(4),
            wr: String(winRate).padStart(5) + '%',
            pnlAmt: '₹' + String(Math.round(totalPnl)).padStart(5),
            avg: '₹' + String(avgTrade).padStart(4),
            dd: String(maxDrawdown.toFixed(1)).padStart(4) + '%',
            mcl: String(maxConsecLosses).padStart(2)
        };
    }

    const outData = [];
    outData.push('═══════════════════════════════════════════════════════════════════════════════════════');
    outData.push(' THE MASTER COMPARISON: ALL ENTRY METHODS (Simulated w/ ₹1000 Risk & Trailing Stops)');
    outData.push('═══════════════════════════════════════════════════════════════════════════════════════\n');
    outData.push(`METHOD                         | Sigs | Entr | WR    | Tot P&L | AvgT  | MaxDD | MCL`);
    outData.push(`───────────────────────────────────────────────────────────────────────────────────────`);

    const results = [];
    results.push(runStrategySet(cleanFirstBOs, 'A. Raw BOs (Same Day Mkt)', { entryType: 'SameDayClose' }));
    results.push(runStrategySet(cleanFirstBOs, 'B. + Base Stage/RSI/NIFTY', { entryType: 'SameDayClose', requireStage2: true, requireRsi: true, requireNifty: true }));
    results.push(runStrategySet(cleanFirstBOs, 'C. B + Next Mrng Market  ', { entryType: 'NextMarketOpen', requireStage2: true, requireRsi: true, requireNifty: true }));
    results.push(runStrategySet(cleanFirstBOs, 'D. B + Limit Order -2%   ', { entryType: 'NextMarketLimit', requireStage2: true, requireRsi: true, requireNifty: true }));
    results.push(runStrategySet(cleanFirstBOs, 'E. C + Type A (1H Conf)  ', { entryType: 'NextMarketOpen', requireStage2: true, requireRsi: true, requireNifty: true, requireTypeA: true }));

    results.push({ name: '──────────────────────────────', signals: '────', entered: '────', wr: '─────', pnlAmt: '──────', avg: '─────', dd: '─────', mcl: '──' });

    results.push(runStrategySet(retests, 'F. Raw Retests (Next Day)', { entryType: 'NextMarketOpen' }));
    results.push(runStrategySet(retests, 'G. F + SMA20 Held        ', { entryType: 'NextMarketOpen', requireSma20: true }));
    results.push(runStrategySet(retests, 'H. G + Base Stage/RSI/NFT', { entryType: 'NextMarketOpen', requireSma20: true, requireStage2: true, requireRsi: true, requireNifty: true }));
    results.push(runStrategySet(retests, 'I. G + Base Stage/RSI    ', { entryType: 'NextMarketOpen', requireSma20: true, requireStage2: true, requireRsi: true }));

    for (let r of results) {
        outData.push(`${r.name} | ${r.signals} | ${r.entered} | ${r.wr} | ${r.pnlAmt} | ${r.avg} | ${r.dd} | ${r.mcl}`);
    }

    const fsWrite = require('fs');
    fsWrite.writeFileSync(path.join(__dirname, '../outputs/master_comparison.txt'), outData.join('\n'));
    console.log("Successfully wrote Master Comparison to outputs/master_comparison.txt");
    process.exit(0);
}

main().catch(console.error);
