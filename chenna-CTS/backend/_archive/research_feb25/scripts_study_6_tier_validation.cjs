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
    console.log(`STUDY 6: CONFIDENCE TIER VALIDATION`);

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

    await validateSTSwingDown();
    await validateLTSwingUp();

    await prisma.$disconnect();

    async function validateSTSwingDown() {
        console.log(`\n--- STRATEGY: SHORT_TERM_SWING_BO_DOWN TIER VALIDATION ---`);
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

                        // Factors
                        const daysToEntry = entryIdx - sIdx;
                        const dbDiffPct = Math.abs(low1 - low2Candle.low) / low1 * 100;

                        const avgVol20 = cData.slice(sIdx - 20, sIdx).reduce((a, b) => a + b.volume, 0) / 20;
                        const avgVolStructure = cData.slice(sIdx, entryIdx).reduce((a, b) => a + b.volume, 0) / (entryIdx - sIdx);
                        const volRatio = avgVolStructure / avgVol20;

                        const niftyDist = getNiftyDist(cData[entryIdx].date);

                        let score = 0;

                        // 1. DB Tightness (Max 30)
                        if (dbDiffPct < 0.5) score += 30;
                        else if (dbDiffPct > 1.5) score += 15;

                        // 2. Days to form (Max 25)
                        if (daysToEntry >= 7 && daysToEntry <= 10) score += 25;
                        else if (daysToEntry <= 6) score += 10;

                        // 3. RSI Depth (Max 20)
                        if (lowestRSI >= 20 && lowestRSI <= 30) score += 20;
                        else if (lowestRSI > 30) score += 5;

                        // 4. Volume (Max 15)
                        if (volRatio >= 1.0 && volRatio <= 1.5) score += 15;
                        else if (volRatio < 1.0) score += 10;

                        // 5. Nifty (Max 10)
                        if (niftyDist >= -1 && niftyDist <= 1) score += 10;
                        else if (niftyDist > 1) score += 5;

                        let tier = 'TIER_3';
                        if (score >= 70) tier = 'TIER_1';
                        else if (score >= 40) tier = 'TIER_2';

                        trades.push({ win: pnl > 0, score, tier, pnl });
                    }
                }
            }
        }

        const tierGroup = {
            TIER_1: { entered: 0, wins: 0, pnl: 0 },
            TIER_2: { entered: 0, wins: 0, pnl: 0 },
            TIER_3: { entered: 0, wins: 0, pnl: 0 }
        };

        for (const t of trades) {
            tierGroup[t.tier].entered++;
            tierGroup[t.tier].pnl += t.pnl;
            if (t.win) tierGroup[t.tier].wins++;
        }

        console.log(`  Score 70-100 (HIGH)  : ${String(tierGroup.TIER_1.entered).padStart(3)} trades | ${tierGroup.TIER_1.entered ? (tierGroup.TIER_1.wins / tierGroup.TIER_1.entered * 100).toFixed(1) : '0.0'}% WR | Avg P&L ₹${tierGroup.TIER_1.entered ? (tierGroup.TIER_1.pnl / tierGroup.TIER_1.entered).toFixed(0) : 0}`);
        console.log(`  Score 40-69 (MEDIUM) : ${String(tierGroup.TIER_2.entered).padStart(3)} trades | ${tierGroup.TIER_2.entered ? (tierGroup.TIER_2.wins / tierGroup.TIER_2.entered * 100).toFixed(1) : '0.0'}% WR | Avg P&L ₹${tierGroup.TIER_2.entered ? (tierGroup.TIER_2.pnl / tierGroup.TIER_2.entered).toFixed(0) : 0}`);
        console.log(`  Score 0-39 (LOW)     : ${String(tierGroup.TIER_3.entered).padStart(3)} trades | ${tierGroup.TIER_3.entered ? (tierGroup.TIER_3.wins / tierGroup.TIER_3.entered * 100).toFixed(1) : '0.0'}% WR | Avg P&L ₹${tierGroup.TIER_3.entered ? (tierGroup.TIER_3.pnl / tierGroup.TIER_3.entered).toFixed(0) : 0}`);
    }

    // -------------------------------------------------------
    async function validateLTSwingUp() {
        console.log(`\n--- STRATEGY: LONG_TERM_SWING_BO_UP TIER VALIDATION ---`);
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
            const isConfirmed = checkTypeAConfirmation(m30Data, day1Date, max50);

            if (isConfirmed && sIdx + 2 < cData.length) {
                const actualEntryIdx = sIdx + 2;
                const entryPrice = cData[actualEntryIdx].open;
                const atr14 = calcATR(cData.slice(0, actualEntryIdx), 14);

                const stopLoss = entryPrice - (3.0 * atr14);
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

                const start52 = Math.max(0, sIdx - 250);
                const h52 = Math.max(...cData.slice(start52, sIdx).map(c => c.high));
                const distH52 = h52 > 0 ? ((h52 - sigCandle.close) / h52) * 100 : 0;

                const niftyDist = getNiftyDist(sigCandle.date);

                let score = 0;

                // 1. Distance from 52wk High (Max 25)
                if (distH52 >= 2 && distH52 <= 10) score += 25;
                else if (distH52 < 2) score += 15;

                // 2. Volume (Max 25)
                if (volRatio > 2.5) score += 25;
                else if (volRatio >= 1.5 && volRatio <= 2.5) score += 18;
                else score += 5;

                // 3. Weekly Trend Gap (Max 20)
                if (wGapPct < 5) score += 20;
                else if (wGapPct > 15) score += 12;

                // 4. NIFTY Context (Max 15)
                if (niftyDist < 0) score += 15;
                else if (niftyDist >= 0 && niftyDist <= 1.5) score += 8;
                else score += 5;

                // 5. Candle Close Position (Max 15)
                if (cBodyPos < 60) score += 15;
                else if (cBodyPos > 80) score += 10;
                else score += 5;

                let tier = 'TIER_3';
                if (score >= 70) tier = 'TIER_1';
                else if (score >= 40) tier = 'TIER_2';

                trades.push({ win: pnl > 0, score, tier, pnl });
            }
        }

        const tierGroup = {
            TIER_1: { entered: 0, wins: 0, pnl: 0 },
            TIER_2: { entered: 0, wins: 0, pnl: 0 },
            TIER_3: { entered: 0, wins: 0, pnl: 0 }
        };

        for (const t of trades) {
            tierGroup[t.tier].entered++;
            tierGroup[t.tier].pnl += t.pnl;
            if (t.win) tierGroup[t.tier].wins++;
        }

        console.log(`  Score 70-100 (HIGH)  : ${String(tierGroup.TIER_1.entered).padStart(3)} trades | ${tierGroup.TIER_1.entered ? (tierGroup.TIER_1.wins / tierGroup.TIER_1.entered * 100).toFixed(1) : '0.0'}% WR | Avg P&L ₹${tierGroup.TIER_1.entered ? (tierGroup.TIER_1.pnl / tierGroup.TIER_1.entered).toFixed(0) : 0}`);
        console.log(`  Score 40-69 (MEDIUM) : ${String(tierGroup.TIER_2.entered).padStart(3)} trades | ${tierGroup.TIER_2.entered ? (tierGroup.TIER_2.wins / tierGroup.TIER_2.entered * 100).toFixed(1) : '0.0'}% WR | Avg P&L ₹${tierGroup.TIER_2.entered ? (tierGroup.TIER_2.pnl / tierGroup.TIER_2.entered).toFixed(0) : 0}`);
        console.log(`  Score 0-39 (LOW)     : ${String(tierGroup.TIER_3.entered).padStart(3)} trades | ${tierGroup.TIER_3.entered ? (tierGroup.TIER_3.wins / tierGroup.TIER_3.entered * 100).toFixed(1) : '0.0'}% WR | Avg P&L ₹${tierGroup.TIER_3.entered ? (tierGroup.TIER_3.pnl / tierGroup.TIER_3.entered).toFixed(0) : 0}`);
    }
}

main().catch(console.error);
