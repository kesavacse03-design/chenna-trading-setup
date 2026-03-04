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

function getCandleType(open, high, low, close) {
    const body = Math.abs(close - open);
    const range = high - low;
    if (range === 0) return 'Doji';
    const bodyPct = body / range;
    const isGreen = close > open;
    const upperWick = isGreen ? high - close : high - open;
    const lowerWick = isGreen ? open - low : close - low;

    if (bodyPct <= 0.1) return 'Doji';
    if (lowerWick > body * 2 && upperWick < body * 0.5) return 'Hammer';
    if (bodyPct >= 0.8) return isGreen ? 'Marubozu Green' : 'Marubozu Red';
    return isGreen ? 'Normal Green' : 'Normal Red';
}

function isBullishEngulfing(prevOpen, prevClose, open, close) {
    const isGreen = close > open;
    const prevIsRed = prevClose < prevOpen;
    return prevIsRed && isGreen && close > prevOpen && open < prevClose;
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

function check1HHammer(m30Data, targetDateStr) {
    const dayData = m30Data.filter(c => c.date.startsWith(targetDateStr));
    for (let i = 0; i < dayData.length; i += 2) {
        const c1 = dayData[i];
        const c2 = dayData[i + 1];
        if (!c2) continue;
        const open = c1.open;
        const high = Math.max(c1.high, c2.high);
        const low = Math.min(c1.low, c2.low);
        const close = c2.close;
        if (getCandleType(open, high, low, close) === 'Hammer') return true;
    }
    return false;
}

async function main() {
    console.log(`\n======================================================`);
    console.log(`STUDY 3: CATEGORICAL STRICT RULES VALIDATION SIMULATION`);

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
        console.log(`\n--- STRATEGY: SHORT_TERM_SWING_BO_DOWN ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
        if (!cat) return;
        const stockCategories = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSignals = Array.from(new Map(stockCategories.map(sc => [`${sc.stock.symbol}_${toISTDateString(sc.addedDate)}`, { symbol: sc.stock.symbol, instrumentKey: sc.stock.instrumentKey || sc.stock.symbol, signalDateStr: toISTDateString(sc.addedDate) }])).values());

        let qualified = 0, entered = 0, wins = 0, totalPnl = 0;
        let rejectIdx = 0, rejectRsi = 0, rejectNifty = 0, entryMissed = 0;

        for (const sig of uniqueSignals) {
            const cleanKey = sig.instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fbKey = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            let dayPath = path.join(cacheDirDay, `${cleanKey}_master.json`);
            if (!fs.existsSync(dayPath)) dayPath = path.join(cacheDirDay, `${fbKey}_master.json`);
            let m30Path = path.join(cacheDir30m, `${cleanKey}_master.json`);
            if (!fs.existsSync(m30Path)) m30Path = path.join(cacheDir30m, `${fbKey}_master.json`);
            if (!fs.existsSync(dayPath)) continue;

            const dayData = JSON.parse(fs.readFileSync(dayPath, 'utf8')).data || JSON.parse(fs.readFileSync(dayPath, 'utf8'));
            const cData = dayData.map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = cData.findIndex(c => c.date === sig.signalDateStr);
            if (sIdx < 20 || sIdx + 5 >= cData.length) { rejectIdx++; continue; }

            const history = cData.slice(0, sIdx + 1);
            const rsiDay0 = calcRSI(history.map(c => c.close), 14);
            if (!rsiDay0 || rsiDay0 >= 40) { rejectRsi++; continue; }
            if (!checkNifty(sig.signalDateStr, 0.96)) { rejectNifty++; continue; }

            qualified++;

            let hasRsiBelow30 = rsiDay0 < 30;
            let entryTriggered = false;
            let entryDayIdx = -1;

            let m30Data = [];
            if (fs.existsSync(m30Path)) {
                try {
                    const p30 = JSON.parse(fs.readFileSync(m30Path, 'utf8'));
                    m30Data = (p30.data || p30).map(c => ({
                        date: String(c.timestamp || c.date).replace('T', ' ').substring(0, 16),
                        open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
                    })).sort((a, b) => a.date.localeCompare(b.date));
                } catch (e) { }
            }

            for (let d = 1; d <= 15; d++) {
                const currIdx = sIdx + d;
                if (currIdx + 5 >= cData.length) break;

                const currCloses = cData.slice(0, currIdx + 1).map(c => c.close);
                const currRsi = calcRSI(currCloses, 14);
                if (currRsi < 30) hasRsiBelow30 = true;

                if (!hasRsiBelow30) continue;

                // Check reversal candle
                const c = cData[currIdx];
                const prev = cData[currIdx - 1];
                let cType = getCandleType(c.open, c.high, c.low, c.close);
                if (isBullishEngulfing(prev.open, prev.close, c.open, c.close)) cType = 'Bullish Engulfing';

                let isReversal = ['Hammer', 'Bullish Engulfing', 'Doji'].includes(cType);
                if (!isReversal && m30Data.length > 0) {
                    isReversal = check1HHammer(m30Data, c.date);
                }

                if (isReversal) {
                    const volAvg20 = cData.slice(currIdx - 19, currIdx + 1).reduce((s, v) => s + v.volume, 0) / 20;
                    if (c.volume < volAvg20 * 2.0) {
                        entryTriggered = true;
                        entryDayIdx = currIdx;
                        break;
                    }
                }
            }

            if (entryTriggered) {
                entered++;
                const actualEntryIdx = entryDayIdx + 1; // open of next day
                const entryPrice = cData[actualEntryIdx].open;

                const atr14 = calcATR(cData.slice(0, entryDayIdx + 1), 14);
                const stopLoss = entryPrice - (2.0 * atr14);

                const qty = Math.floor(1000 / (entryPrice - stopLoss));
                if (qty <= 0) continue;

                let exitPrice = 0;
                let exitReason = '';
                for (let hold = 1; hold <= 5; hold++) {
                    const hIdx = actualEntryIdx + hold;
                    if (hIdx >= cData.length) {
                        exitPrice = cData[cData.length - 1].close; exitReason = 'EOD'; break;
                    }
                    const tc = cData[hIdx];
                    if (tc.open <= stopLoss) {
                        exitPrice = tc.open; exitReason = 'GAP_STOP'; break;
                    }
                    if (tc.low <= stopLoss) {
                        exitPrice = stopLoss; exitReason = 'STOP'; break;
                    }
                    if (hold === 5) {
                        exitPrice = tc.close; exitReason = 'TIME'; break;
                    }
                }

                const pnl = (exitPrice - entryPrice) * qty;
                totalPnl += pnl;
                if (pnl > 0) wins++;
            } else {
                entryMissed++;
            }
        }

        console.log(`  Diagnostics: Missing History (${rejectIdx}), RSI >=40 (${rejectRsi}), Nifty Fail (${rejectNifty}), Qualified but no entry (${entryMissed})`);
        console.log(`  Qualified Signals   : ${qualified} (of ${uniqueSignals.length})`);
        console.log(`  Entries Triggered   : ${entered}`);
        if (entered > 0) {
            console.log(`  Win Rate (Day 5)    : ${(wins / entered * 100).toFixed(1)}%`);
            console.log(`  Total P&L           : ₹${totalPnl.toFixed(0)}`);
            console.log(`  Avg P&L per Trade   : ₹${(totalPnl / entered).toFixed(0)}`);
        }
    }

    async function simLTSwingUp() {
        console.log(`\n--- STRATEGY: LONG_TERM_SWING_BO_UP ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_UP' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSigs = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, sDate: toISTDateString(s.addedDate) }])).values());

        let qualified = 0, entered = 0, wins = 0, totalPnl = 0;
        let rejectIdx = 0, rejectRsi = 0, rejectNifty = 0, rejectWeekly = 0, entryMissed = 0;

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
            if (sIdx < 50 || sIdx + 13 >= cData.length) { rejectIdx++; continue; }

            const hist = cData.slice(0, sIdx + 1);
            const rsi = calcRSI(hist.map(c => c.close), 14);
            if (!rsi || rsi < 60 || rsi > 70) { rejectRsi++; continue; }

            if (!checkNifty(sig.sDate, 0.98)) { rejectNifty++; continue; }

            const wMap = new Map();
            for (const c of hist) wMap.set(getYearWeek(c.date), c.close);
            const wCloses = Array.from(wMap.values());
            if (wCloses.length < 30) { rejectWeekly++; continue; }
            const we10 = calcEMA(wCloses, 10);
            const we30 = calcEMA(wCloses, 30);
            if (we10 <= we30) { rejectWeekly++; continue; }

            qualified++;

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
                entered++;
                const actualEntryIdx = sIdx + 2; // Next morning
                const entryPrice = cData[actualEntryIdx].open;

                const atr14 = calcATR(cData.slice(0, sIdx + 2), 14);
                const stopLoss = entryPrice - (2.0 * atr14);
                const qty = Math.floor(1000 / (entryPrice - stopLoss));

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
                totalPnl += pnl;
                if (pnl > 0) wins++;
            } else {
                entryMissed++;
            }
        }
        console.log(`  Diagnostics: Missing History (${rejectIdx}), RSI out of 60-70 bounds (${rejectRsi}), Nifty Fail (${rejectNifty}), Weekly Trend Fail (${rejectWeekly}), Conf missed (${entryMissed})`);
        console.log(`  Qualified Signals   : ${qualified} (of ${uniqueSigs.length})`);
        console.log(`  Entries Triggered   : ${entered}`);
        if (entered > 0) {
            console.log(`  Win Rate (Day 13)   : ${(wins / entered * 100).toFixed(1)}%`);
            console.log(`  Total P&L           : ₹${totalPnl.toFixed(0)}`);
            console.log(`  Avg P&L per Trade   : ₹${(totalPnl / entered).toFixed(0)}`);
        }
    }

    async function simLTSwingDown() {
        console.log(`\n--- STRATEGY: LONG_TERM_SWING_BO_DOWN ---`);
        const cat = await prisma.category.findUnique({ where: { key: 'LONG_TERM_SWING_BO_DOWN' } });
        if (!cat) return;
        const sc = await prisma.stockCategory.findMany({ where: { categoryId: cat.id }, include: { stock: true } });
        const uniqueSigs = Array.from(new Map(sc.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, { symbol: s.stock.symbol, iKey: s.stock.instrumentKey || s.stock.symbol, sDate: toISTDateString(s.addedDate) }])).values());

        let qualified = 0, entered = 0, wins = 0, totalPnl = 0;
        let rejectIdx = 0, rejectDrop = 0, rejectNifty = 0, rejectWRsi = 0, entryMissed = 0;

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
            if (sIdx < 250 || sIdx + 15 >= cData.length) { rejectIdx++; continue; }

            const hist = cData.slice(0, sIdx + 1);
            const dropClose = cData[sIdx].close;
            const h52 = Math.max(...hist.slice(-250).map(c => c.high));
            const dropPct = ((h52 - dropClose) / h52) * 100;
            if (dropPct < 30 || dropPct > 40) { rejectDrop++; continue; }

            if (!checkNifty(sig.sDate, 0.94)) { rejectNifty++; continue; }

            const wMap = new Map();
            for (const c of hist) wMap.set(getYearWeek(c.date), c.close);
            const wCloses = Array.from(wMap.values());
            const wRsi = calcRSI(wCloses, 14);
            if (!wRsi || wRsi <= 30) { rejectWRsi++; continue; }

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

                if (tc.low > lowestLow && tc.close > brokenSupport) {
                    const prev = cData[cIdx - 1];
                    let cType = getCandleType(tc.open, tc.high, tc.low, tc.close);
                    if (isBullishEngulfing(prev.open, prev.close, tc.open, tc.close)) cType = 'Bullish Engulfing';

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
            } else {
                entryMissed++;
            }
        }

        console.log(`  Diagnostics: Missing History/15d forward (${rejectIdx}), Drop out of bounds (${rejectDrop}), Nifty Fail (${rejectNifty}), Weekly RSI < 30 (${rejectWRsi}), Entry missed (${entryMissed})`);
        console.log(`  Qualified Signals   : ${qualified} (of ${uniqueSigs.length})`);
        console.log(`  Entries Triggered   : ${entered}`);
        if (entered > 0) {
            console.log(`  Win Rate (Day 15)   : ${(wins / entered * 100).toFixed(1)}%`);
            console.log(`  Total P&L           : ₹${totalPnl.toFixed(0)}`);
            console.log(`  Avg P&L per Trade   : ₹${(totalPnl / entered).toFixed(0)}`);
        }
    }

}

main().catch(console.error);
