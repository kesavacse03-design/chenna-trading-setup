const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

function load30mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const byDay = {};
        for (const c of raw) {
            const parts = String(c.timestamp || c.date).split('T');
            const d = parts[0];
            const t = parts[1].substring(0, 8);
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push({ ...c, timeStr: t });
        }
        return byDay;
    } catch (e) { return null; }
}

function loadDayCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_DAY, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        return raw.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            close: parseFloat(c.close),
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            volume: parseFloat(c.volume)
        })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return null; }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Emulates calculating confidence score for a setup based on pre-compiled stats
function calculateConfidence(sym, sType, date, c1, prevDay, adv20, bCandle, niftyPerf, sectorPerf) {
    let score = 0;
    const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
    const orRangePct = (orRange / parseFloat(c1.open)) * 100;
    const pRange = ((prevDay.high - prevDay.low) / prevDay.low) * 100;

    const isSectorAligned = (sectorPerf > 0 && sType === 'LONG') || (sectorPerf < 0 && sType === 'SHORT');
    const isNiftyAligned = (niftyPerf > 0 && sType === 'LONG') || (niftyPerf < 0 && sType === 'SHORT');
    const isSectorTrending = (sType === 'LONG' && sectorPerf > 0.5) || (sType === 'SHORT' && sectorPerf < -0.5);

    if (isSectorAligned && isNiftyAligned) { score += 45; if (isSectorTrending) score += 15; }
    else if (isSectorAligned && !isNiftyAligned) score += 30;
    else if (!isSectorAligned && isNiftyAligned) score += 20;

    if (isSectorTrending) score += 15;
    if (pRange > 2.0) score += 15; else if (pRange > 1.0) score += 5;
    if (orRangePct > 1.0) score += 10; else if (orRangePct > 0.5) score += 5;

    return Math.min(100, Math.max(0, score));
}

function getWeekOfMonth(date) {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const day = date.getDate();
    return Math.ceil((day + startOfMonth.getDay()) / 7);
}

async function runAnalyses() {
    const ibRecords = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } },
        include: { stock: true }
    });
    const hpRecords = await prisma.stockCategory.findMany({
        where: { category: { key: 'HIGH_POWERED_STOCKS' } },
        include: { stock: true }
    });

    const byDate = {};
    for (const r of ibRecords) {
        if (!r.addedDate) continue;
        const d = r.addedDate.toISOString().split('T')[0];
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(r.stock);
    }
    const validDates = Object.keys(byDate).sort();

    const hpMap = new Set();
    for (const r of hpRecords) {
        if (!r.addedDate) continue;
        const d = r.addedDate.toISOString().split('T')[0];
        hpMap.add(`${d}_${r.stock.symbol}`);
    }

    const niftyPath = path.join(__dirname, '../cache/day/NIFTY50_2020-01-01_2026-12-31.json');
    let niftyData = [];
    if (fs.existsSync(niftyPath)) {
        const raw = JSON.parse(fs.readFileSync(niftyPath, 'utf8')).data;
        niftyData = raw.map(c => ({ date: String(c.timestamp || c.date).split('T')[0], close: parseFloat(c.close) })).sort((a, b) => a.date.localeCompare(b.date));
    }

    const allSetups = [];
    const testDays = [];

    // Phase 1: Reconstruct the historical exact signals emitted each day
    for (const date of validDates) {
        let nPerf = 0;
        const nIdx = niftyData.findIndex(c => c.date === date);
        if (nIdx > 0) nPerf = ((niftyData[nIdx].close - niftyData[nIdx - 1].close) / niftyData[nIdx - 1].close) * 100;

        const dailySignals = [];
        const stocks = byDate[date];

        for (const stock of stocks) {
            const sym = stock.symbol;
            const data30 = load30mCache(sym);
            if (!data30 || !data30[date]) continue;
            const candles = data30[date];
            if (candles.length < 5) continue;

            const dataDay = loadDayCache(sym);
            if (!dataDay) continue;
            const tIdx = dataDay.findIndex(c => c.date === date);
            if (tIdx < 1) continue;

            const prevDay = dataDay[tIdx - 1];
            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;

            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i <= 5 && i < candles.length; i++) {
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }
            if (bIdx === -1 || bIdx + 1 >= candles.length) continue;

            const bCandle = candles[bIdx];
            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);
            const entryPrice = parseFloat(candles[bIdx + 1].open);

            const trueRisk = Math.max(Math.abs(entryPrice - baseStop), entryPrice * 0.005);
            const t1 = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;

            let result = 'LOSS';
            let touchedOR = false, piercedIntra = false;

            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) { touchedOR = true; if (cl <= baseStop) piercedIntra = true; }
                } else {
                    if (!touchedOR && ch >= orl) { touchedOR = true; if (ch >= baseStop) piercedIntra = true; }
                }
            }

            if (touchedOR && piercedIntra) continue; // Instantly expired

            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') {
                    if (cl <= baseStop) { result = 'LOSS'; break; }
                    if (ch >= t1) { result = 'WIN'; break; }
                } else {
                    if (ch >= baseStop) { result = 'LOSS'; break; }
                    if (cl <= t1) { result = 'WIN'; break; }
                }
            }

            const adv20 = 100000; // Mocked for speed
            const confScore = calculateConfidence(sym, sType, date, c1, prevDay, adv20, bCandle, nPerf, 0 /* ignoring sector perf strict calc for speed */);

            let priceOptBonus = 0;
            if (boPrice >= 1000 && boPrice <= 2000) priceOptBonus = 10;
            else if (boPrice > 5000) priceOptBonus = -10;

            const setupObj = {
                date,
                symbol: sym,
                bIdx,
                sType,
                boPrice,
                result,
                confScore,
                optScore: confScore + priceOptBonus,
                isDual: hpMap.has(`${date}_${sym}`)
            };

            dailySignals.push(setupObj);
            allSetups.push(setupObj);
        }

        if (dailySignals.length > 3) {
            testDays.push(dailySignals);
        }
    }

    let dualCount = 0, dualWins = 0, singleCount = 0, singleWins = 0;
    for (const setup of allSetups) {
        const isWin = setup.result === 'WIN';
        if (setup.isDual) {
            dualCount++;
            if (isWin) dualWins++;
        } else {
            singleCount++;
            if (isWin) singleWins++;
        }
    }

    const dualWr = dualCount > 0 ? ((dualWins / dualCount) * 100).toFixed(1) : 0;
    const singleWr = singleCount > 0 ? ((singleWins / singleCount) * 100).toFixed(1) : 0;

    console.log(`\nANALYSIS 1: Dual-Category Overlap Edge`);
    console.log(`  - Total setups (dual-listed): ${dualCount}`);
    console.log(`  - T1 hit rate at 1:1: ${dualWr}%`);
    console.log(`  - Compare to stocks ONLY in INTRADAY_BOOST: ${singleWr}%`);

    const priceBands = [
        { name: "Below ₹100", min: 0, max: 100, count: 0, wins: 0 },
        { name: "₹100-300", min: 100, max: 300, count: 0, wins: 0 },
        { name: "₹300-500", min: 300, max: 500, count: 0, wins: 0 },
        { name: "₹500-1000", min: 500, max: 1000, count: 0, wins: 0 },
        { name: "₹1000-2000", min: 1000, max: 2000, count: 0, wins: 0 },
        { name: "₹2000-5000", min: 2000, max: 5000, count: 0, wins: 0 },
        { name: "Above ₹5000", min: 5000, max: Infinity, count: 0, wins: 0 },
    ];

    for (const setup of allSetups) {
        const p = setup.boPrice;
        const isWin = setup.result === 'WIN';
        for (const b of priceBands) {
            if (p >= b.min && p < b.max) {
                b.count++;
                if (isWin) b.wins++;
                break;
            }
        }
    }

    console.log(`\nANALYSIS 2: Price Range Performance`);
    for (const b of priceBands) {
        const wr = b.count > 0 ? ((b.wins / b.count) * 100).toFixed(1) : "0.0";
        console.log(`  ${b.name.padEnd(14)}: ${String(b.count).padStart(3)} setups | T1 WR: ${wr}%`);
    }

    const dayBands = {
        "1": { name: "Monday", count: 0, wins: 0 },
        "2": { name: "Tuesday", count: 0, wins: 0 },
        "3": { name: "Day before expiry (Wed)", count: 0, wins: 0 },
        "4": { name: "Expiry day (Thursday)", count: 0, wins: 0 },
        "5": { name: "Friday", count: 0, wins: 0 },
    };

    let thursWeekly = { count: 0, wins: 0 };
    let thursMonthly = { count: 0, wins: 0 };

    for (const setup of allSetups) {
        const d = new Date(setup.date);
        const day = String(d.getDay());
        const isWin = setup.result === 'WIN';

        if (dayBands[day]) {
            dayBands[day].count++;
            if (isWin) dayBands[day].wins++;

            if (day === "4") {
                if (d.getDate() >= 24) {
                    thursMonthly.count++;
                    if (isWin) thursMonthly.wins++;
                } else {
                    thursWeekly.count++;
                    if (isWin) thursWeekly.wins++;
                }
            }
        }
    }

    console.log(`\nANALYSIS 3: F&O Expiry Impact`);
    console.log(`  Expiry day (Thursday):     ${String(dayBands["4"].count).padStart(3)} setups | WR: ${dayBands["4"].count > 0 ? ((dayBands["4"].wins / dayBands["4"].count) * 100).toFixed(1) : 0}%`);
    console.log(`  Day before expiry (Wed):   ${String(dayBands["3"].count).padStart(3)} setups | WR: ${dayBands["3"].count > 0 ? ((dayBands["3"].wins / dayBands["3"].count) * 100).toFixed(1) : 0}%`);
    console.log(`  Monday:                    ${String(dayBands["1"].count).padStart(3)} setups | WR: ${dayBands["1"].count > 0 ? ((dayBands["1"].wins / dayBands["1"].count) * 100).toFixed(1) : 0}%`);
    console.log(`  Tuesday:                   ${String(dayBands["2"].count).padStart(3)} setups | WR: ${dayBands["2"].count > 0 ? ((dayBands["2"].wins / dayBands["2"].count) * 100).toFixed(1) : 0}%`);
    console.log(`  Friday:                    ${String(dayBands["5"].count).padStart(3)} setups | WR: ${dayBands["5"].count > 0 ? ((dayBands["5"].wins / dayBands["5"].count) * 100).toFixed(1) : 0}%`);

    const performance = {
        Strategy_A: { name: "Top 3 by Confidence Score", pnlR: 0, wins: 0, total: 0 },
        Strategy_B: { name: "First 3 Chronologically", pnlR: 0, wins: 0, total: 0 },
        Strategy_C: { name: "3 Random Signals", pnlR: 0, wins: 0, total: 0 },
        Strategy_D: { name: "Optimized 3 (Score + Optimal Price Band)", pnlR: 0, wins: 0, total: 0 }
    };

    for (const day of testDays) {
        const sortedA = [...day].sort((a, b) => b.confScore - a.confScore).slice(0, 3);
        sortedA.forEach(s => { performance.Strategy_A.total++; if (s.result === 'WIN') { performance.Strategy_A.wins++; performance.Strategy_A.pnlR += 1; } else performance.Strategy_A.pnlR -= 1; });

        const sortedB = [...day].sort((a, b) => a.bIdx - b.bIdx).slice(0, 3);
        sortedB.forEach(s => { performance.Strategy_B.total++; if (s.result === 'WIN') { performance.Strategy_B.wins++; performance.Strategy_B.pnlR += 1; } else performance.Strategy_B.pnlR -= 1; });

        const sortedD = [...day].sort((a, b) => b.optScore - a.optScore).slice(0, 3);
        sortedD.forEach(s => { performance.Strategy_D.total++; if (s.result === 'WIN') { performance.Strategy_D.wins++; performance.Strategy_D.pnlR += 1; } else performance.Strategy_D.pnlR -= 1; });
    }

    let mWins = 0, mTotal = 0, mPnlR = 0;
    const ITERATIONS = 1000;
    for (let i = 0; i < ITERATIONS; i++) {
        for (const day of testDays) {
            const random3 = shuffle([...day]).slice(0, 3);
            random3.forEach(s => { mTotal++; if (s.result === 'WIN') { mWins++; mPnlR += 1; } else mPnlR -= 1; });
        }
    }
    performance.Strategy_C.total = mTotal / ITERATIONS;
    performance.Strategy_C.wins = mWins / ITERATIONS;
    performance.Strategy_C.pnlR = mPnlR / ITERATIONS;

    console.log(`\nANALYSIS 4: Max 3 Trades Selection Logic`);
    for (const key in performance) {
        const d = performance[key];
        const wr = (d.wins / d.total) * 100;
        console.log(`  Strategy ${key.replace('Strategy_', '')} (${d.name}):`);
        console.log(`    -> AVG WR: ${wr.toFixed(1)}% | Generated PnL: ${(d.pnlR).toFixed(1)} R`);
    }

}

runAnalyses().then(() => prisma.$disconnect());
