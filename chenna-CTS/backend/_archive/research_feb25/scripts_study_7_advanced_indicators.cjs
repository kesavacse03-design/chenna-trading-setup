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

function getYearWeek(dateStr) {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${weekNo}`;
}

// === ADVANCED INDICATORS ===
function calcBollingerBands(closes, period = 20, multiplier = 2) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
        upper: middle + multiplier * stdDev,
        middle: middle,
        lower: middle - multiplier * stdDev,
        width: (2 * multiplier * stdDev) / middle
    };
}

function calcStochastic(data, period = 14, smoothK = 3, smoothD = 3) {
    // data should contain high, low, close
    if (data.length < period + smoothK + smoothD - 2) return null;
    const fastK = [];
    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const highest = Math.max(...slice.map(c => c.high));
        const lowest = Math.min(...slice.map(c => c.low));
        let k = 50;
        if (highest !== lowest) {
            k = ((data[i].close - lowest) / (highest - lowest)) * 100;
        }
        fastK.push(k);
    }
    const smoothKArr = [];
    for (let i = smoothK - 1; i < fastK.length; i++) {
        smoothKArr.push(fastK.slice(i - smoothK + 1, i + 1).reduce((a, b) => a + b, 0) / smoothK);
    }
    if (smoothKArr.length < smoothD) return null;
    const smoothDVal = smoothKArr.slice(-smoothD).reduce((a, b) => a + b, 0) / smoothD;
    return { k: smoothKArr[smoothKArr.length - 1], d: smoothDVal };
}

function calcWilliamsR(data, period = 14) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    const highest = Math.max(...slice.map(c => c.high));
    const lowest = Math.min(...slice.map(c => c.low));
    const currentClose = slice[slice.length - 1].close;
    if (highest === lowest) return -50;
    return ((highest - currentClose) / (highest - lowest)) * -100;
}

function calcOBV(data) {
    if (!data.length) return null;
    const obv = [0];
    for (let i = 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        const vol = data[i].volume;
        if (change > 0) obv.push(obv[i - 1] + vol);
        else if (change < 0) obv.push(obv[i - 1] - vol);
        else obv.push(obv[i - 1]);
    }
    return obv;
}

function calcIchimoku(data, t = 9, k = 26, s = 52) {
    if (data.length < Math.max(t, k, s) + 26) return null;
    const calcHL = (slice) => (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
    // Current values
    const tenkan = calcHL(data.slice(-t));
    const kijun = calcHL(data.slice(-k));
    // For cloud 26 periods ago
    const pastData = data.slice(0, data.length - 26);
    const pastTenkan = calcHL(pastData.slice(-t));
    const pastKijun = calcHL(pastData.slice(-k));
    const senkouA = (pastTenkan + pastKijun) / 2;
    const senkouB = calcHL(pastData.slice(-s));
    return { tenkan, kijun, senkouA, senkouB };
}

function calcKeltner(data, period = 20, multiplier = 1.5) {
    if (data.length < period + 1) return null;
    const ema = calcEMA(data.map(c => c.close), period);
    const atr = calcATR(data, period);
    if (!ema || !atr) return null;
    return {
        upper: ema + multiplier * atr,
        middle: ema,
        lower: ema - multiplier * atr
    };
}

async function main() {
    console.log(`\n======================================================`);
    console.log(`STUDY 7: ADVANCED TECHNICAL INDICATOR VALIDATION`);
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
    const checkNiftyDown = (date) => {
        let nIdx = niftyData.findIndex(c => c.date === date);
        if (nIdx === -1) for (let i = niftyData.length - 1; i >= 0; i--) { if (niftyData[i].date <= date) { nIdx = i; break; } }
        if (nIdx < 20) return false;
        const closes = niftyData.slice(0, nIdx + 1).map(c => c.close);
        return closes[closes.length - 1] > (calcEMA(closes, 20) * 0.96);
    };
    const checkNiftyUp = (date) => {
        let nIdx = niftyData.findIndex(c => c.date === date);
        if (nIdx === -1) for (let i = niftyData.length - 1; i >= 0; i--) { if (niftyData[i].date <= date) { nIdx = i; break; } }
        if (nIdx < 20) return false;
        const closes = niftyData.slice(0, nIdx + 1).map(c => c.close);
        return closes[closes.length - 1] > (calcEMA(closes, 20) * 0.98);
    };

    await extractSTSwingDown(cacheDirDay);
    await extractLTSwingUp(cacheDirDay, cacheDir30m);
    await extractSTSwingUp(cacheDirDay, cacheDir30m);
    await prisma.$disconnect();

    // -----------------------------------------------------------------------------------------
    async function extractSTSwingDown(dir) {
        console.log(`\n--- ADVANCED STUDY: ST_SWING_DOWN ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSignals = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, signalDateStr: toISTDateString(s.addedDate) }])).values());

        const trades = [];
        for (const sig of uniqueSignals) {
            const ck = sig.iKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fk = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dayPath = path.join(dir, `${ck}_master.json`);
            if (!fs.existsSync(dayPath)) dayPath = path.join(dir, `${fk}_master.json`);
            if (!fs.existsSync(dayPath)) continue;

            const cData = (JSON.parse(fs.readFileSync(dayPath, 'utf8')).data || JSON.parse(fs.readFileSync(dayPath, 'utf8'))).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0], open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.signalDateStr);
            if (sIdx < 30 || sIdx + 5 >= cData.length) continue;
            if (!calcRSI(cData.slice(0, sIdx + 1).map(c => c.close)) || calcRSI(cData.slice(0, sIdx + 1).map(c => c.close)) >= 40) continue;
            if (!checkNiftyDown(sig.signalDateStr)) continue;

            let entryIdx = -1; let stateA = 0; let low1 = Infinity, low2Candle = null, runningLow = Infinity, dbConfirmed = false;
            let wasBelowBB = false;
            let obvSignals = [];

            for (let d = 1; d <= 15; d++) {
                const cIdx = sIdx + d;
                if (cIdx >= cData.length) break;
                const tc = cData[cIdx];
                const hist = cData.slice(0, cIdx + 1);

                const bb = calcBollingerBands(hist.map(c => c.close));
                if (bb && tc.close < bb.lower) wasBelowBB = true;

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
                    const sma10 = calcSMA(hist.map(c => c.close), 10);
                    if (sma10 && tc.close > sma10) { entryIdx = cIdx + 1; break; }
                }
            }

            if (entryIdx !== -1 && entryIdx < cData.length) {
                const entryPrice = cData[entryIdx].open;
                const atr14 = calcATR(cData.slice(0, entryIdx), 14);
                if (atr14) {
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
                    const win = (exitPrice > entryPrice);

                    const hist = cData.slice(0, entryIdx);
                    // BB
                    const bb = calcBollingerBands(hist.map(c => c.close));
                    let bbPos = null;
                    if (bb) {
                        const c = hist[hist.length - 1].close;
                        bbPos = c < bb.lower ? 'Below Lower' : c < bb.middle ? 'Lower-Middle' : 'Above Middle';
                    }
                    // Stoch
                    const stoch = calcStochastic(hist);
                    let stochStat = null;
                    if (stoch) {
                        if (stoch.k > stoch.d && stoch.k < 20 && stoch.d < 20) stochStat = 'YES_OVERSOLD';
                        else if (stoch.k > stoch.d) stochStat = 'YES_NORMAL';
                        else stochStat = 'NO_BEARISH';
                    }
                    // WillR
                    const willR = calcWilliamsR(hist);
                    let wStat = null;
                    if (willR !== null) {
                        if (willR < -80) wStat = 'Below -80';
                        else if (willR < -50) wStat = '-80 to -50 (Thrust)';
                        else wStat = 'Above -50';
                    }
                    // OBV
                    const fullObv = calcOBV(cData.slice(sIdx - 20, entryIdx));
                    let obvDiv = 'NO';
                    if (fullObv) {
                        const o1 = fullObv[fullObv.length - (entryIdx - sIdx + (entryIdx - low2Candle.date))];
                        // naive divergence tracking
                        if (low2Candle.low <= low1 && fullObv[fullObv.length - 2] > fullObv[5]) obvDiv = 'YES';
                    }

                    trades.push({ win, bbPos, wasBelowBB, stochStat, wStat, obvDiv });
                }
            }
        }

        analyzeTool('ST_SWING_DOWN Tool 1: Bollinger Band Pos at Entry', trades, t => t.bbPos, ['Below Lower', 'Lower-Middle', 'Above Middle']);
        analyzeTool('ST_SWING_DOWN Tool 1b: Was below BB recently and reclaimed?', trades, t => t.wasBelowBB, [true, false]);
        analyzeTool('ST_SWING_DOWN Tool 2: Stochastic (14,3,3)', trades, t => t.stochStat, ['YES_OVERSOLD', 'YES_NORMAL', 'NO_BEARISH']);
        analyzeTool('ST_SWING_DOWN Tool 3: Williams %R (14)', trades, t => t.wStat, ['Below -80', '-80 to -50 (Thrust)', 'Above -50']);
        analyzeTool('ST_SWING_DOWN Tool 4: OBV Divergence Guess', trades, t => t.obvDiv, ['YES', 'NO']);
    }

    // -----------------------------------------------------------------------------------------
    async function extractLTSwingUp(dirDay, dir30) {
        console.log(`\n--- ADVANCED STUDY: LT_SWING_UP ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_UP' } });
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
            if (!checkNiftyUp(sig.sDate)) continue;

            const wCloses = [];
            const wMap = new Map();
            for (const c of hist) wMap.set(getYearWeek(c.date), c.close);
            wMap.forEach(v => wCloses.push(v));
            if (wCloses.length < 30) continue;
            if (calcEMA(wCloses, 10) <= calcEMA(wCloses, 30)) continue;

            const max50 = Math.max(...cData.slice(sIdx - 50, sIdx).map(c => c.high)); // or close, let's use close since we did previously, wait earlier script used C
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

                // Advanced Indicators
                const histE = cData.slice(0, entryIdx);
                const ichi = calcIchimoku(histE);
                let cloudPos = null, tkCross = null;
                if (ichi) {
                    const c = histE[histE.length - 1].close;
                    cloudPos = (c > ichi.senkouA && c > ichi.senkouB) ? 'ABOVE CLOUD' : (c < ichi.senkouA && c < ichi.senkouB) ? 'BELOW CLOUD' : 'INSIDE CLOUD';
                    tkCross = ichi.tenkan > ichi.kijun ? 'YES' : 'NO';
                }

                // BB Squeeze Width prior to breakout
                const histBO = cData.slice(0, sIdx + 1);
                const bb = calcBollingerBands(histBO.map(c => c.close));
                let bbWidth = null;
                if (bb) {
                    const ws = [];
                    for (let i = 0; i < 20; i++) {
                        const b = calcBollingerBands(histBO.slice(0, histBO.length - i).map(c => c.close));
                        if (b) ws.push(b.width);
                    }
                    if (ws.length) {
                        const avgW = ws.reduce((a, b) => a + b, 0) / ws.length;
                        bbWidth = bb.width < avgW * 0.9 ? 'NARROW (Squeeze)' : bb.width > avgW * 1.1 ? 'WIDE' : 'NORMAL';
                    }
                }

                const obv = calcOBV(histBO);
                let obvConf = null;
                if (obv) {
                    const v = obv[obv.length - 1];
                    const avgO = obv.slice(-20).reduce((a, b) => a + b, 0) / 20;
                    obvConf = v > avgO ? 'YES' : 'NO';
                }

                const kl = calcKeltner(histBO);
                let klBreak = null;
                if (kl) {
                    klBreak = histBO[histBO.length - 1].close > kl.upper ? 'YES' : 'NO';
                }

                trades.push({ win: exitPrice > entryPrice, cloudPos, tkCross, bbWidth, obvConf, klBreak });
            }
        }
        analyzeTool('LT_SWING_UP Tool 1: Ichimoku Cloud Pos', trades, t => t.cloudPos, ['ABOVE CLOUD', 'INSIDE CLOUD', 'BELOW CLOUD']);
        analyzeTool('LT_SWING_UP Tool 1b: Tenkan > Kijun', trades, t => t.tkCross, ['YES', 'NO']);
        analyzeTool('LT_SWING_UP Tool 2: BB Squeeze Pre-BO', trades, t => t.bbWidth, ['NARROW (Squeeze)', 'NORMAL', 'WIDE']);
        analyzeTool('LT_SWING_UP Tool 3: OBV (>20d Avg)', trades, t => t.obvConf, ['YES', 'NO']);
        analyzeTool('LT_SWING_UP Tool 4: Keltner Upper Break', trades, t => t.klBreak, ['YES', 'NO']);
    }

    // -----------------------------------------------------------------------------------------
    async function extractSTSwingUp(dirDay, dir30) {
        console.log(`\n--- ADVANCED STUDY: ST_SWING_UP ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
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
            if (!checkNiftyUp(sig.sDate)) continue;

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

                // V5 stop structure for ST UP
                let stopLoss = Infinity;
                for (let k = sIdx; k <= sIdx + 1; k++) if (cData[k].low < stopLoss) stopLoss = cData[k].low;
                let riskPct = (entryPrice - stopLoss) / entryPrice * 100;
                if (riskPct < 1.5) stopLoss = entryPrice * 0.985;
                if (riskPct > 3.5) stopLoss = entryPrice * 0.965;

                let exitPrice = 0;
                let statePhase = 1;
                for (let hold = 1; hold <= 10; hold++) {
                    const hIdx = entryIdx + hold;
                    if (hIdx >= cData.length) { exitPrice = cData[cData.length - 1].close; break; }
                    const tc = cData[hIdx];
                    if (statePhase === 1 && hold >= 4) { stopLoss = Math.max(stopLoss, entryPrice * 0.99); statePhase = 2; }
                    if (tc.open <= stopLoss) { exitPrice = tc.open; break; }
                    if (tc.low <= stopLoss) { exitPrice = stopLoss; break; }
                    if (hold === 10) { exitPrice = tc.close; break; }
                }

                const histBO = cData.slice(0, sIdx + 1);

                const bb = calcBollingerBands(histBO.map(c => c.close));
                let bbWidth = null;
                if (bb) {
                    const ws = [];
                    for (let i = 0; i < 20; i++) {
                        const b = calcBollingerBands(histBO.slice(0, histBO.length - i).map(c => c.close));
                        if (b) ws.push(b.width);
                    }
                    if (ws.length) {
                        const avgW = ws.reduce((a, b) => a + b, 0) / ws.length;
                        bbWidth = bb.width < avgW * 0.9 ? 'NARROW (Squeeze)' : bb.width > avgW * 1.1 ? 'WIDE' : 'NORMAL';
                    }
                }

                const obv = calcOBV(histBO);
                let obvConf = null;
                if (obv) {
                    const v = obv[obv.length - 1];
                    const avgO = obv.slice(-20).reduce((a, b) => a + b, 0) / 20;
                    obvConf = v > avgO ? 'YES' : 'NO';
                }

                const kl = calcKeltner(histBO);
                let klBreak = null;
                if (kl) {
                    klBreak = histBO[histBO.length - 1].close > kl.upper ? 'YES' : 'NO';
                }

                const priorSwingLow = Math.min(...cData.slice(sIdx - 30, sIdx).map(c => c.low));
                const swingR = max30 - priorSwingLow;
                const boL = histBO[histBO.length - 1].close;
                const pct1 = Math.abs(boL - (priorSwingLow + swingR));
                const pct12 = Math.abs(boL - (priorSwingLow + swingR * 1.272));
                const pct16 = Math.abs(boL - (priorSwingLow + swingR * 1.618));
                let fibPos = 'UNKNOWN';
                if (swingR > 0) {
                    const th = swingR * 0.1;
                    if (pct1 < th) fibPos = 'Near 1.0 (Double Top)';
                    else if (pct12 < th) fibPos = 'Near 1.272 Ext';
                    else if (pct16 < th) fibPos = 'Near 1.618 Ext';
                    else fibPos = 'No Man Land';
                }

                trades.push({ win: exitPrice > entryPrice, bbWidth, obvConf, klBreak, fibPos });
            }
        }
        analyzeTool('ST_SWING_UP Tool 1: BB Squeeze Pre-BO', trades, t => t.bbWidth, ['NARROW (Squeeze)', 'NORMAL', 'WIDE']);
        analyzeTool('ST_SWING_UP Tool 2: OBV (>20d Avg)', trades, t => t.obvConf, ['YES', 'NO']);
        analyzeTool('ST_SWING_UP Tool 3: Keltner Upper Break', trades, t => t.klBreak, ['YES', 'NO']);
        analyzeTool('ST_SWING_UP Tool 4: Fibonacci Zones', trades, t => t.fibPos, ['Near 1.0 (Double Top)', 'Near 1.272 Ext', 'Near 1.618 Ext', 'No Man Land']);
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
