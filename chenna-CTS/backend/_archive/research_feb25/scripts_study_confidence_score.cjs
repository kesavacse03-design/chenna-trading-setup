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

function calcADX(dailyC, index, period = 14) {
    if (index < period * 2) return 0;
    let plusDMs = [], minusDMs = [], trs = [];
    for (let i = index - period * 2 + 1; i <= index; i++) {
        const upMove = dailyC[i].high - dailyC[i - 1].high;
        const downMove = dailyC[i - 1].low - dailyC[i].low;
        plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
        const tr = Math.max(
            dailyC[i].high - dailyC[i].low,
            Math.abs(dailyC[i].high - dailyC[i - 1].close),
            Math.abs(dailyC[i].low - dailyC[i - 1].close)
        );
        trs.push(tr);
    }
    // Smooth with Wilder's method
    let atrSmooth = trs.slice(0, period).reduce((a, b) => a + b, 0);
    let plusSmooth = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
    let minusSmooth = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

    const dxValues = [];
    for (let i = period; i < trs.length; i++) {
        atrSmooth = atrSmooth - (atrSmooth / period) + trs[i];
        plusSmooth = plusSmooth - (plusSmooth / period) + plusDMs[i];
        minusSmooth = minusSmooth - (minusSmooth / period) + minusDMs[i];

        const plusDI = atrSmooth > 0 ? (plusSmooth / atrSmooth) * 100 : 0;
        const minusDI = atrSmooth > 0 ? (minusSmooth / atrSmooth) * 100 : 0;
        const diSum = plusDI + minusDI;
        const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
        dxValues.push(dx);
    }

    if (dxValues.length === 0) return 0;
    let adx = dxValues.slice(0, Math.min(period, dxValues.length)).reduce((a, b) => a + b, 0) / Math.min(period, dxValues.length);
    for (let i = period; i < dxValues.length; i++) {
        adx = ((adx * (period - 1)) + dxValues[i]) / period;
    }
    return adx;
}

function calcMACD(closes) {
    if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
    const ema12 = calcEMAArray(closes, 12);
    const ema26 = calcEMAArray(closes, 26);
    const macdLine = [];
    for (let i = 0; i < closes.length; i++) {
        if (ema12[i] !== null && ema26[i] !== null) macdLine.push(ema12[i] - ema26[i]);
    }
    if (macdLine.length < 9) return { macd: macdLine[macdLine.length - 1] || 0, signal: 0, histogram: 0 };
    const signalLine = calcEMAFromArray(macdLine, 9);
    const macd = macdLine[macdLine.length - 1];
    const signal = signalLine;
    return { macd, signal, histogram: macd - signal };
}

function calcEMAArray(closes, period) {
    const result = new Array(closes.length).fill(null);
    if (closes.length < period) return result;
    const k = 2 / (period + 1);
    result[period - 1] = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        result[i] = closes[i] * k + result[i - 1] * (1 - k);
    }
    return result;
}

function calcEMAFromArray(arr, period) {
    if (arr.length < period) return arr[arr.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
    return ema;
}


async function main() {
    console.log('Fetching NIFTY baseline...');
    const niftyCandles = await priceService.fetchFromUpstox('NSE_INDEX|Nifty 50', '2025-01-01', '2026-06-01', 'day', 'NIFTY50');
    const niftyMap = {};
    const niftyCloses = [];
    for (let c of niftyCandles) {
        niftyCloses.push(c.close);
        const ema20 = calcEMA(niftyCloses, 20);
        niftyMap[String(c.timestamp).split('T')[0]] = {
            close: c.close, ema20: ema20,
            open: c.open
        };
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

        if (isDuplicate) continue;

        req.sIdx = sIdx;
        req.dailyC = dailyC;

        const highestClosePrior10 = Math.max(...dailyC.slice(sIdx - 10, sIdx).map(c => c.close));
        const isTrueBO = dailyC[sIdx].close > highestClosePrior10;

        if (!isTrueBO) continue;

        stockLastSeen[req.symbol] = req.addedDateObj;

        // ===== OUTCOME: Unmanaged Day 10 Win/Loss =====
        const day10Close = dailyC[sIdx + 10].close;
        const entryPrice = dailyC[sIdx].close;
        req.pnlPct = ((day10Close - entryPrice) / entryPrice) * 100;
        req.isWin = day10Close > entryPrice;

        // ===== FACTOR 1: NIFTY Context =====
        const nDay = niftyMap[req.addedDate];
        if (nDay) {
            const niftyChg = ((nDay.close - nDay.open) / nDay.open) * 100;
            if (niftyChg >= -0.5 && niftyChg <= 0.5) req.niftyCtx = 'flat';
            else if (niftyChg > 0.5) req.niftyCtx = 'up';
            else req.niftyCtx = 'down';
        } else {
            req.niftyCtx = 'unknown';
        }

        // ===== FACTOR 2: ADX(14) =====
        req.adx = calcADX(dailyC, sIdx, 14);

        // ===== FACTOR 3: 1H MACD State (will be populated later with intraday data) =====
        req.macd1H = null; // placeholder

        // ===== FACTOR 4: Signal Volume Ratio =====
        const avgVol20 = dailyC.slice(sIdx - 20, sIdx).reduce((a, c) => a + c.volume, 0) / 20;
        req.volRatio = avgVol20 > 0 ? dailyC[sIdx].volume / avgVol20 : 1;

        // ===== FACTOR 5: Candle Quality =====
        const candleRange = dailyC[sIdx].high - dailyC[sIdx].low;
        if (candleRange > 0) {
            req.closePosition = (dailyC[sIdx].close - dailyC[sIdx].low) / candleRange;
            req.upperWickPct = (dailyC[sIdx].high - Math.max(dailyC[sIdx].close, dailyC[sIdx].open)) / candleRange;
        } else {
            req.closePosition = 0.5;
            req.upperWickPct = 0;
        }

        // ===== FACTOR 6: 1H Consolidation (will be populated with intraday data) =====
        req.consolidation1H = null; // placeholder

        // ===== POST-ENTRY: Day+1 Candle Pattern =====
        const d1 = dailyC[sIdx + 1];
        const d0 = dailyC[sIdx];
        const d1Range = d1.high - d1.low;
        const d1Body = Math.abs(d1.close - d1.open);
        const d1IsGreen = d1.close > d1.open;
        const d1IsRed = d1.close < d1.open;

        if (d1IsGreen && d1Body / (d1Range || 1) > 0.8) req.day1Pattern = 'Marubozu Green';
        else if (d1IsGreen && d1.close > d0.high && d1.open <= d0.close) req.day1Pattern = 'Bullish Engulfing';
        else if (d1Range > 0 && d1Body / d1Range < 0.2) req.day1Pattern = 'Doji';
        else if (d1IsGreen) req.day1Pattern = 'Normal Green';
        else if (d1IsRed && d1Body / (d1Range || 1) > 0.8) req.day1Pattern = 'Marubozu Red';
        else if (d1IsRed && d1.close < d0.low && d1.open >= d0.close) req.day1Pattern = 'Bearish Engulfing';
        else if (d1IsRed) req.day1Pattern = 'Normal Red';
        else req.day1Pattern = 'Flat';

        // ===== POST-ENTRY: 5-Day Volume Green/Red Ratio =====
        let greenVol = 0, redVol = 0;
        for (let j = sIdx + 1; j <= Math.min(sIdx + 5, dailyC.length - 1); j++) {
            if (dailyC[j].close >= dailyC[j].open) greenVol += dailyC[j].volume;
            else redVol += dailyC[j].volume;
        }
        req.volGreenRedRatio = redVol > 0 ? greenVol / redVol : (greenVol > 0 ? 99 : 1);

        allSignals.push(req);
    }

    console.log(`Built ${allSignals.length} clean signals. Fetching 30m intraday data for MACD & Consolidation...`);

    // Fetch 30m intraday data for Factor 3 (MACD) and Factor 6 (Consolidation)
    let intradayFetched = 0;
    for (const req of allSignals) {
        try {
            const minD = await priceService.fetchFromUpstox(req.instrumentKey, req.addedDate, req.addedDate, '30minute', req.symbol);
            if (minD && minD.length >= 2) {
                // Factor 3: 1H MACD from 30m closes
                const minCloses = minD.map(c => parseFloat(c.close));
                if (minCloses.length >= 26) {
                    const macdResult = calcMACD(minCloses);
                    // "Bullish" = MACD histogram > 0 (momentum already running)
                    // "Flat/Crossing" = histogram near 0 or negative (fresh start)
                    req.macd1H = macdResult.histogram > 0 ? 'bullish' : 'flat_crossing';
                } else {
                    // Not enough bars for full MACD; use simple direction
                    // If last 2 closes are rising, call it "bullish"
                    if (minCloses.length >= 2 && minCloses[minCloses.length - 1] > minCloses[minCloses.length - 2]) {
                        req.macd1H = 'bullish';
                    } else {
                        req.macd1H = 'flat_crossing';
                    }
                }

                // Factor 6: 1H Consolidation at resistance
                // Count how many 30m candles have their high within 1% of the breakout close
                const breakoutClose = req.dailyC[req.sIdx].close;
                const resistanceZone = breakoutClose * 0.99; // within 1% of close
                let nearResistance = 0;
                for (const bar of minD) {
                    if (parseFloat(bar.high) >= resistanceZone) nearResistance++;
                }
                req.consolidation1H = minD.length > 0 ? (nearResistance / minD.length) * 100 : 0;
                intradayFetched++;
            }
        } catch (e) { }
    }

    console.log(`Fetched intraday for ${intradayFetched}/${allSignals.length} signals. Generating factor analysis...`);

    // ======= FACTOR ANALYSIS ENGINE =======
    const outData = [];
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════`);
    outData.push(` DATA-DRIVEN PRE-ENTRY CONFIDENCE SCORE: FACTOR ANALYSIS`);
    outData.push(` (${allSignals.length} Clean Unmanaged Signals, Win = Day10 Close > Entry)`);
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════\n`);

    function bucketStats(label, signals) {
        const wins = signals.filter(s => s.isWin).length;
        const wr = signals.length > 0 ? ((wins / signals.length) * 100).toFixed(1) : '0.0';
        const avgPnl = signals.length > 0 ? (signals.reduce((a, s) => a + s.pnlPct, 0) / signals.length).toFixed(2) : '0.00';
        return `  ${label.padEnd(50)} ${String(signals.length).padStart(4)} signals | ${wr.padStart(5)}% WR | ${avgPnl.padStart(6)}% Avg P&L`;
    }

    // FACTOR 1: NIFTY Context
    outData.push(`--- FACTOR 1: NIFTY CONTEXT ON SIGNAL DAY ---`);
    const nFlat = allSignals.filter(s => s.niftyCtx === 'flat');
    const nUp = allSignals.filter(s => s.niftyCtx === 'up');
    const nDown = allSignals.filter(s => s.niftyCtx === 'down');
    outData.push(bucketStats('NIFTY Flat (-0.5% to +0.5%)', nFlat));
    outData.push(bucketStats('NIFTY Up (> +0.5%)', nUp));
    outData.push(bucketStats('NIFTY Down (< -0.5%)', nDown));
    outData.push('');

    // FACTOR 2: ADX(14)
    outData.push(`--- FACTOR 2: ADX(14) LEVEL ---`);
    const adxHigh = allSignals.filter(s => s.adx >= 25);
    const adxMid = allSignals.filter(s => s.adx >= 20 && s.adx < 25);
    const adxLow = allSignals.filter(s => s.adx < 20);
    outData.push(bucketStats('ADX >= 25 (Strong Trend)', adxHigh));
    outData.push(bucketStats('ADX 20-25 (Emerging Trend)', adxMid));
    outData.push(bucketStats('ADX < 20 (No Trend / Choppy)', adxLow));
    outData.push('');

    // FACTOR 3: 1H MACD State
    outData.push(`--- FACTOR 3: 1H MACD STATE (INVERTED HYPOTHESIS) ---`);
    const macdBullish = allSignals.filter(s => s.macd1H === 'bullish');
    const macdFlat = allSignals.filter(s => s.macd1H === 'flat_crossing');
    const macdUnknown = allSignals.filter(s => s.macd1H === null);
    outData.push(bucketStats('1H MACD Flat/Crossing (Fresh Move)', macdFlat));
    outData.push(bucketStats('1H MACD Bullish (Momentum Running)', macdBullish));
    outData.push(bucketStats('1H MACD Unknown (No Intraday Data)', macdUnknown));
    outData.push('');

    // FACTOR 4: Signal Volume Ratio
    outData.push(`--- FACTOR 4: SIGNAL DAY VOLUME vs 20-DAY AVG ---`);
    const volLow = allSignals.filter(s => s.volRatio < 1.0);
    const volNormal = allSignals.filter(s => s.volRatio >= 1.0 && s.volRatio < 1.8);
    const volHigh = allSignals.filter(s => s.volRatio >= 1.8 && s.volRatio < 2.5);
    const volExtreme = allSignals.filter(s => s.volRatio >= 2.5);
    outData.push(bucketStats('Volume < 1.0× (Below Avg)', volLow));
    outData.push(bucketStats('Volume 1.0× - 1.8× (Moderate)', volNormal));
    outData.push(bucketStats('Volume 1.8× - 2.5× (High)', volHigh));
    outData.push(bucketStats('Volume > 2.5× (Extreme/Blow-off)', volExtreme));
    outData.push('');

    // FACTOR 5: Candle Quality
    outData.push(`--- FACTOR 5: CANDLE QUALITY (Close Position + Upper Wick) ---`);
    const cqGood = allSignals.filter(s => s.closePosition > 0.66 && s.upperWickPct < 0.20);
    const cqMid = allSignals.filter(s => s.closePosition >= 0.33 && s.closePosition <= 0.66);
    const cqBad = allSignals.filter(s => s.closePosition < 0.33 || s.upperWickPct > 0.30);
    // Catch items not in any bucket (close > 0.66 but wick > 0.20, etc)
    const cqOther = allSignals.filter(s => !cqGood.includes(s) && !cqMid.includes(s) && !cqBad.includes(s));
    outData.push(bucketStats('Close Top 33% + Wick < 20% (Strong)', cqGood));
    outData.push(bucketStats('Close Middle 33% (Neutral)', cqMid));
    outData.push(bucketStats('Close Bottom 33% OR Wick > 30% (Weak)', cqBad));
    if (cqOther.length > 0) outData.push(bucketStats('Other (Top Close but Wick 20-30%)', cqOther));
    outData.push('');

    // FACTOR 6: 1H Consolidation
    outData.push(`--- FACTOR 6: 1H CONSOLIDATION AT RESISTANCE ---`);
    const hasIntraday = allSignals.filter(s => s.consolidation1H !== null);
    const consHigh = hasIntraday.filter(s => s.consolidation1H >= 60);
    const consLow = hasIntraday.filter(s => s.consolidation1H < 60);
    const consNone = allSignals.filter(s => s.consolidation1H === null);
    outData.push(bucketStats('>= 60% of 30m bars near resistance (Acc.)', consHigh));
    outData.push(bucketStats('< 60% near resistance (Quick spike)', consLow));
    outData.push(bucketStats('No Intraday Data', consNone));
    outData.push('');

    // ======= PRELIMINARY SCORING (raw weights based on separation) =======
    outData.push(`\n═══════════════════════════════════════════════════════════════════════════════════════`);
    outData.push(` FINAL CONFIDENCE SCORE TIER VALIDATION (Data-Driven Weights)`);
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════\n`);

    for (const sig of allSignals) {
        let score = 0;

        // F1: NIFTY (Max 15)
        if (sig.niftyCtx === 'up') score += 15;
        else if (sig.niftyCtx === 'down') score += 10;
        else if (sig.niftyCtx === 'flat') score += 5;

        // F2: Signal Volume (Max 25)
        if (sig.volRatio > 2.5) score += 25;
        else if (sig.volRatio >= 1.8 && sig.volRatio <= 2.5) score += 18;
        else if (sig.volRatio >= 1.0 && sig.volRatio < 1.8) score += 15;
        else score += 0;

        // F3: Candle Quality (Max 25)
        if (sig.closePosition > 0.66 && sig.upperWickPct < 0.20) score += 25;
        else if (sig.closePosition > 0.66 && sig.upperWickPct >= 0.20 && sig.upperWickPct <= 0.30) score += 20;
        else if (sig.closePosition >= 0.33 && sig.closePosition <= 0.66) score += 10;
        else score += 0;

        // F4: 1H MACD State (Max 20)
        if (sig.macd1H === 'bullish') score += 20;
        else score += 5; // Flat/Crossing or Null

        // F5: ADX Level (Max 15)
        if (sig.adx >= 20 && sig.adx < 25) score += 15;
        else if (sig.adx >= 25) score += 12;
        else score += 0;

        sig.confidenceScore = score;
    }

    const tierHigh = allSignals.filter(s => s.confidenceScore >= 70);
    const tierMid = allSignals.filter(s => s.confidenceScore >= 45 && s.confidenceScore <= 69);
    const tierLow = allSignals.filter(s => s.confidenceScore <= 44);

    outData.push(bucketStats('Score 70-100 (HIGH Confidence)', tierHigh));
    outData.push(bucketStats('Score 45-69  (MEDIUM Confidence)', tierMid));
    outData.push(bucketStats('Score 0-44   (LOW Confidence)', tierLow));

    const highWR = tierHigh.length > 0 ? (tierHigh.filter(s => s.isWin).length / tierHigh.length * 100) : 0;
    const midWR = tierMid.length > 0 ? (tierMid.filter(s => s.isWin).length / tierMid.length * 100) : 0;
    const lowWR = tierLow.length > 0 ? (tierLow.filter(s => s.isWin).length / tierLow.length * 100) : 0;

    outData.push('');
    outData.push(`Monotonic Check: High ${highWR.toFixed(1)}% > Medium ${midWR.toFixed(1)}% > Low ${lowWR.toFixed(1)}% → ${highWR > midWR && midWR > lowWR ? '✅ MONOTONIC — VALID!' : '❌ NOT MONOTONIC — Weights need adjustment'}`);

    // ======= POST-ENTRY HEALTH CHECK =======
    outData.push(`\n\n═══════════════════════════════════════════════════════════════════════════════════════`);
    outData.push(` POST-ENTRY HEALTH CHECK: Day+1 Candle Pattern Win Rates`);
    outData.push(`═══════════════════════════════════════════════════════════════════════════════════════\n`);

    const patterns = ['Marubozu Green', 'Bullish Engulfing', 'Doji', 'Normal Green', 'Normal Red', 'Bearish Engulfing', 'Marubozu Red', 'Flat'];
    for (const p of patterns) {
        const pSigs = allSignals.filter(s => s.day1Pattern === p);
        if (pSigs.length > 0) {
            outData.push(bucketStats(`Day+1: ${p}`, pSigs));
        }
    }

    outData.push(`\n--- POST-ENTRY: 5-Day Green/Red Volume Ratio ---`);
    const vrHigh = allSignals.filter(s => s.volGreenRedRatio >= 2.0);
    const vrMid = allSignals.filter(s => s.volGreenRedRatio >= 0.8 && s.volGreenRedRatio < 2.0);
    const vrLow = allSignals.filter(s => s.volGreenRedRatio < 0.8);
    outData.push(bucketStats('Green/Red Volume >= 2.0× (Accumulation)', vrHigh));
    outData.push(bucketStats('Green/Red Volume 0.8× - 2.0× (Mixed)', vrMid));
    outData.push(bucketStats('Green/Red Volume < 0.8× (Distribution)', vrLow));

    const fsWrite = require('fs');
    fsWrite.writeFileSync(path.join(__dirname, '../outputs/confidence_score_analysis.txt'), outData.join('\n'));
    console.log("Successfully wrote Confidence Score Analysis to outputs/confidence_score_analysis.txt");
    process.exit(0);
}

main().catch(console.error);
