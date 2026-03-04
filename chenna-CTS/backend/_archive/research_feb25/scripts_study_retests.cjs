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

function classifyCandle(today, yesterday) {
    const range = today.high - today.low;
    const body = Math.abs(today.close - today.open);
    const upperWick = today.high - Math.max(today.open, today.close);
    const lowerWick = Math.min(today.open, today.close) - today.low;
    const isGreen = today.close > today.open;
    const isRed = today.close < today.open;
    const isDoji = body <= 0.1 * range;

    const isBullEngulf = isGreen && today.open <= yesterday.close && today.close >= yesterday.open && (today.close - today.open) > Math.abs(yesterday.close - yesterday.open);
    const isMarubozuGreen = isGreen && body >= 0.8 * range;

    if (isBullEngulf) return 'Bullish Engulfing';
    if (isMarubozuGreen) return 'Marubozu Green';
    if (isDoji) return 'Doji';
    if (isGreen) return 'Normal Green';
    return 'Any Red';
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
    if (!cat) process.exit(1);

    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id, addedDate: { gte: new Date('2025-08-01T00:00:00Z') } },
        include: { stock: true }
    });

    const uniqueSignals = Array.from(new Map(stockEntries.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, s])).values())
        .map(sc => ({
            symbol: sc.stock.symbol,
            instrumentKey: sc.stock.instrumentKey,
            addedDate: toISTDateString(sc.addedDate),
            addedDateObj: sc.addedDate,
            sector: sc.sector || sc.stock.sector || 'Unknown'
        }))
        .sort((a, b) => a.addedDate.localeCompare(b.addedDate));

    console.log(`Processing ${uniqueSignals.length} raw signals...`);

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

    const processedSignals = [];
    for (const req of uniqueSignals) {
        const dayOfWeek = req.addedDateObj.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const dailyC = stockDataMap[req.symbol];
        if (!dailyC) continue;

        const sIdx = dailyC.findIndex(c => c.date === req.addedDate);
        if (sIdx < 60 || sIdx + 10 >= dailyC.length) continue;

        const highestClosePrior10 = Math.max(...dailyC.slice(sIdx - 10, sIdx).map(c => c.close));
        const isTrueBO = dailyC[sIdx].close > highestClosePrior10;

        processedSignals.push({ ...req, dailyC, sIdx, isTrueBO });
    }

    const symbols = [...new Set(processedSignals.map(s => s.symbol))];
    const retests = [];

    // Find all retests up to 10 trading days
    for (const sym of symbols) {
        const symSignals = processedSignals.filter(s => s.symbol === sym).sort((a, b) => a.sIdx - b.sIdx);
        let leader = null;

        for (let i = 0; i < symSignals.length; i++) {
            const sig = symSignals[i];

            if (!leader) {
                if (sig.isTrueBO) leader = sig;
                continue;
            }

            const tDays = sig.sIdx - leader.sIdx;

            if (tDays > 10) {
                if (sig.isTrueBO) leader = sig;
                else leader = null;
                continue;
            }

            if (!sig.isTrueBO) continue;

            let redCount = 0;
            let lowestLow = 999999;
            for (let j = leader.sIdx + 1; j < sig.sIdx; j++) {
                if (sig.dailyC[j].close < sig.dailyC[j].open) redCount++;
                lowestLow = Math.min(lowestLow, sig.dailyC[j].low);
            }

            if (redCount > 0) {
                const closes20 = sig.dailyC.slice(sig.sIdx - 20, sig.sIdx).map(c => c.close);
                const sma20 = calcSMA(closes20, 20);

                const closes50 = sig.dailyC.slice(sig.sIdx - 50, sig.sIdx).map(c => c.close);
                const sma50 = calcSMA(closes50, 50);

                const closes200 = sig.dailyC.slice(sig.sIdx - 200 > 0 ? sig.sIdx - 200 : 0, sig.sIdx).map(c => c.close);
                const sma200 = calcSMA(closes200, 200);

                const closesRSI = sig.dailyC.slice(sig.sIdx - 20, sig.sIdx + 1).map(c => c.close);
                const rsi14 = calcRSI(closesRSI, 14);

                let niftyOk = false;
                const nDay = niftyMap[sig.addedDate];
                if (nDay && nDay.ema20) niftyOk = nDay.close > (nDay.ema20 * 0.98); // Nifty > EMA20 - 2% buffer

                const stage2 = sig.dailyC[sig.sIdx].close > sma50 && sma50 > sma200;
                const rsiOk = rsi14 >= 60 && rsi14 <= 70;

                retests.push({
                    symbol: sig.symbol,
                    leaderDate: leader.addedDate,
                    retestDate: sig.addedDate,
                    pullbackDays: tDays,
                    redCount: redCount,
                    pullbackDepthPct: ((lowestLow - sig.dailyC[leader.sIdx].close) / sig.dailyC[leader.sIdx].close) * 100,
                    sma20Held: lowestLow >= sma20,
                    day1Pattern: classifyCandle(sig.dailyC[sig.sIdx + 1], sig.dailyC[sig.sIdx]),
                    stage2, rsiOk, niftyOk,
                    win: sig.dailyC[sig.sIdx + 10].close > sig.dailyC[sig.sIdx].close,
                    pnl: ((sig.dailyC[sig.sIdx + 10].close - sig.dailyC[sig.sIdx].close) / sig.dailyC[sig.sIdx].close) * 100
                });

                // Once a retest fires, reset the leader to look for the next independent cluster
                leader = null;
            }
        }
    }

    const outData = [];
    const calc = (arr) => arr.length === 0 ? "0 signals" : `${arr.length} signals | ${((arr.filter(x => x.win).length / arr.length) * 100).toFixed(1)}% WR | Avg P&L ${(arr.reduce((a, b) => a + b.pnl, 0) / arr.length).toFixed(2)}%`;

    outData.push('═══════════════════════════════════════════════════════');
    outData.push(' RED CANDLE RETEST: COMPREHENSIVE VALIDATION');
    outData.push('═══════════════════════════════════════════════════════\n');

    // VALIDATION 1
    outData.push('--- VALIDATION 1: EXPANDED LOOKBACK WINDOW ---');
    const rr5 = retests.filter(x => x.pullbackDays <= 5);
    const rr7 = retests.filter(x => x.pullbackDays <= 7);
    const rr10 = retests.filter(x => x.pullbackDays <= 10);
    outData.push(`Retest within 5 trading days:   ${calc(rr5)}`);
    outData.push(`Retest within 7 trading days:   ${calc(rr7)}`);
    outData.push(`Retest within 10 trading days:  ${calc(rr10)}\n`);

    // Using Window <= 10 (rr10) as the baseline for remaining validations to maximize sample size
    const baseList = rr10;

    // VALIDATION 2
    outData.push('--- VALIDATION 2: DAY+1 CONFIRMATION PATTERN (for <=10 day retests) ---');
    const v2_strong = baseList.filter(x => ['Bullish Engulfing', 'Marubozu Green'].includes(x.day1Pattern));
    const v2_doji = baseList.filter(x => x.day1Pattern === 'Doji');
    const v2_green = baseList.filter(x => x.day1Pattern === 'Normal Green');
    const v2_red = baseList.filter(x => x.day1Pattern === 'Any Red');
    outData.push(`Retest + Day+1 Bullish Engulf/Marubozu: ${calc(v2_strong)}`);
    outData.push(`Retest + Day+1 Doji:                    ${calc(v2_doji)}`);
    outData.push(`Retest + Day+1 Normal Green:            ${calc(v2_green)}`);
    outData.push(`Retest + Day+1 Any Red:                 ${calc(v2_red)}\n`);

    // VALIDATION 3
    outData.push('--- VALIDATION 3: PULLBACK SHAPE ANALYSIS ---');
    const avgP = baseList.reduce((a, b) => a + b.pullbackDepthPct, 0) / baseList.length;
    const minP = Math.max(...baseList.map(x => x.pullbackDepthPct)); // Math.max because values are negative
    const maxP = Math.min(...baseList.map(x => x.pullbackDepthPct));
    outData.push(`How deep was the pullback from first breakout close?`);
    outData.push(`  Average pullback: ${avgP.toFixed(2)}%`);
    outData.push(`  Smallest pullback: ${minP.toFixed(2)}%`);
    outData.push(`  Deepest pullback: ${maxP.toFixed(2)}%\n`);

    outData.push(`How many red candles in the pullback?`);
    outData.push(`  1 red candle:   ${calc(baseList.filter(x => x.redCount === 1))}`);
    outData.push(`  2 red candles:  ${calc(baseList.filter(x => x.redCount === 2))}`);
    outData.push(`  3+ red candles: ${calc(baseList.filter(x => x.redCount >= 3))}\n`);

    outData.push(`Did pullback hold above SMA20?`);
    outData.push(`  YES (held support): ${calc(baseList.filter(x => x.sma20Held))}`);
    outData.push(`  NO (broke SMA20):   ${calc(baseList.filter(x => !x.sma20Held))}\n`);

    // VALIDATION 4
    outData.push('--- VALIDATION 4: V5 CORE FILTERS COMBINATION ---');
    const fStage = baseList.filter(x => x.stage2);
    const fRsi = fStage.filter(x => x.rsiOk);
    const fNifty = fRsi.filter(x => x.niftyOk);

    outData.push(`All ${baseList.length} retests raw:                        ${calc(baseList)}`);
    outData.push(`Retests + Stage 2:                        ${calc(fStage)}`);
    outData.push(`Retests + Stage 2 + RSI 60-70:            ${calc(fRsi)}`);
    outData.push(`Retests + Stage 2 + RSI 60-70 + NIFTY:    ${calc(fNifty)}\n`);

    // VALIDATION 5
    outData.push('--- VALIDATION 5: RAW TRADES (FOR VISUAL INSPECTION) ---');
    outData.push('Format: Symbol | FirstBO | PullbackDays | DaysRed | DepthPct | SMA20 | RetestDate | 10dReturn | Outcome');
    baseList.forEach(x => {
        outData.push(`${x.symbol.padEnd(12)} | ${x.leaderDate} | ${String(x.pullbackDays).padStart(2)}d | ${String(x.redCount).padStart(2)}d | ${String(x.pullbackDepthPct.toFixed(1)).padStart(5)}% | ${x.sma20Held ? 'HELD ' : 'BROKE'} | ${x.retestDate} | ${String(x.pnl.toFixed(1)).padStart(5)}% | ${x.win ? 'WIN' : 'LOSS'}`);
    });

    const fsWrite = require('fs');
    fsWrite.writeFileSync(path.join(__dirname, '../outputs/retest_validation.txt'), outData.join('\n'));
    console.log("Successfully wrote output to outputs/retest_validation.txt");

    process.exit(0);
}

main().catch(console.error);
