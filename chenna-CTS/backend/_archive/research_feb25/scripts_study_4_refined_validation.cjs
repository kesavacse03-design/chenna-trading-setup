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

// 1H confirmation
function checkTypeAConfirmation(m30Data, targetDateStr, breakoutLevel) {
    const dayData = m30Data.filter(c => c.date.startsWith(targetDateStr));
    let hasConfirmation = false;
    for (let i = 0; i < dayData.length; i += 2) {
        const c1 = dayData[i];
        const c2 = dayData[i + 1];
        const h1Close = c2 ? c2.close : c1.close;
        const hTime = c2 ? c2.date : c1.date;
        if (hTime.includes(' 10:') || hTime.includes(' 11:') || hTime.includes(' 12:') || hTime.includes(' 13:') || hTime.includes(' 14:') || hTime.includes(' 15:')) {
            if (h1Close > breakoutLevel) {
                hasConfirmation = true; break;
            }
        }
    }
    return hasConfirmation;
}


async function main() {
    console.log(`\n======================================================`);
    console.log(`STUDY 4: REFINED STRUCTURAL VALIDATION SIMULATION`);

    // NIFTY caching
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

    await simSTSwingDown();
    await simLTSwingUp();
    await simLTSwingDown();

    await prisma.$disconnect();

    async function simSTSwingDown() {
        console.log(`\n--- STRATEGY: SHORT_TERM_SWING_BO_DOWN (Structural Entries) ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSignals = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, signalDateStr: toISTDateString(s.addedDate) }])).values());

        let resA = { entered: 0, wins: 0, pnl: 0 };
        let resB = { entered: 0, wins: 0, pnl: 0 };
        let resC = { entered: 0, wins: 0, pnl: 0 };

        for (const sig of uniqueSignals) {
            const ck = sig.iKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fk = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dayPath = path.join(cacheDirDay, `${ck}_master.json`);
            if (!fs.existsSync(dayPath)) dayPath = path.join(cacheDirDay, `${fk}_master.json`);
            if (!fs.existsSync(dayPath)) continue;

            const cData = (JSON.parse(fs.readFileSync(dayPath, 'utf8')).data || JSON.parse(fs.readFileSync(dayPath, 'utf8'))).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.signalDateStr);
            if (sIdx < 20 || sIdx + 5 >= cData.length) continue;

            const hist = cData.slice(0, sIdx + 1);
            const rsiDay0 = calcRSI(hist.map(c => c.close), 14);
            if (!rsiDay0 || rsiDay0 >= 40) continue;
            if (!checkNifty(sig.signalDateStr, 0.96)) continue;

            // Evaluator function
            const runOption = (entryIdx) => {
                if (entryIdx === -1 || entryIdx >= cData.length) return null;
                const entryPrice = cData[entryIdx].open;
                const atr14 = calcATR(cData.slice(0, entryIdx), 14);
                if (!atr14) return null;
                const stopLoss = entryPrice - (2.0 * atr14);
                const qty = Math.floor(1000 / (entryPrice - stopLoss));
                if (qty <= 0) return null;

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
                return pnl;
            };

            // OPTION A: DOUBLE BOTTOM
            let entryIdxA = -1;
            let stateA = 0;
            let low1 = Infinity, low2Candle = null;
            let runningLow = Infinity;

            for (let d = 1; d <= 15; d++) {
                const cIdx = sIdx + d;
                if (cIdx >= cData.length) break;
                const tc = cData[cIdx];

                if (stateA === 0) {
                    if (tc.low < runningLow) runningLow = tc.low;
                    if (tc.high >= runningLow * 1.02) {
                        low1 = runningLow;
                        stateA = 1;
                    }
                } else if (stateA === 1) {
                    if (tc.low < low1 * 0.99) { stateA = 0; runningLow = tc.low; continue; } // broken
                    if (tc.low <= low1 * 1.02) {
                        low2Candle = tc;
                        stateA = 2;
                    }
                } else if (stateA === 2) {
                    if (tc.low < low1 * 0.99) { stateA = 0; runningLow = tc.low; continue; } // broken
                    if (tc.close > low2Candle.high) {
                        entryIdxA = cIdx + 1; break;
                    }
                }
            }

            if (entryIdxA !== -1) {
                const p = runOption(entryIdxA);
                if (p !== null) { resA.entered++; resA.pnl += p; if (p > 0) resA.wins++; }
            }

            // OPTION B: SMA10 RECLAIM
            let entryIdxB = -1;
            let rsiTouched30 = false;
            for (let d = 1; d <= 15; d++) {
                const cIdx = sIdx + d;
                if (cIdx >= cData.length) break;

                const currCloses = cData.slice(0, cIdx + 1).map(c => c.close);
                const rsi = calcRSI(currCloses, 14);
                if (rsi < 30) rsiTouched30 = true;

                const sma10 = calcSMA(currCloses, 10);
                if (rsiTouched30 && sma10 && cData[cIdx].close > sma10) {
                    entryIdxB = cIdx + 1; break;
                }
            }
            if (entryIdxB !== -1) {
                const p = runOption(entryIdxB);
                if (p !== null) { resB.entered++; resB.pnl += p; if (p > 0) resB.wins++; }
            }

            // OPTION C: 2 GREEN CANDLES
            let entryIdxC = -1;
            let rsiTouched35 = false;
            for (let d = 1; d <= 15; d++) {
                const cIdx = sIdx + d;
                if (cIdx >= cData.length) break;

                const currCloses = cData.slice(0, cIdx + 1).map(c => c.close);
                const rsi = calcRSI(currCloses, 14);
                if (rsi < 35) rsiTouched35 = true;

                if (rsiTouched35 && d >= 2) {
                    const c1 = cData[cIdx - 1];
                    const c2 = cData[cIdx];
                    if (c1.close > c1.open && c2.close > c2.open && c2.close > c1.high) {
                        entryIdxC = cIdx + 1; break;
                    }
                }
            }
            if (entryIdxC !== -1) {
                const p = runOption(entryIdxC);
                if (p !== null) { resC.entered++; resC.pnl += p; if (p > 0) resC.wins++; }
            }
        }

        const printRes = (name, obj) => {
            const wr = obj.entered ? (obj.wins / obj.entered) * 100 : 0;
            console.log(`  Option ${name.padEnd(20)}: ${String(obj.entered).padStart(3)} entries | Day5 WR: ${wr.toFixed(1)}% | P&L: ₹${obj.pnl.toFixed(0)}`);
        };
        printRes('A (Double Bottom)', resA);
        printRes('B (SMA10 Reclaim)', resB);
        printRes('C (2 Green Candles)', resC);
    }

    // -------------------------------------------------------
    async function simLTSwingUp() {
        console.log(`\n--- STRATEGY: LONG_TERM_SWING_BO_UP (Wider Stops) ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_UP' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSigs = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, sDate: toISTDateString(s.addedDate) }])).values());

        const res2x = { entered: 0, wins: 0, pnl: 0 };
        const res3x = { entered: 0, wins: 0, pnl: 0 };
        const resNo = { entered: 0, wins: 0, pnl: 0 };

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
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close)
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
            const isConfirmed = checkTypeAConfirmation(m30Data, day1Date, max50);

            if (isConfirmed && sIdx + 2 < cData.length) {
                const actualEntryIdx = sIdx + 2;
                const entryPrice = cData[actualEntryIdx].open;
                const atr14 = calcATR(cData.slice(0, actualEntryIdx), 14);

                const runStopSim = (mult, obj) => {
                    let stopLoss = 0;
                    let qty = 0;
                    if (mult === null) { qty = Math.floor(1000 / (entryPrice * 0.10)); } // pseudo 10% risk for sizing
                    else {
                        stopLoss = entryPrice - (mult * atr14);
                        qty = Math.floor(1000 / (entryPrice - stopLoss));
                    }
                    if (qty <= 0) return;

                    let exitPrice = 0;
                    for (let hold = 1; hold <= 13; hold++) {
                        const hIdx = actualEntryIdx + hold;
                        if (hIdx >= cData.length) { exitPrice = cData[cData.length - 1].close; break; }
                        const tc = cData[hIdx];
                        if (mult !== null && tc.open <= stopLoss) { exitPrice = tc.open; break; }
                        if (mult !== null && tc.low <= stopLoss) { exitPrice = stopLoss; break; }
                        if (hold === 13) { exitPrice = tc.close; break; }
                    }

                    const pnl = (exitPrice - entryPrice) * qty;
                    obj.entered++; obj.pnl += pnl; if (pnl > 0) obj.wins++;
                };

                runStopSim(2.0, res2x);
                runStopSim(3.0, res3x);
                runStopSim(null, resNo);
            }
        }

        const printRes = (name, obj) => {
            const wr = obj.entered ? (obj.wins / obj.entered) * 100 : 0;
            console.log(`  ${name.padEnd(20)}: ${String(obj.entered).padStart(3)} trades | Day13 WR: ${wr.toFixed(1)}% | P&L: ₹${obj.pnl.toFixed(0)}`);
        };
        printRes('2x ATR (current)', res2x);
        printRes('3x ATR (wider)', res3x);
        printRes('No stop (Timeout)', resNo);
    }

    // -------------------------------------------------------
    async function simLTSwingDown() {
        console.log(`\n--- STRATEGY: LONG_TERM_SWING_BO_DOWN (SMA200 Proxy) ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_DOWN' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSigs = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, sDate: toISTDateString(s.addedDate) }])).values());

        let qualified = 0, entered = 0, wins = 0, totalPnl = 0;

        for (const sig of uniqueSigs) {
            const ck = sig.iKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fk = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dPath = path.join(cacheDirDay, `${ck}_master.json`);
            if (!fs.existsSync(dPath)) dPath = path.join(cacheDirDay, `${fk}_master.json`);
            if (!fs.existsSync(dPath)) continue;

            const cData = (JSON.parse(fs.readFileSync(dPath, 'utf8')).data || JSON.parse(fs.readFileSync(dPath, 'utf8'))).map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.sDate);
            if (sIdx < 200 || sIdx + 15 >= cData.length) continue;

            const hist = cData.slice(0, sIdx + 1);
            const sma200 = calcSMA(hist.map(c => c.close), 200);
            if (!sma200) continue;

            const dropClose = cData[sIdx].close;
            const dropFromSMA = (sma200 - dropClose) / sma200;
            // Target: 20-40% below SMA200
            if (dropFromSMA < 0.20 || dropFromSMA > 0.40) continue;

            if (!checkNifty(sig.sDate, 0.94)) continue;

            const wMap = new Map();
            for (const c of hist) wMap.set(getYearWeek(c.date), c.close);
            const wCloses = Array.from(wMap.values());
            const wRsi = calcRSI(wCloses, 14);
            // Weekly RSI must be 30-40
            if (!wRsi || wRsi < 30 || wRsi > 40) continue;

            qualified++;

            const prior50 = cData.slice(sIdx - 50, sIdx);
            const brokenSupport = Math.min(...prior50.map(c => c.close));

            let entryTriggered = false;
            let actualEntryIdx = -1;
            let lowestLow = dropClose;

            for (let d = 1; d <= 20; d++) {
                const cIdx = sIdx + d;
                if (cIdx + 15 >= cData.length) break;
                const tc = cData[cIdx];

                if (tc.low < lowestLow) lowestLow = tc.low;

                // ENTRY: Stock closes back ABOVE broken support (Reclaim)
                if (tc.close > brokenSupport) {
                    entryTriggered = true;
                    actualEntryIdx = cIdx + 1; // open of next day
                    break;
                }
            }

            if (entryTriggered) {
                entered++;
                const entryPrice = cData[actualEntryIdx].open;
                const stopLoss = lowestLow; // natural structure stop

                if (entryPrice <= stopLoss) continue;
                const qty = Math.floor(1000 / (entryPrice - stopLoss));

                let exitPrice = 0;
                for (let hold = 1; hold <= 15; hold++) {
                    const hIdx = actualEntryIdx + hold;
                    if (hIdx >= cData.length) { exitPrice = cData[cData.length - 1].close; break; }
                    const tc = cData[hIdx];
                    if (tc.open <= stopLoss) { exitPrice = tc.open; break; }
                    if (tc.low <= stopLoss) { exitPrice = stopLoss; break; }
                    if (hold === 15) { exitPrice = tc.close; break; }
                }

                const pnl = (exitPrice - entryPrice) * qty;
                totalPnl += pnl;
                if (pnl > 0) wins++;
            }
        }

        console.log(`  LT_SWING_DOWN (revised): ${String(entered).padStart(3)} entries | Day15 WR: ${entered ? (wins / entered * 100).toFixed(1) : 0}% | P&L: ₹${totalPnl.toFixed(0)}`);
    }

}

main().catch(console.error);
