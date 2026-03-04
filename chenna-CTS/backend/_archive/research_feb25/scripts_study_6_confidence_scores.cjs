const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(closes.length - period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
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

function getYearWeek(dateStr) {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${weekNo}`;
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
    console.log(`STUDY 6: CONFIDENCE SCORES FACTOR ANALYSIS`);

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

    const getNiftyDist = (dateStr) => {
        if (!niftyData.length) return 0;
        let nIdx = niftyData.findIndex(c => c.date === dateStr);
        if (nIdx === -1) {
            for (let i = niftyData.length - 1; i >= 0; i--) {
                if (niftyData[i].date <= dateStr) { nIdx = i; break; }
            }
        }
        if (nIdx < 20) return 0;
        const closes = niftyData.slice(0, nIdx + 1).map(c => c.close);
        const sma20 = calcEMA(closes, 20);
        const close = closes[closes.length - 1];
        return ((close - sma20) / sma20) * 100;
    };

    const checkNifty = (signalDateStr, thresholdMulti = 0.98) => {
        if (!niftyData.length) return false;
        let nIdx = niftyData.findIndex(c => c.date === signalDateStr);
        if (nIdx === -1) {
            for (let i = niftyData.length - 1; i >= 0; i--) {
                if (niftyData[i].date <= signalDateStr) { nIdx = i; break; }
            }
        }
        if (nIdx < 20) return false;
        const closes = niftyData.slice(0, nIdx + 1).map(c => c.close);
        const sma20 = calcEMA(closes, 20);
        const close = closes[closes.length - 1];
        return close > (sma20 * thresholdMulti);
    };

    await extractSTSwingDownFactors();
    await extractLTSwingUpFactors();

    await prisma.$disconnect();


    async function extractSTSwingDownFactors() {
        console.log(`\n--- STRATEGY: SHORT_TERM_SWING_BO_DOWN ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSignals = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, signalDateStr: toISTDateString(s.addedDate) }])).values());

        const trades = [];

        for (const sig of uniqueSignals) {
            const ck = sig.iKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fk = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dayPath = path.join(cacheDirDay, `${ck}_master.json`);
            if (!fs.existsSync(dayPath)) dayPath = path.join(cacheDirDay, `${fk}_master.json`);
            if (!fs.existsSync(dayPath)) continue;

            const cData = (JSON.parse(fs.readFileSync(dayPath, 'utf8')).data || JSON.parse(fs.readFileSync(dayPath, 'utf8'))).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.signalDateStr);
            if (sIdx < 20 || sIdx + 5 >= cData.length) continue;

            if (!calcRSI(cData.slice(0, sIdx + 1).map(c => c.close), 14) || calcRSI(cData.slice(0, sIdx + 1).map(c => c.close), 14) >= 40) continue;
            if (!checkNifty(sig.signalDateStr, 0.96)) continue;

            let entryIdx = -1;
            let stateA = 0;
            let low1 = Infinity, low2Candle = null;
            let runningLow = Infinity;
            let dbConfirmed = false;
            let lowestRSI = 100;

            for (let d = 1; d <= 15; d++) {
                const cIdx = sIdx + d;
                if (cIdx >= cData.length) break;
                const tc = cData[cIdx];
                const crsi = calcRSI(cData.slice(0, cIdx + 1).map(c => c.close), 14);
                if (crsi && crsi < lowestRSI) lowestRSI = crsi;

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
                    if (sma10 && tc.close > sma10) {
                        entryIdx = cIdx + 1; break;
                    }
                }
            }

            if (entryIdx !== -1 && entryIdx < cData.length) {
                const entryPrice = cData[entryIdx].open;
                const atr14 = calcATR(cData.slice(0, entryIdx), 14);
                if (atr14) {
                    const stopLoss = entryPrice - (2.0 * atr14);
                    const qty = Math.floor(1000 / (entryPrice - stopLoss));
                    if (qty > 0) {
                        let exitPrice = 0;
                        for (let hold = 1; hold <= 5; hold++) {
                            const hIdx = entryIdx + hold;
                            if (hIdx >= cData.length) { exitPrice = cData[cData.length - 1].close; break; }
                            const tc = cData[hIdx];
                            if (tc.open <= stopLoss) { exitPrice = tc.open; break; }
                            if (tc.low <= stopLoss) { exitPrice = stopLoss; break; }
                            if (hold === 5) { exitPrice = tc.close; break; }
                        }
                        const pnl = (exitPrice - entryPrice) * qty;

                        // Calculate Factors
                        const daysToEntry = entryIdx - sIdx;
                        const dbDiffPct = Math.abs(low1 - low2Candle.low) / low1 * 100;

                        const avgVol20 = cData.slice(sIdx - 20, sIdx).reduce((a, b) => a + b.volume, 0) / 20;
                        const avgVolStructure = cData.slice(sIdx, entryIdx).reduce((a, b) => a + b.volume, 0) / (entryIdx - sIdx);
                        const volRatio = avgVolStructure / avgVol20;

                        const niftyDist = getNiftyDist(cData[entryIdx].date);

                        trades.push({
                            win: pnl > 0,
                            rsiDepth: lowestRSI,
                            dbDiffPct,
                            daysToEntry,
                            volRatio,
                            niftyDist
                        });
                    }
                }
            }
        }

        console.log(`Analyzing ${trades.length} clean trades for ST_SWING_DOWN...\n`);

        const analyzeFactor = (name, extractor, buckets) => {
            console.log(`[ ${name} ]`);
            for (const b of buckets) {
                const sub = trades.filter(t => b.cond(extractor(t)));
                const w = sub.filter(t => t.win).length;
                const wr = sub.length ? (w / sub.length * 100).toFixed(1) : '0.0';
                console.log(`  ${b.label.padEnd(20)}: ${String(sub.length).padStart(3)} trades | WR: ${wr}%`);
            }
            console.log('');
        };

        analyzeFactor('1. Lowest RSI Depth', t => t.rsiDepth, [
            { label: 'Deep (< 20)', cond: v => v < 20 },
            { label: 'Medium (20-30)', cond: v => v >= 20 && v <= 30 },
            { label: 'Shallow (> 30)', cond: v => v > 30 }
        ]);

        analyzeFactor('2. Volume Exhaustion (Form vs Prior)', t => t.volRatio, [
            { label: 'High Vol (> 1.5x)', cond: v => v > 1.5 },
            { label: 'Med Vol (1.0-1.5x)', cond: v => v >= 1.0 && v <= 1.5 },
            { label: 'Low Vol (< 1.0x)', cond: v => v < 1.0 }
        ]);

        analyzeFactor('3. DB Tightness Diff %', t => t.dbDiffPct, [
            { label: 'Tight (< 0.5%)', cond: v => v < 0.5 },
            { label: 'Med (0.5-1.5%)', cond: v => v >= 0.5 && v <= 1.5 },
            { label: 'Loose (> 1.5%)', cond: v => v > 1.5 }
        ]);

        analyzeFactor('4. Days to Form Setup', t => t.daysToEntry, [
            { label: 'Fast (<= 6 days)', cond: v => v <= 6 },
            { label: 'Medium (7-10 days)', cond: v => v > 6 && v <= 10 },
            { label: 'Slow (> 10 days)', cond: v => v > 10 }
        ]);

        analyzeFactor('5. NIFTY Context (Dist to 20EMA)', t => t.niftyDist, [
            { label: 'Strong Uptrend (> 1%)', cond: v => v > 1 },
            { label: 'Flat/Mild (-1% to 1%)', cond: v => v >= -1 && v <= 1 },
            { label: 'Downtrend (< -1%)', cond: v => v < -1 }
        ]);
    }

    // -------------------------------------------------------
    async function extractLTSwingUpFactors() {
        console.log(`\n--- STRATEGY: LONG_TERM_SWING_BO_UP ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_UP' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSigs = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, sDate: toISTDateString(s.addedDate) }])).values());

        const trades = [];

        for (const sig of uniqueSigs) {
            const ck = sig.iKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fk = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dPath = path.join(cacheDirDay, `${ck}_master.json`);
            if (!fs.existsSync(dPath)) dPath = path.join(cacheDirDay, `${fk}_master.json`);
            let mP = path.join(cacheDir30m, `${ck}_master.json`);
            if (!fs.existsSync(mP)) mP = path.join(cacheDir30m, `${fk}_master.json`);
            if (!fs.existsSync(dPath) || !fs.existsSync(mP)) continue;

            const cData = (JSON.parse(fs.readFileSync(dPath, 'utf8')).data || JSON.parse(fs.readFileSync(dPath, 'utf8'))).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.sDate);
            if (sIdx < 50 || sIdx + 13 >= cData.length) continue;

            const hist = cData.slice(0, sIdx + 1);
            const rsi = calcRSI(hist.map(c => c.close), 14);
            if (!rsi || rsi < 60 || rsi > 70) continue;

            if (!checkNifty(sig.sDate, 0.98)) continue;

            const wMap = new Map();
            for (const c of hist) wMap.set(getYearWeek(c.date), c.close);
            const wCloses = Array.from(wMap.values());
            if (wCloses.length < 30) continue;
            const we10 = calcEMA(wCloses, 10);
            const we30 = calcEMA(wCloses, 30);
            if (we10 <= we30) continue;

            const max50 = Math.max(...cData.slice(sIdx - 50, sIdx).map(c => c.close));

            let m30Data = [];
            try {
                const p30 = JSON.parse(fs.readFileSync(mP, 'utf8'));
                m30Data = (p30.data || p30).map(c => ({
                    date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16),
                    close: parseFloat(c.close)
                })).sort((a, b) => a.date.localeCompare(b.date));
            } catch (e) { }

            const day1Date = cData[sIdx + 1].date;
            // For analytical frequency, we can use the confirm gap to catch properties
            const isConfirmed = checkTypeAConfirmation(m30Data, day1Date, max50);

            if (isConfirmed && sIdx + 2 < cData.length) {
                const actualEntryIdx = sIdx + 2;
                const entryPrice = cData[actualEntryIdx].open;
                const atr14 = calcATR(cData.slice(0, actualEntryIdx), 14);

                const stopLoss = entryPrice - (3.0 * atr14); // 3x ATR
                const qty = Math.floor(1000 / (entryPrice - stopLoss));
                if (qty <= 0) continue;

                let exitPrice = 0;
                for (let hold = 1; hold <= 13; hold++) {
                    const hIdx = actualEntryIdx + hold;
                    if (hIdx >= cData.length) { exitPrice = cData[cData.length - 1].close; break; }
                    const tc = cData[hIdx];
                    if (tc.open <= stopLoss) { exitPrice = tc.open; break; }
                    if (tc.low <= stopLoss) { exitPrice = stopLoss; break; }
                    if (hold === 13) { exitPrice = tc.close; break; }
                }

                const pnl = (exitPrice - entryPrice) * qty;

                // Factors
                const sigCandle = cData[sIdx];
                const cBodyPos = (sigCandle.close - sigCandle.low) / (sigCandle.high - sigCandle.low + 0.0001) * 100;

                const avgVol20 = cData.slice(sIdx - 20, sIdx).reduce((a, b) => a + b.volume, 0) / 20;
                const volRatio = sigCandle.volume / avgVol20;

                const wGapPct = ((we10 - we30) / we30) * 100;

                // Distance from 52wk High
                const start52 = Math.max(0, sIdx - 250);
                const h52 = Math.max(...cData.slice(start52, sIdx).map(c => c.high));
                const distH52 = h52 > 0 ? ((h52 - sigCandle.close) / h52) * 100 : 0;

                const niftyDist = getNiftyDist(sigCandle.date);

                trades.push({
                    win: pnl > 0,
                    niftyDist,
                    volRatio,
                    candlePos: cBodyPos,
                    weGap: wGapPct,
                    distH52
                });
            }
        }

        console.log(`Analyzing ${trades.length} clean trades for LT_SWING_UP...\n`);

        const analyzeFactor = (name, extractor, buckets) => {
            console.log(`[ ${name} ]`);
            for (const b of buckets) {
                const sub = trades.filter(t => b.cond(extractor(t)));
                const w = sub.filter(t => t.win).length;
                const wr = sub.length ? (w / sub.length * 100).toFixed(1) : '0.0';
                console.log(`  ${b.label.padEnd(20)}: ${String(sub.length).padStart(3)} trades | WR: ${wr}%`);
            }
            console.log('');
        };

        analyzeFactor('1. NIFTY Context (Dist to 20EMA)', t => t.niftyDist, [
            { label: 'Hot (> 1.5%)', cond: v => v > 1.5 },
            { label: 'Warm (0 to 1.5%)', cond: v => v >= 0 && v <= 1.5 },
            { label: 'Cool (< 0%)', cond: v => v < 0 }
        ]);

        analyzeFactor('2. Signal Vol Ratio', t => t.volRatio, [
            { label: 'Massive (> 2.5x)', cond: v => v > 2.5 },
            { label: 'Strong (1.5-2.5x)', cond: v => v >= 1.5 && v <= 2.5 },
            { label: 'Weak (< 1.5x)', cond: v => v < 1.5 }
        ]);

        analyzeFactor('3. Candle Close Position', t => t.candlePos, [
            { label: 'High Close (> 80%)', cond: v => v > 80 },
            { label: 'Med Close (60-80%)', cond: v => v >= 60 && v <= 80 },
            { label: 'Low Close (< 60%)', cond: v => v < 60 }
        ]);

        analyzeFactor('4. Weekly Trend Gap (EMA10-30)', t => t.weGap, [
            { label: 'Wide Gap (> 15%)', cond: v => v > 15 },
            { label: 'Med Gap (5-15%)', cond: v => v >= 5 && v <= 15 },
            { label: 'Narrow Gap (< 5%)', cond: v => v < 5 }
        ]);

        analyzeFactor('5. Distance from 52wk High', t => t.distH52, [
            { label: 'ATH BO (< 2%)', cond: v => v < 2 },
            { label: 'Near ATH (2-10%)', cond: v => v >= 2 && v <= 10 },
            { label: 'Deep Base (> 10%)', cond: v => v > 10 }
        ]);
    }
}

main().catch(console.error);
