const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function calcEMA(data, period) {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcSMA(data, period) {
    if (data.length < period) return null;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcATR(data, period = 14) {
    if (data.length < period + 1) return null;
    const trs = [];
    for (let i = 1; i < data.length; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const pc = data[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const sliced = trs.slice(-period);
    return sliced.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(data, period = 14) {
    if (data.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcBollingerBands(closes, period = 20, multiplier = 2) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return { upper: middle + multiplier * stdDev, middle, lower: middle - multiplier * stdDev, width: (2 * multiplier * stdDev) / middle };
}

function getYearWeek(dateStr) {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${weekNo}`;
}

function isNear(val, target, pct = 0.02) {
    return Math.abs(val - target) / target <= pct;
}

function checkTypeAConfirmation(m30Data, targetDateStr, breakoutLevel) {
    const dayData = m30Data.filter(c => c.date.startsWith(targetDateStr));
    let hasConfirmation = false;
    for (let i = 0; i < dayData.length; i += 2) {
        const c1 = dayData[i];
        const c2 = dayData[i + 1];
        const h1Close = c2 ? c2.close : c1.close;
        const hTime = c2 ? c2.date : c1.date;
        if (hTime.includes(' 10:') || hTime.includes(' 11:') || hTime.includes(' 12:') || hTime.includes(' 13:') || hTime.includes(' 14:') || hTime.includes(' 15:')) {
            if (h1Close > breakoutLevel) { hasConfirmation = true; break; }
        }
    }
    return hasConfirmation;
}

async function main() {
    console.log(`\n======================================================`);
    console.log(`STUDY 8: PRICE ACTION & MULTI-TIMEFRAME STRUCTURE`);

    const cacheDirDay = path.join(__dirname, '../cache/day');
    const cacheDir30m = path.join(__dirname, '../cache/30minute');
    let niftyData = [];
    const files = fs.readdirSync(cacheDirDay);
    const niftyFile = files.find(f => f.startsWith('NIFTY50_'));
    if (niftyFile) {
        const parsed = JSON.parse(fs.readFileSync(path.join(cacheDirDay, niftyFile), 'utf8'));
        niftyData = (parsed.data || parsed).map(c => ({
            date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
            close: parseFloat(c.close)
        })).sort((a, b) => a.date.localeCompare(b.date));
    }

    const checkNifty = (date, multi = 0.98) => {
        let nIdx = niftyData.findIndex(c => c.date === date);
        if (nIdx === -1) for (let i = niftyData.length - 1; i >= 0; i--) { if (niftyData[i].date <= date) { nIdx = i; break; } }
        if (nIdx < 20) return false;
        const closes = niftyData.slice(0, nIdx + 1).map(c => c.close);
        return closes[closes.length - 1] > (calcEMA(closes, 20) * multi);
    };

    const getNiftyDist = (date) => {
        let nIdx = niftyData.findIndex(c => c.date === date);
        if (nIdx === -1) for (let i = niftyData.length - 1; i >= 0; i--) { if (niftyData[i].date <= date) { nIdx = i; break; } }
        if (nIdx < 20) return 0;
        const closes = niftyData.slice(0, nIdx + 1).map(c => c.close);
        const sma20 = calcEMA(closes, 20);
        return ((closes[closes.length - 1] - sma20) / sma20) * 100;
    };

    await analyzeSTSwingDown(cacheDirDay, cacheDir30m, checkNifty, getNiftyDist);
    await analyzeLTSwingUp(cacheDirDay, cacheDir30m, checkNifty, getNiftyDist);
    await analyzeSTSwingUp(cacheDirDay, cacheDir30m, checkNifty, getNiftyDist);

    await prisma.$disconnect();

    // ==========================================
    // ST_SWING_DOWN
    // ==========================================
    async function analyzeSTSwingDown(dirDay, dir30, checkNifty, getNiftyDist) {
        console.log(`\n--- CATEGORY: ST_SWING_DOWN ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSignals = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, signalDateStr: toISTDateString(s.addedDate) }])).values());

        const trades = [];
        for (const sig of uniqueSignals) {
            const ck = sig.iKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fk = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dayPath = path.join(dirDay, `${ck}_master.json`);
            if (!fs.existsSync(dayPath)) dayPath = path.join(dirDay, `${fk}_master.json`);
            let mP = path.join(dir30, `${ck}_master.json`);
            if (!fs.existsSync(mP)) mP = path.join(dir30, `${fk}_master.json`);
            if (!fs.existsSync(dayPath)) continue;

            const cData = (JSON.parse(fs.readFileSync(dayPath, 'utf8')).data || JSON.parse(fs.readFileSync(dayPath, 'utf8'))).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0], open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.signalDateStr);
            if (sIdx < 200 || sIdx + 5 >= cData.length) continue;
            if (!calcRSI(cData.slice(0, sIdx + 1).map(c => c.close)) || calcRSI(cData.slice(0, sIdx + 1).map(c => c.close)) >= 40) continue;
            if (!checkNifty(sig.signalDateStr, 0.96)) continue;

            let entryIdx = -1; let stateA = 0; let low1 = Infinity, low2Candle = null, runningLow = Infinity, dbConfirmed = false;
            for (let d = 1; d <= 15; d++) {
                const cIdx = sIdx + d;
                if (cIdx >= cData.length) break;
                const tc = cData[cIdx];
                if (stateA === 0) {
                    if (tc.low < runningLow) runningLow = tc.low;
                    if (tc.high >= runningLow * 1.02) { low1 = runningLow; stateA = 1; }
                } else if (stateA === 1) {
                    if (tc.low < low1 * 0.99) { stateA = 0; runningLow = tc.low; continue; }
                    if (tc.low <= low1 * 1.02) { low2Candle = tc; stateA = 2; }
                } else if (stateA === 2) {
                    if (tc.low < low1 * 0.99) { stateA = 0; runningLow = tc.low; continue; }
                    if (tc.close > low2Candle.high) dbConfirmed = true;
                }

                if (dbConfirmed) {
                    const sma10 = calcSMA(cData.slice(0, cIdx + 1).map(c => c.close), 10);
                    if (sma10 && tc.close > sma10) { entryIdx = cIdx + 1; break; }
                }
            }

            if (entryIdx !== -1 && entryIdx < cData.length) {
                const entryPrice = cData[entryIdx].open;
                const atr14 = calcATR(cData.slice(0, entryIdx), 14);
                if (!atr14) continue;
                const stopLoss = entryPrice - (2 * atr14);
                let exitPrice = 0;
                for (let hold = 1; hold <= 5; hold++) {
                    const hIdx = entryIdx + hold;
                    if (hIdx >= cData.length) { exitPrice = cData[cData.length - 1].close; break; }
                    const tc = cData[hIdx];
                    if (tc.open <= stopLoss) { exitPrice = tc.open; break; }
                    if (tc.low <= stopLoss) { exitPrice = stopLoss; break; }
                    if (hold === 5) { exitPrice = tc.close; break; }
                }
                const win = exitPrice > entryPrice;

                // Indicators calculation
                const histDay = cData.slice(0, sIdx + 1);
                const sma20 = calcSMA(histDay.map(c => c.close), 20);
                const sma50 = calcSMA(histDay.map(c => c.close), 50);
                const sma200 = calcSMA(histDay.map(c => c.close), 200);
                const priorSwingLow = Math.min(...cData.slice(sIdx - 50, sIdx).map(c => c.low));
                const bb = calcBollingerBands(histDay.map(c => c.close));

                let confCount = 0;
                if (sma20 && isNear(entryPrice, sma20)) confCount++;
                if (sma50 && isNear(entryPrice, sma50)) confCount++;
                if (sma200 && isNear(entryPrice, sma200)) confCount++;
                if (isNear(entryPrice, priorSwingLow)) confCount++;
                if (Math.abs((entryPrice % 100)) < entryPrice * 0.02 || Math.abs(100 - (entryPrice % 100)) < entryPrice * 0.02) confCount++;

                let confBucket = '0-1 levels'; if (confCount >= 4) confBucket = '4+ levels'; else if (confCount >= 2) confBucket = '2-3 levels';

                const wCloses = [];
                const wMap = new Map();
                for (const c of histDay) wMap.set(getYearWeek(c.date), c.close);
                wMap.forEach(v => wCloses.push(v));
                const wSma10 = calcSMA(wCloses, 10);
                const isDailyBear = cData[sIdx].close < sma20;
                const isWeeklyBear = wSma10 ? wCloses[wCloses.length - 1] < wSma10 : false;

                let is1hBear = false;
                try {
                    const p30 = JSON.parse(fs.readFileSync(mP, 'utf8'));
                    const m30Data = (p30.data || p30).map(c => ({ date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16), close: parseFloat(c.close) })).sort((a, b) => a.date.localeCompare(b.date));
                    const sig30Idx = m30Data.findIndex(c => c.date.startsWith(cData[sIdx].date));
                    if (sig30Idx > 50) {
                        const h1Ema20 = calcEMA(m30Data.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close), 20);
                        const h1Ema50 = calcEMA(m30Data.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close), 50);
                        if (h1Ema20 && h1Ema50) is1hBear = h1Ema20 < h1Ema50;
                    }
                } catch (e) { }

                let mtfBucket = 'Mixed signals';
                if (isDailyBear && isWeeklyBear && is1hBear) mtfBucket = 'All 3 bearish at signal';

                // Weekly Candle
                const wCandles = [];
                const wMapHLC = new Map();
                for (const c of histDay) {
                    const wk = getYearWeek(c.date);
                    if (!wMapHLC.has(wk)) wMapHLC.set(wk, []);
                    wMapHLC.get(wk).push(c);
                }
                const wkSigStr = getYearWeek(cData[sIdx].date);
                const wkCandlesData = wMapHLC.get(wkSigStr) || [];
                let wkPat = 'Weekly Continued Red';
                if (wkCandlesData.length) {
                    const wO = wkCandlesData[0].open;
                    const wC = wkCandlesData[wkCandlesData.length - 1].close;
                    const wH = Math.max(...wkCandlesData.map(v => v.high));
                    const wL = Math.min(...wkCandlesData.map(v => v.low));

                    const wRange = wH - wL + 0.0001;
                    if (wC > wO && wO <= wL + wRange * 0.3 && wC >= wH - wRange * 0.3) wkPat = 'Weekly Bullish Engulfing'; // roughly
                    else if ((Math.min(wO, wC) - wL) > (wRange * 0.6) && (wH - Math.max(wO, wC)) < (wRange * 0.2)) wkPat = 'Weekly Hammer';
                }

                const gapPct = (cData[sIdx + 1].open / cData[sIdx].close - 1) * 100;
                let gapBucket = 'No Gap (-1% to +1%)';
                if (gapPct > 1) gapBucket = 'Gap Up > 1%'; else if (gapPct < -1) gapBucket = 'Gap Down < -1%';

                // Fib retracement
                const prHi = Math.max(...cData.slice(sIdx - 50, sIdx).map(c => c.high));
                const prLo = Math.min(...cData.slice(Math.max(0, sIdx - 150), sIdx - 50).map(c => c.low)); // rough rally base
                let fibBucket = 'No Man Land';
                if (prHi > prLo) {
                    const rRng = prHi - prLo;
                    if (isNear(entryPrice, prHi - rRng * 0.618)) fibBucket = 'Retraced to 0.618';
                    else if (isNear(entryPrice, prHi - rRng * 0.786)) fibBucket = 'Retraced to 0.786';
                    else if (isNear(entryPrice, prLo)) fibBucket = 'Retraced to 1.0';
                }

                trades.push({ win, confBucket, mtfBucket, wkPat, gapBucket, fibBucket });
            }
        }
        analyzeTool('ST_DOWN A: Confluence Count', trades, t => t.confBucket, ['0-1 levels', '2-3 levels', '4+ levels']);
        analyzeTool('ST_DOWN B: MTF Alignment', trades, t => t.mtfBucket, ['All 3 bearish at signal', 'Mixed signals']);
        analyzeTool('ST_DOWN C: Weekly Pat', trades, t => t.wkPat, ['Weekly Hammer', 'Weekly Bullish Engulfing', 'Weekly Continued Red']);
        analyzeTool('ST_DOWN D: Gap Next Day', trades, t => t.gapBucket, ['Gap Up > 1%', 'No Gap (-1% to +1%)', 'Gap Down < -1%']);
        analyzeTool('ST_DOWN E: Fib Retracement', trades, t => t.fibBucket, ['Retraced to 0.618', 'Retraced to 0.786', 'Retraced to 1.0', 'No Man Land']);
    }

    // ==========================================
    // LT_SWING_UP
    // ==========================================
    async function analyzeLTSwingUp(dirDay, dir30, checkNifty, getNiftyDist) {
        console.log(`\n--- CATEGORY: LT_SWING_UP ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_UP' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSigs = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, sDate: toISTDateString(s.addedDate) }])).values());

        const trades = [];
        for (const sig of uniqueSigs) {
            const ck = sig.iKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fk = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dPath = path.join(dirDay, `${ck}_master.json`);
            if (!fs.existsSync(dPath)) dPath = path.join(dirDay, `${fk}_master.json`);
            let mP = path.join(dir30, `${ck}_master.json`);
            if (!fs.existsSync(mP)) mP = path.join(dir30, `${fk}_master.json`);
            if (!fs.existsSync(dPath) || !fs.existsSync(mP)) continue;

            const cData = (JSON.parse(fs.readFileSync(dPath, 'utf8')).data || JSON.parse(fs.readFileSync(dPath, 'utf8'))).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0], open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.sDate);
            if (sIdx < 50 || sIdx + 13 >= cData.length) continue;
            const hist = cData.slice(0, sIdx + 1);
            const rsi = calcRSI(hist.map(c => c.close));
            if (!rsi || rsi < 60 || rsi > 70) continue;
            if (!checkNifty(sig.sDate, 0.98)) continue;

            const wCloses = [];
            const wMap = new Map();
            for (const c of hist) wMap.set(getYearWeek(c.date), c.close);
            wMap.forEach(v => wCloses.push(v));
            if (wCloses.length < 30) continue;
            if (calcEMA(wCloses, 10) <= calcEMA(wCloses, 30)) continue;

            const max50C = Math.max(...cData.slice(sIdx - 50, sIdx).map(c => c.close));
            let m30Data = [];
            try {
                const p30 = JSON.parse(fs.readFileSync(mP, 'utf8'));
                m30Data = (p30.data || p30).map(c => ({ date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16), close: parseFloat(c.close) })).sort((a, b) => a.date.localeCompare(b.date));
            } catch (e) { }

            const isConfirmed = checkTypeAConfirmation(m30Data, cData[sIdx + 1].date, max50C);
            if (isConfirmed && sIdx + 2 < cData.length) {
                const entryIdx = sIdx + 2;
                const entryPrice = cData[entryIdx].open;
                const atr14 = calcATR(cData.slice(0, entryIdx), 14);
                if (!atr14) continue;
                const stopLoss = entryPrice - (3.0 * atr14);
                let exitPrice = 0;
                for (let hold = 1; hold <= 13; hold++) {
                    const hIdx = entryIdx + hold;
                    if (hIdx >= cData.length) { exitPrice = cData[cData.length - 1].close; break; }
                    const tc = cData[hIdx];
                    if (tc.open <= stopLoss) { exitPrice = tc.open; break; }
                    if (tc.low <= stopLoss) { exitPrice = stopLoss; break; }
                    if (hold === 13) { exitPrice = tc.close; break; }
                }
                const win = exitPrice > entryPrice;

                // Indicators calculation
                const histDay = cData.slice(0, sIdx + 1);
                const sma20 = calcSMA(histDay.map(c => c.close), 20);
                const sma50 = calcSMA(histDay.map(c => c.close), 50);
                const sma200 = calcSMA(histDay.map(c => c.close), 200);
                const priorSwingHi = max50C;

                let confCount = 0;
                if (sma20 && isNear(entryPrice, sma20)) confCount++;
                if (sma50 && isNear(entryPrice, sma50)) confCount++;
                if (sma200 && isNear(entryPrice, sma200)) confCount++;
                if (isNear(entryPrice, priorSwingHi)) confCount++;
                if (Math.abs((entryPrice % 100)) < entryPrice * 0.02 || Math.abs(100 - (entryPrice % 100)) < entryPrice * 0.02) confCount++;
                let confBucket = '0-1 levels'; if (confCount >= 4) confBucket = '4+ levels'; else if (confCount >= 2) confBucket = '2-3 levels';

                const wSma10 = calcSMA(wCloses, 10);
                const isDailyBull = cData[sIdx].close > sma20;
                const isWeeklyBull = wSma10 ? wCloses[wCloses.length - 1] > wSma10 : false;
                let is1hBull = false;
                try {
                    const p30 = JSON.parse(fs.readFileSync(mP, 'utf8'));
                    const p30D = (p30.data || p30).map(c => ({ date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16), close: parseFloat(c.close) })).sort((a, b) => a.date.localeCompare(b.date));
                    const sig30Idx = p30D.findIndex(c => c.date.startsWith(cData[sIdx].date));
                    if (sig30Idx > 50) {
                        const h1Ema20 = calcEMA(p30D.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close), 20);
                        const h1Ema50 = calcEMA(p30D.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close), 50);
                        if (h1Ema20 && h1Ema50) is1hBull = h1Ema20 > h1Ema50;
                    }
                } catch (e) { }
                let align = 0; if (isDailyBull) align++; if (isWeeklyBull) align++; if (is1hBull) align++;
                let mtfBucket = align === 3 ? 'All 3 aligned bullish' : align === 2 ? '2 of 3 aligned' : '1 or 0 aligned';

                // Weekly Candle
                const wMapHLC = new Map();
                for (const c of histDay) {
                    const wk = getYearWeek(c.date);
                    if (!wMapHLC.has(wk)) wMapHLC.set(wk, []);
                    wMapHLC.get(wk).push(c);
                }
                const wkSigStr = getYearWeek(cData[sIdx].date);
                const wkCandlesData = wMapHLC.get(wkSigStr) || [];
                let wkPat = 'Other';
                if (wkCandlesData.length) {
                    const wO = wkCandlesData[0].open; const wC = wkCandlesData[wkCandlesData.length - 1].close;
                    const wH = Math.max(...wkCandlesData.map(v => v.high)); const wL = Math.min(...wkCandlesData.map(v => v.low));
                    const wRange = wH - wL + 0.0001;
                    if (wC > wH - wRange * 0.2) wkPat = 'Weekly Breakout Candle';
                    else if (Math.abs(wC - wO) < wRange * 0.1) wkPat = 'Weekly Doji';
                    else if (wH - Math.max(wO, wC) > wRange * 0.6 && Math.min(wO, wC) - wL < wRange * 0.2) wkPat = 'Weekly Shooting Star';
                }

                const gapPct = (cData[sIdx + 1].open / cData[sIdx].close - 1) * 100;
                let gapBucket = 'No Gap (-1% to +1%)';
                if (gapPct > 1) gapBucket = 'Gap Up > 1%'; else if (gapPct < -1) gapBucket = 'Gap Down < -1%';

                const priorLo = Math.min(...cData.slice(sIdx - 50, sIdx).map(c => c.low));
                let fibBucket = 'No Man Land';
                if (priorSwingHi > priorLo) {
                    const sw = priorSwingHi - priorLo;
                    if (isNear(entryPrice, priorSwingHi)) fibBucket = 'Price at 1.0 extension';
                    else if (isNear(entryPrice, priorSwingHi + sw * 0.272)) fibBucket = 'Price at 1.272 extension';
                    else if (isNear(entryPrice, priorSwingHi + sw * 0.618)) fibBucket = 'Price at 1.618 extension';
                    else if (isNear(entryPrice, priorLo + sw * 0.618)) fibBucket = 'Price at 0.618 extension';
                }

                let scoreObj = { win, confBucket, mtfBucket, wkPat, gapBucket, fibBucket };

                // Track Confidence Validation Variables
                const weGap = calcEMA(wCloses, 10) && calcEMA(wCloses, 30) ? (calcEMA(wCloses, 10) - calcEMA(wCloses, 30)) / calcEMA(wCloses, 30) * 100 : 0;
                const distH52 = Math.max(...cData.slice(Math.max(0, sIdx - 250), sIdx).map(c => c.high)) > 0 ? (Math.max(...cData.slice(Math.max(0, sIdx - 250), sIdx).map(c => c.high)) - cData[sIdx].close) / Math.max(...cData.slice(Math.max(0, sIdx - 250), sIdx).map(c => c.high)) * 100 : 0;
                const volRatio = cData[sIdx].volume / (cData.slice(sIdx - 20, sIdx).reduce((a, b) => a + b.volume, 0) / 20);
                const bb = calcBollingerBands(cData.slice(0, sIdx + 1).map(c => c.close));
                let bbWidth = 1;
                if (bb) {
                    const ws = []; for (let i = 0; i < 20; i++) { const b = calcBollingerBands(cData.slice(0, sIdx + 1 - i).map(c => c.close)); if (b) ws.push(b.width); }
                    if (ws.length) bbWidth = bb.width / (ws.reduce((a, b) => a + b, 0) / ws.length);
                }
                const niftyD = getNiftyDist(cData[sIdx].date);
                const cBodyPos = (cData[sIdx].close - cData[sIdx].low) / (cData[sIdx].high - cData[sIdx].low + 0.0001) * 100;

                let score = 0;
                if (distH52 >= 2 && distH52 <= 10) score += 20; else if (distH52 < 2) score += 12;
                if (volRatio > 2.5) score += 20; else if (volRatio >= 1.5) score += 14; else score += 4;
                if (bbWidth < 0.9) score += 20; else if (bbWidth <= 1.1) score += 10;
                if (weGap < 5) score += 15; else if (weGap > 15) score += 10;
                if (niftyD < 0) score += 13; else if (niftyD <= 1.5) score += 6; else score += 4;
                if (cBodyPos < 60) score += 12; else if (cBodyPos > 80) score += 8; else score += 4;

                let tier = 'TIER_3'; if (score >= 70) tier = 'TIER_1'; else if (score >= 40) tier = 'TIER_2';
                scoreObj.tier = tier; scoreObj.score = score; scoreObj.pnl = (exitPrice - entryPrice) * Math.floor(1000 / (entryPrice - stopLoss));

                trades.push(scoreObj);
            }
        }
        analyzeTool('LT_UP A: Confluence Count', trades, t => t.confBucket, ['0-1 levels', '2-3 levels', '4+ levels']);
        analyzeTool('LT_UP B: MTF Alignment', trades, t => t.mtfBucket, ['All 3 aligned bullish', '2 of 3 aligned', '1 or 0 aligned']);
        analyzeTool('LT_UP C: Weekly Pat', trades, t => t.wkPat, ['Weekly Breakout Candle', 'Weekly Doji', 'Weekly Shooting Star', 'Other']);
        analyzeTool('LT_UP D: Gap Next Day', trades, t => t.gapBucket, ['Gap Up > 1%', 'No Gap (-1% to +1%)', 'Gap Down < -1%']);
        analyzeTool('LT_UP E: Fib Zones', trades, t => t.fibBucket, ['Price at 0.618 extension', 'Price at 1.0 extension', 'Price at 1.272 extension', 'Price at 1.618 extension', 'No Man Land']);

        // Quick Tier Re-validation with new BB squeeze param
        const tg = { TIER_1: { entered: 0, wins: 0 }, TIER_2: { entered: 0, wins: 0 }, TIER_3: { entered: 0, wins: 0 } };
        for (let t of trades) { tg[t.tier].entered++; if (t.win) tg[t.tier].wins++; }
        console.log(`[ LT_UP TIER RE-VALIDATION (incl. BB Squeeze) ]`);
        console.log(`  TIER_1: ${tg.TIER_1.entered} trades | ${tg.TIER_1.entered ? (tg.TIER_1.wins / tg.TIER_1.entered * 100).toFixed(1) : 0}%`);
        console.log(`  TIER_2: ${tg.TIER_2.entered} trades | ${tg.TIER_2.entered ? (tg.TIER_2.wins / tg.TIER_2.entered * 100).toFixed(1) : 0}%`);
        console.log(`  TIER_3: ${tg.TIER_3.entered} trades | ${tg.TIER_3.entered ? (tg.TIER_3.wins / tg.TIER_3.entered * 100).toFixed(1) : 0}%\n`);
    }

    // ==========================================
    // ST_SWING_UP
    // ==========================================
    async function analyzeSTSwingUp(dirDay, dir30, checkNifty, getNiftyDist) {
        console.log(`\n--- CATEGORY: ST_SWING_UP ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSigs = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, sDate: toISTDateString(s.addedDate) }])).values());

        const trades = [];
        for (const sig of uniqueSigs) {
            const ck = sig.iKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fk = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dPath = path.join(dirDay, `${ck}_master.json`);
            if (!fs.existsSync(dPath)) dPath = path.join(dirDay, `${fk}_master.json`);
            let mP = path.join(dir30, `${ck}_master.json`);
            if (!fs.existsSync(mP)) mP = path.join(dir30, `${fk}_master.json`);
            if (!fs.existsSync(dPath) || !fs.existsSync(mP)) continue;

            const cData = (JSON.parse(fs.readFileSync(dPath, 'utf8')).data || JSON.parse(fs.readFileSync(dPath, 'utf8'))).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0], open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.sDate);
            if (sIdx < 50 || sIdx + 10 >= cData.length) continue;
            const hist = cData.slice(0, sIdx + 1);
            const sma50 = calcSMA(hist.map(c => c.close), 50);
            const sma200 = calcSMA(hist.map(c => c.close), 200);
            if (!sma50 || !sma200 || hist[hist.length - 1].close < sma50 || sma50 < sma200) continue;

            const rsi = calcRSI(hist.map(c => c.close));
            if (!rsi || rsi < 60 || rsi > 70) continue;
            if (!checkNifty(sig.sDate, 0.98)) continue;

            const max30 = Math.max(...cData.slice(sIdx - 30, sIdx).map(c => c.high));

            let m30Data = [];
            try {
                const p30 = JSON.parse(fs.readFileSync(mP, 'utf8'));
                m30Data = (p30.data || p30).map(c => ({ date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16), close: parseFloat(c.close) })).sort((a, b) => a.date.localeCompare(b.date));
            } catch (e) { }

            const isConfirmed = checkTypeAConfirmation(m30Data, cData[sIdx + 1].date, max30);

            if (isConfirmed && sIdx + 2 < cData.length) {
                const entryIdx = sIdx + 2;
                const entryPrice = cData[entryIdx].open;

                let stopLoss = Infinity;
                for (let k = sIdx; k <= sIdx + 1; k++) if (cData[k].low < stopLoss) stopLoss = cData[k].low;
                let riskPct = (entryPrice - stopLoss) / entryPrice * 100;
                if (riskPct < 1.5) stopLoss = entryPrice * 0.985;
                if (riskPct > 3.5) stopLoss = entryPrice * 0.965;

                let exitPrice = 0; let statePhase = 1;
                for (let hold = 1; hold <= 10; hold++) {
                    const hIdx = entryIdx + hold;
                    if (hIdx >= cData.length) { exitPrice = cData[cData.length - 1].close; break; }
                    const tc = cData[hIdx];
                    if (statePhase === 1 && hold >= 4) { stopLoss = Math.max(stopLoss, entryPrice * 0.99); statePhase = 2; }
                    if (tc.open <= stopLoss) { exitPrice = tc.open; break; }
                    if (tc.low <= stopLoss) { exitPrice = stopLoss; break; }
                    if (hold === 10) { exitPrice = tc.close; break; }
                }
                const win = exitPrice > entryPrice;

                let confCount = 0;
                const sma20 = calcSMA(hist.map(c => c.close), 20);
                if (sma20 && isNear(entryPrice, sma20)) confCount++;
                if (sma50 && isNear(entryPrice, sma50)) confCount++;
                if (sma200 && isNear(entryPrice, sma200)) confCount++;
                if (isNear(entryPrice, max30)) confCount++;
                if (Math.abs((entryPrice % 100)) < entryPrice * 0.02 || Math.abs(100 - (entryPrice % 100)) < entryPrice * 0.02) confCount++;
                let confBucket = '0-1 levels'; if (confCount >= 4) confBucket = '4+ levels'; else if (confCount >= 2) confBucket = '2-3 levels';

                const wCloses = [];
                const wMap = new Map();
                for (const c of hist) wMap.set(getYearWeek(c.date), c.close);
                wMap.forEach(v => wCloses.push(v));
                const wSma10 = calcSMA(wCloses, 10);
                const isDailyBull = cData[sIdx].close > sma20;
                const isWeeklyBull = wSma10 ? wCloses[wCloses.length - 1] > wSma10 : false;
                let is1hBull = false;
                try {
                    const sig30Idx = m30Data.findIndex(c => c.date.startsWith(cData[sIdx].date));
                    if (sig30Idx > 50) {
                        const h1Ema20 = calcEMA(m30Data.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close), 20);
                        const h1Ema50 = calcEMA(m30Data.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close), 50);
                        if (h1Ema20 && h1Ema50) is1hBull = h1Ema20 > h1Ema50;
                    }
                } catch (e) { }
                let align = 0; if (isDailyBull) align++; if (isWeeklyBull) align++; if (is1hBull) align++;
                let mtfBucket = align === 3 ? 'All 3 aligned bullish' : align === 2 ? '2 of 3 aligned' : '1 or 0 aligned';

                const wMapHLC = new Map();
                for (const c of hist) {
                    const wk = getYearWeek(c.date);
                    if (!wMapHLC.has(wk)) wMapHLC.set(wk, []);
                    wMapHLC.get(wk).push(c);
                }
                const wkSigStr = getYearWeek(cData[sIdx].date);
                const wkCandlesData = wMapHLC.get(wkSigStr) || [];
                let wkPat = 'Other';
                if (wkCandlesData.length) {
                    const wO = wkCandlesData[0].open; const wC = wkCandlesData[wkCandlesData.length - 1].close;
                    const wH = Math.max(...wkCandlesData.map(v => v.high)); const wL = Math.min(...wkCandlesData.map(v => v.low));
                    const wRange = wH - wL + 0.0001;
                    if (wC > wH - wRange * 0.2) wkPat = 'Weekly Breakout Candle';
                    else if (Math.abs(wC - wO) < wRange * 0.1) wkPat = 'Weekly Doji';
                    else if (wH - Math.max(wO, wC) > wRange * 0.6 && Math.min(wO, wC) - wL < wRange * 0.2) wkPat = 'Weekly Shooting Star';
                }

                const gapPct = (cData[sIdx + 1].open / cData[sIdx].close - 1) * 100;
                let gapBucket = 'No Gap (-1% to +1%)';
                if (gapPct > 1) gapBucket = 'Gap Up > 1%'; else if (gapPct < -1) gapBucket = 'Gap Down < -1%';

                const priorLo = Math.min(...cData.slice(sIdx - 50, sIdx).map(c => c.low));
                let fibBucket = 'No Man Land';
                if (max30 > priorLo) {
                    const sw = max30 - priorLo;
                    if (isNear(entryPrice, max30)) fibBucket = 'Price at 1.0 extension';
                    else if (isNear(entryPrice, max30 + sw * 0.272)) fibBucket = 'Price at 1.272 extension';
                    else if (isNear(entryPrice, max30 + sw * 0.618)) fibBucket = 'Price at 1.618 extension';
                    else if (isNear(entryPrice, priorLo + sw * 0.618)) fibBucket = 'Price at 0.618 extension';
                }

                let scoreObj = { win, confBucket, mtfBucket, wkPat, gapBucket, fibBucket };

                // Track Confidence Validation Variables with new compressed weights
                const niftyD = getNiftyDist(cData[sIdx].date);
                const volRatio = cData[sIdx].volume / (cData.slice(sIdx - 20, sIdx).reduce((a, b) => a + b.volume, 0) / 20);
                const cBodyPos = (cData[sIdx].close - cData[sIdx].low) / (cData[sIdx].high - cData[sIdx].low + 0.0001) * 100;
                let h1MACD = false;
                try {
                    const sig30Idx = m30Data.findIndex(c => c.date.startsWith(cData[sIdx].date));
                    if (sig30Idx > 50) {
                        const m12 = calcEMA(m30Data.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close), 12);
                        const m26 = calcEMA(m30Data.slice(0, sig30Idx + 1).filter((_, i) => i % 2 === 0).map(c => c.close), 26);
                        if (m12 && m26) h1MACD = m12 > m26;
                    }
                } catch (e) { }

                const bb = calcBollingerBands(cData.slice(0, sIdx + 1).map(c => c.close));
                let bbWidth = 1;
                if (bb) {
                    const ws = []; for (let i = 0; i < 20; i++) { const b = calcBollingerBands(cData.slice(0, sIdx + 1 - i).map(c => c.close)); if (b) ws.push(b.width); }
                    if (ws.length) bbWidth = bb.width / (ws.reduce((a, b) => a + b, 0) / ws.length);
                }

                let score = 0;
                if (niftyD < 0) score += 12; else if (niftyD <= 1.5) score += 6; else score += 4;
                if (volRatio > 2.5) score += 22; else if (volRatio >= 1.5) score += 15; else score += 0;
                if (cBodyPos > 66) score += 22; else if (cBodyPos > 33) score += 10; else score += 0;
                if (h1MACD) score += 17; else score += 5;
                score += 12; // Flat 12 for ADX since ADX is rarely available or we proxy it
                // BB Squeeze (Max 15)
                if (bbWidth < 0.9) score += 15; else if (bbWidth <= 1.1) score += 8;

                let tier = 'TIER_3'; if (score >= 70) tier = 'TIER_1'; else if (score >= 40) tier = 'TIER_2';
                scoreObj.tier = tier; scoreObj.score = score;
                trades.push(scoreObj);
            }
        }
        analyzeTool('ST_UP A: Confluence Count', trades, t => t.confBucket, ['0-1 levels', '2-3 levels', '4+ levels']);
        analyzeTool('ST_UP B: MTF Alignment', trades, t => t.mtfBucket, ['All 3 aligned bullish', '2 of 3 aligned', '1 or 0 aligned']);
        analyzeTool('ST_UP C: Weekly Pat', trades, t => t.wkPat, ['Weekly Breakout Candle', 'Weekly Doji', 'Weekly Shooting Star', 'Other']);
        analyzeTool('ST_UP D: Gap Next Day', trades, t => t.gapBucket, ['Gap Up > 1%', 'No Gap (-1% to +1%)', 'Gap Down < -1%']);
        analyzeTool('ST_UP E: Fib Zones', trades, t => t.fibBucket, ['Price at 0.618 extension', 'Price at 1.0 extension', 'Price at 1.272 extension', 'Price at 1.618 extension', 'No Man Land']);

        // Quick Tier Re-validation with new BB squeeze param
        const tg = { TIER_1: { entered: 0, wins: 0 }, TIER_2: { entered: 0, wins: 0 }, TIER_3: { entered: 0, wins: 0 } };
        for (let t of trades) { tg[t.tier].entered++; if (t.win) tg[t.tier].wins++; }
        console.log(`[ ST_UP TIER RE-VALIDATION (incl. BB Squeeze) ]`);
        console.log(`  TIER_1: ${tg.TIER_1.entered} trades | ${tg.TIER_1.entered ? (tg.TIER_1.wins / tg.TIER_1.entered * 100).toFixed(1) : 0}%`);
        console.log(`  TIER_2: ${tg.TIER_2.entered} trades | ${tg.TIER_2.entered ? (tg.TIER_2.wins / tg.TIER_2.entered * 100).toFixed(1) : 0}%`);
        console.log(`  TIER_3: ${tg.TIER_3.entered} trades | ${tg.TIER_3.entered ? (tg.TIER_3.wins / tg.TIER_3.entered * 100).toFixed(1) : 0}%\n`);
    }

    function analyzeTool(name, trades, extractor, labels) {
        console.log(`[ ${name} ]`);
        labels.forEach(lb => {
            const sub = trades.filter(t => extractor(t) === lb);
            const w = sub.filter(t => t.win).length;
            const wr = sub.length ? (w / sub.length * 100).toFixed(1) : '0.0';
            console.log(`  ${String(lb).padEnd(25)}: ${String(sub.length).padStart(3)} trades | WR: ${wr}%`);
        });
        console.log('');
    }
}

main().catch(console.error);
