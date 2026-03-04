const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
        const byDay = {};
        for (const c of raw) {
            const d = String(c.timestamp || c.date).split('T')[0];
            byDay[d] = c;
        }
        return byDay;
    } catch (e) { return null; }
}

async function main() {
    console.log("Loading universe from Database...");

    // Get all IB stocks categorized ever
    const ibCats = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } },
        include: { stock: true }
    });

    // Get all HPS stocks categorized ever
    const hpsCats = await prisma.stockCategory.findMany({
        where: { category: { key: 'HIGH_POWERED_STOCKS' } },
        include: { stock: true }
    });

    const hpsSet = new Set();
    for (const hc of hpsCats) {
        if (hc.stock && hc.addedDate) {
            hpsSet.add(`${hc.stock.symbol}_${hc.addedDate.toISOString().split('T')[0]}`);
        }
    }

    // mapping: date -> list of { sym, isDual }
    const dateMap = {};
    const allSymbolsSet = new Set();

    for (const r of ibCats) {
        if (!r.addedDate || !r.stock) continue;
        const dt = r.addedDate.toISOString().split('T')[0];
        const sym = r.stock.symbol;
        allSymbolsSet.add(sym);

        const isDual = hpsSet.has(`${sym}_${dt}`);
        if (!dateMap[dt]) dateMap[dt] = [];
        dateMap[dt].push({ sym, isDual });
    }

    const sortedDates = Object.keys(dateMap).sort();
    console.log(`Analyzing Pure 30-min ORB across ${sortedDates.length} distinct trading days.`);

    const fileCache30m = {};
    const fileCacheDay = {};
    for (const sym of Array.from(allSymbolsSet)) {
        const c30 = load30mCache(sym);
        if (c30) fileCache30m[sym] = c30;

        const cD = loadDayCache(sym);
        if (cD) fileCacheDay[sym] = cD;
    }

    // Stats tracking
    const breakoutTiming = {
        'Candle 2': 0, 'Candle 3': 0, 'Candle 4': 0, 'Candle 5': 0, 'Candle 6+': 0, 'Never': 0
    };

    const timingPerf = {
        'Candle 2': { total: 0, t1: 0, t2: 0, stop: 0 },
        'Candle 3': { total: 0, t1: 0, t2: 0, stop: 0 },
        'Candle 4': { total: 0, t1: 0, t2: 0, stop: 0 },
        'Candle 5': { total: 0, t1: 0, t2: 0, stop: 0 },
        'Candle 6+': { total: 0, t1: 0, t2: 0, stop: 0 }
    };

    const dirPerf = {
        'LONG': { total: 0, t1: 0, t2: 0, stop: 0 },
        'SHORT': { total: 0, t1: 0, t2: 0, stop: 0 }
    };

    const rangePerf = {
        'Tight (<0.5%)': { total: 0, t1: 0, stop: 0 },
        'Medium (0.5-1.0%)': { total: 0, t1: 0, stop: 0 },
        'Wide (1.0-2.0%)': { total: 0, t1: 0, stop: 0 },
        'Very Wide (>2.0%)': { total: 0, t1: 0, stop: 0 }
    };

    const catPerf = {
        'Dual': { total: 0, t1: 0, stop: 0 },
        'IB Only': { total: 0, t1: 0, stop: 0 }
    };

    const driftStats = {
        count: 0,
        totalPct: 0
    };

    let totalSamples = 0;

    for (const day of sortedDates) {
        const entries = dateMap[day];

        for (const pick of entries) {
            const sym = pick.sym;
            const isDual = pick.isDual;

            const data30 = fileCache30m[sym];
            if (!data30 || !data30[day]) continue;

            const c30Today = data30[day];
            if (c30Today.length < 5) continue; // Need a full day almost

            const dataDay = fileCacheDay[sym];
            const sortedDayKeys = dataDay ? Object.keys(dataDay).sort() : [];
            const prevDayIdx = sortedDayKeys.indexOf(day) - 1;

            let prevClose = c30Today[0].open; // fallback
            if (prevDayIdx >= 0) {
                prevClose = parseFloat(dataDay[sortedDayKeys[prevDayIdx]].close);
            }

            totalSamples++;

            const c1 = c30Today[0];
            const orbHigh = parseFloat(c1.high);
            const orbLow = parseFloat(c1.low);
            const orbRangePct = ((orbHigh - orbLow) / c1.open) * 100;

            const gapPct = ((c1.open - prevClose) / prevClose) * 100;

            // Step 2: Skip if gap > 2% absolute
            if (Math.abs(gapPct) > 2.0) {
                breakoutTiming['Never']++;
                continue;
            }

            // Step 3: Track every subsequent candle
            let breakoutCandleIdx = -1;
            let setupType = null;
            let entryPrice = 0;
            let stopLoss = 0;

            for (let i = 1; i < c30Today.length; i++) {
                const cx = c30Today[i];
                const cls = parseFloat(cx.close);

                if (cls > orbHigh) {
                    breakoutCandleIdx = i;
                    setupType = 'LONG';
                    entryPrice = cls;
                    stopLoss = orbLow;
                    break;
                } else if (cls < orbLow) {
                    breakoutCandleIdx = i;
                    setupType = 'SHORT';
                    entryPrice = cls;
                    stopLoss = orbHigh;
                    break;
                }
            }

            if (breakoutCandleIdx === -1) {
                breakoutTiming['Never']++;
                continue;
            }

            // Map idx to timing bucket (0=9:15-9:45, 1=9:45-10:15)
            let timingBucket = '';
            if (breakoutCandleIdx === 1) timingBucket = 'Candle 2';
            else if (breakoutCandleIdx === 2) timingBucket = 'Candle 3';
            else if (breakoutCandleIdx === 3) timingBucket = 'Candle 4';
            else if (breakoutCandleIdx === 4) timingBucket = 'Candle 5';
            else timingBucket = 'Candle 6+';

            breakoutTiming[timingBucket]++;

            const risk = Math.abs(entryPrice - stopLoss);
            if (risk === 0) continue;

            const t1 = setupType === 'LONG' ? entryPrice + risk : entryPrice - risk;
            const t2 = setupType === 'LONG' ? entryPrice + (2 * risk) : entryPrice - (2 * risk);

            let hitT1 = false;
            let hitT2 = false;
            let hitStop = false;

            // Evaluate subsequent candles
            for (let j = breakoutCandleIdx + 1; j < c30Today.length; j++) {
                const cx = c30Today[j];
                const h = parseFloat(cx.high);
                const l = parseFloat(cx.low);

                if (setupType === 'LONG') {
                    if (l <= stopLoss) { hitStop = true; break; }
                    if (!hitT1 && h >= t1) hitT1 = true;
                    if (h >= t2) { hitT2 = true; hitT1 = true; break; }
                } else {
                    if (h >= stopLoss) { hitStop = true; break; }
                    if (!hitT1 && l <= t1) hitT1 = true;
                    if (l <= t2) { hitT2 = true; hitT1 = true; break; }
                }
            }

            // Drift logic
            if (!hitT1 && !hitStop) {
                const lc = c30Today[c30Today.length - 1];
                const eodExit = parseFloat(lc.close);
                const pctReturn = setupType === 'LONG' ? ((eodExit - entryPrice) / entryPrice) * 100 : ((entryPrice - eodExit) / entryPrice) * 100;
                driftStats.count++;
                driftStats.totalPct += pctReturn;
            }

            // Aggregate
            timingPerf[timingBucket].total++;
            if (hitT1) timingPerf[timingBucket].t1++;
            if (hitT2) timingPerf[timingBucket].t2++;
            if (hitStop) timingPerf[timingBucket].stop++;

            dirPerf[setupType].total++;
            if (hitT1) dirPerf[setupType].t1++;
            if (hitT2) dirPerf[setupType].t2++;
            if (hitStop) dirPerf[setupType].stop++;

            let rangeBucket = '';
            if (orbRangePct < 0.5) rangeBucket = 'Tight (<0.5%)';
            else if (orbRangePct <= 1.0) rangeBucket = 'Medium (0.5-1.0%)';
            else if (orbRangePct <= 2.0) rangeBucket = 'Wide (1.0-2.0%)';
            else rangeBucket = 'Very Wide (>2.0%)';

            rangePerf[rangeBucket].total++;
            if (hitT1) rangePerf[rangeBucket].t1++;
            if (hitStop) rangePerf[rangeBucket].stop++;

            const catKey = isDual ? 'Dual' : 'IB Only';
            catPerf[catKey].total++;
            if (hitT1) catPerf[catKey].t1++;
            if (hitStop) catPerf[catKey].stop++;
        }
    }

    // Output Formatting
    const out = [];
    out.push("=== PURE 30-MIN ORB DATA STUDY ===");
    out.push(`Total stock-days analyzed: ${totalSamples}`);

    const totalBreakouts = breakoutTiming['Candle 2'] + breakoutTiming['Candle 3'] + breakoutTiming['Candle 4'] + breakoutTiming['Candle 5'] + breakoutTiming['Candle 6+'];
    const totalWithNever = totalBreakouts + breakoutTiming['Never'];

    out.push("\nA) WHEN do breakouts happen?");
    for (const [k, v] of Object.entries(breakoutTiming)) {
        if (k === 'Never') {
            out.push(`  Never broke out / Gapped > 2%    : ${v.toString().padEnd(4)} stocks | ${((v / totalWithNever) * 100).toFixed(1)}% of total`);
        } else {
            out.push(`  ${k.padEnd(16)}: ${v.toString().padEnd(4)} breakouts | ${((v / totalWithNever) * 100).toFixed(1)}% of total (or ${((v / totalBreakouts) * 100).toFixed(1)}% of actual breakouts)`);
        }
    }

    out.push("\nB) DOES EARLIER = BETTER?");
    for (const [k, p] of Object.entries(timingPerf)) {
        if (p.total > 0) {
            out.push(`  Breakout on ${k}: \n    ${p.total} trades | T1 (1:1): ${((p.t1 / p.total) * 100).toFixed(1)}% | T2 (1:2): ${((p.t2 / p.total) * 100).toFixed(1)}% | Stop: ${((p.stop / p.total) * 100).toFixed(1)}%`);
        }
    }

    out.push("\nC) LONG vs SHORT:");
    for (const [k, p] of Object.entries(dirPerf)) {
        if (p.total > 0) {
            out.push(`  ${k.padEnd(5)} trades: \n    ${p.total} trades | T1 (1:1): ${((p.t1 / p.total) * 100).toFixed(1)}% | T2 (1:2): ${((p.t2 / p.total) * 100).toFixed(1)}% | Stop: ${((p.stop / p.total) * 100).toFixed(1)}%`);
        }
    }

    out.push("\nD) OR RANGE SIZE matters?");
    for (const [k, p] of Object.entries(rangePerf)) {
        if (p.total > 0) {
            out.push(`  ${k.padEnd(17)}: \n    ${p.total} trades | T1 (1:1): ${((p.t1 / p.total) * 100).toFixed(1)}% | Stop: ${((p.stop / p.total) * 100).toFixed(1)}%`);
        }
    }

    out.push("\nE) Does being in BOTH IB + HPS help?");
    for (const [k, p] of Object.entries(catPerf)) {
        if (p.total > 0) {
            out.push(`  ${k.padEnd(8)} stocks: \n    ${p.total} trades | T1 (1:1): ${((p.t1 / p.total) * 100).toFixed(1)}% | Stop: ${((p.stop / p.total) * 100).toFixed(1)}%`);
        }
    }

    out.push("\nF) EOD result if no T1 or Stop hit:");
    if (totalBreakouts > 0) {
        out.push(`  Average P&L of drifting trades : ${(driftStats.totalPct / driftStats.count).toFixed(2)}%`);
        out.push(`  % of trades ending in drift zone: ${((driftStats.count / totalBreakouts) * 100).toFixed(1)}%`);
    }

    fs.writeFileSync(path.join(__dirname, 'clean_pure_30m_orb_out.txt'), out.join('\n'));
    console.log(out.join('\n'));
}

main().catch(console.error).finally(() => prisma.$disconnect());
