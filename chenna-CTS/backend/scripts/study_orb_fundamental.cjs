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

function calcEMA(data, startIdx, period) {
    if (startIdx < period - 1) return null;
    let sum = 0;
    let seedIdx = Math.max(0, startIdx - period * 3);
    if (seedIdx + period - 1 <= startIdx) {
        for (let i = seedIdx; i < seedIdx + period; i++) sum += data[i].close;
        let ema = sum / period;
        const m = 2 / (period + 1);
        for (let i = seedIdx + period; i <= startIdx; i++) {
            ema = (data[i].close - ema) * m + ema;
        }
        return ema;
    }
    return null;
}

function calculateADV20(dayData, targetDateIdx) {
    if (targetDateIdx < 20) return null;
    let sumVol = 0;
    for (let i = targetDateIdx - 20; i < targetDateIdx; i++) {
        sumVol += dayData[i].volume || 0;
    }
    return sumVol / 20;
}

async function main() {
    console.log("Analyzing Fundamental ORB Anatomy...");

    const ibCats = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } },
        include: { stock: true }
    });

    const dateMap = {};
    const allSymbolsSet = new Set();

    for (const r of ibCats) {
        if (!r.addedDate || !r.stock) continue;
        const dt = r.addedDate.toISOString().split('T')[0];
        const sym = r.stock.symbol;
        allSymbolsSet.add(sym);
        if (!dateMap[dt]) dateMap[dt] = [];
        dateMap[dt].push(sym);
    }

    const sortedDates = Object.keys(dateMap).sort();

    const fileCache30m = {};
    const fileCacheDay = {};
    for (const sym of Array.from(allSymbolsSet)) {
        const c30 = load30mCache(sym);
        if (c30) fileCache30m[sym] = c30;
        const cD = loadDayCache(sym);
        if (cD) fileCacheDay[sym] = cD;
    }

    const niftyData = loadDayCache('NIFTY_50'); // Usually NIFTY_50 or NIFTY 50
    let niftyMap = {};
    if (niftyData) {
        for (let i = 1; i < niftyData.length; i++) {
            const gapPct = ((niftyData[i].open - niftyData[i - 1].close) / niftyData[i - 1].close) * 100;
            const dayRet = ((niftyData[i].close - niftyData[i].open) / niftyData[i].open) * 100;
            niftyMap[niftyData[i].date] = { gapPct, dayRet, prevClose: niftyData[i - 1].close, open: niftyData[i].open };
        }
    }

    const vixData = loadDayCache('INDIA_VIX') || loadDayCache('INDIA VIX');
    let vixMap = {};
    if (vixData) {
        for (const c of vixData) vixMap[c.date] = c.open; // morning VIX
    }

    // --- QUESTION 1: REAL VS FAKE ---
    const q1 = {
        total: 0,
        real: 0, fake: 0,
        realVolRatio: [], fakeVolRatio: [],
        realBodyPct: [], fakeBodyPct: [],
        realDistPct: [], fakeDistPct: [],
        realNextConf: 0, fakeNextConf: 0,
        retested: 0, retestHeld: 0, retestFailed: 0,
        realHasNext: 0, fakeHasNext: 0
    };

    // --- QUESTION 2: OPTIMAL STOP ---
    const q2 = {
        total: 0,
        stopA: { hit: 0, winRs: [] }, // OR Opposite
        stopB: { hit: 0, winRs: [] }, // OR Mid
        stopC: { hit: 0, winRs: [] }, // Breakout Low/High
        stopD: { hit: 0, winRs: [] }  // 0.5% Fixed
    };

    // --- QUESTION 3: OPTIMAL TARGET ---
    const q3 = {
        total: 0,
        hit0_5x: 0, hit1_0x: 0, hit1_5x: 0, hit2_0x: 0, hit3_0x: 0,
        maxMoves: []
    };

    // --- QUESTION 4: EXTERNAL FACTORS ---
    const q4 = {
        niftyUp: { longs: { total: 0, t1: 0 }, shorts: { total: 0, t1: 0 } },
        niftyFlat: { longs: { total: 0, t1: 0 }, shorts: { total: 0, t1: 0 } },
        niftyDown: { longs: { total: 0, t1: 0 }, shorts: { total: 0, t1: 0 } },

        vixCalm: { longs: { total: 0, t1: 0 }, shorts: { total: 0, t1: 0 } },
        vixNormal: { longs: { total: 0, t1: 0 }, shorts: { total: 0, t1: 0 } },
        vixVolatile: { longs: { total: 0, t1: 0 }, shorts: { total: 0, t1: 0 } },

        emaAbove: { longs: { total: 0, t1: 0 }, shorts: { total: 0, t1: 0 } },
        emaBelow: { longs: { total: 0, t1: 0 }, shorts: { total: 0, t1: 0 } },

        time1: { total: 0, t1: 0 }, // < 10:15
        time2: { total: 0, t1: 0 }, // 10:15 - 12:00
        time3: { total: 0, t1: 0 }, // 12:00 - 13:30
        time4: { total: 0, t1: 0 }  // > 13:30
    };

    let totalTriggers = 0;

    for (const day of sortedDates) {
        if (!dateMap[day]) continue;

        const nContext = niftyMap[day] ? ((niftyMap[day].open - niftyMap[day].prevClose) / niftyMap[day].prevClose * 100) : 0;
        const vContext = vixMap[day] || 15; // default normal

        for (const sym of dateMap[day]) {
            const data30 = fileCache30m[sym];
            if (!data30 || !data30[day]) continue;
            const candles = data30[day];
            if (candles.length < 5) continue;

            const dataDay = fileCacheDay[sym];
            let ema20 = null;
            if (dataDay) {
                const targetDayIdx = dataDay.findIndex(c => c.date >= day);
                if (targetDayIdx > 0) ema20 = calcEMA(dataDay, targetDayIdx - 1, 20);
            }

            const c1 = candles[0];
            const o1 = parseFloat(c1.open), h1 = parseFloat(c1.high), l1 = parseFloat(c1.low), c1C = parseFloat(c1.close), v1 = parseFloat(c1.volume);
            const orh = h1, orl = l1, orRange = orh - orl;
            if (orRange === 0) continue;

            let adv20 = v1;
            if (dataDay) {
                const targetDayIdx = dataDay.findIndex(cd => cd.date >= day);
                if (targetDayIdx > 0) {
                    const ad = calculateADV20(dataDay, targetDayIdx);
                    if (ad) adv20 = ad / 13; // rough 30m avg
                }
            }

            let bIdx = -1, sType = null, ePrice = 0;

            for (let i = 1; i < candles.length; i++) {
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; ePrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; ePrice = c; break; }
            }

            if (bIdx === -1) continue;
            totalTriggers++;

            const bCandle = candles[bIdx];
            const bo = parseFloat(bCandle.open), bh = parseFloat(bCandle.high), bl = parseFloat(bCandle.low), bc = parseFloat(bCandle.close), bv = parseFloat(bCandle.volume);

            const volRatio = adv20 ? (bv / adv20) : 1;
            const bodyRange = Math.abs(bc - bo);
            const cRange = bh - bl;
            const bodyPct = cRange === 0 ? 0 : (bodyRange / cRange) * 100;
            const distPast = sType === 'LONG' ? ((bc - orh) / orRange) * 100 : ((orl - bc) / orRange) * 100;

            // Calc max favorable excursion & max adverse excursion
            let mfe = 0, mae = 0;
            let hitT1 = false; // standard 1:1 OR range opposite stop
            const stopBase = sType === 'LONG' ? orl : orh;
            const riskBase = Math.abs(ePrice - stopBase);
            const targetBase = sType === 'LONG' ? ePrice + riskBase : ePrice - riskBase;

            let retestBounce = false, retestFail = false, touchedOR = false;
            let nextConf = false;

            if (bIdx + 1 < candles.length) {
                const nC = candles[bIdx + 1];
                if (sType === 'LONG' && parseFloat(nC.close) > bc) nextConf = true;
                if (sType === 'SHORT' && parseFloat(nC.close) < bc) nextConf = true;
            }

            // Question 2 Stops definitions
            const stopA = stopBase;
            const stopB = orl + (orRange / 2);
            const stopC = sType === 'LONG' ? bl : bh;
            const stopD = sType === 'LONG' ? ePrice * 0.995 : ePrice * 1.005;

            let hitA = false, hitB = false, hitC = false, hitD = false;
            let finalPriceA = null, finalPriceB = null, finalPriceC = null, finalPriceD = null;

            for (let i = bIdx + 1; i < candles.length; i++) {
                const c = candles[i];
                const ch = parseFloat(c.high), cl = parseFloat(c.low);

                if (sType === 'LONG') {
                    if (ch > ePrice) { const dist = ch - ePrice; if (dist > mfe) mfe = dist; }
                    if (cl < ePrice) { const dist = ePrice - cl; if (dist > mae) mae = dist; }

                    if (!hitT1 && ch >= targetBase && !hitA) hitT1 = true;

                    if (!hitA && cl <= stopA) { hitA = true; finalPriceA = stopA; }
                    if (!hitB && cl <= stopB) { hitB = true; finalPriceB = stopB; }
                    if (!hitC && cl <= stopC) { hitC = true; finalPriceC = stopC; }
                    if (!hitD && cl <= stopD) { hitD = true; finalPriceD = stopD; }

                    if (!touchedOR && cl <= orh) touchedOR = true;
                    if (touchedOR && ch > ePrice) retestBounce = true;
                    if (touchedOR && cl <= stopA) retestFail = true;

                } else {
                    if (cl < ePrice) { const dist = ePrice - cl; if (dist > mfe) mfe = dist; }
                    if (ch > ePrice) { const dist = ch - ePrice; if (dist > mae) mae = dist; }

                    if (!hitT1 && cl <= targetBase && !hitA) hitT1 = true;

                    if (!hitA && ch >= stopA) { hitA = true; finalPriceA = stopA; }
                    if (!hitB && ch >= stopB) { hitB = true; finalPriceB = stopB; }
                    if (!hitC && ch >= stopC) { hitC = true; finalPriceC = stopC; }
                    if (!hitD && ch >= stopD) { hitD = true; finalPriceD = stopD; }

                    if (!touchedOR && ch >= orl) touchedOR = true;
                    if (touchedOR && cl < ePrice) retestBounce = true;
                    if (touchedOR && ch >= stopA) retestFail = true;
                }
            }

            const isReal = mfe >= orRange;

            // Q1 Add
            q1.total++;
            if (isReal) {
                q1.real++;
                q1.realVolRatio.push(volRatio);
                q1.realBodyPct.push(bodyPct);
                q1.realDistPct.push(distPast);
                if (bIdx + 1 < candles.length) { q1.realHasNext++; if (nextConf) q1.realNextConf++; }
            } else {
                q1.fake++;
                q1.fakeVolRatio.push(volRatio);
                q1.fakeBodyPct.push(bodyPct);
                q1.fakeDistPct.push(distPast);
                if (bIdx + 1 < candles.length) { q1.fakeHasNext++; if (nextConf) q1.fakeNextConf++; }
            }
            if (touchedOR) {
                q1.retested++;
                if (retestBounce) q1.retestHeld++;
                if (retestFail) q1.retestFailed++;
            }

            // Q2 Add
            const eodPrice = parseFloat(candles[candles.length - 1].close);
            const calcStopEv = (hitX, fPriceX, stopLogicLossR) => {
                if (hitX) return stopLogicLossR;
                if (hitT1) return 1.0;
                // Drift
                if (sType === 'LONG') return (eodPrice - ePrice) / riskBase;
                return (ePrice - eodPrice) / riskBase;
            };

            q2.total++;
            if (hitA) q2.stopA.hit++; q2.stopA.winRs.push(calcStopEv(hitA, finalPriceA, -1.0));
            // Standardize EV relative to Stop A risk for comparison
            // Or relative to its own risk? "EV in R". Better its own risk.
            const riskB = Math.abs(ePrice - stopB) || 0.001;
            const driftR_B = sType === 'LONG' ? (eodPrice - ePrice) / riskB : (ePrice - eodPrice) / riskB;
            if (hitB) q2.stopB.hit++; q2.stopB.winRs.push(hitB ? -1.0 : (hitT1 ? (riskBase / riskB) : driftR_B));

            const riskC = Math.abs(ePrice - stopC) || 0.001;
            const driftR_C = sType === 'LONG' ? (eodPrice - ePrice) / riskC : (ePrice - eodPrice) / riskC;
            if (hitC) q2.stopC.hit++; q2.stopC.winRs.push(hitC ? -1.0 : (hitT1 ? (riskBase / riskC) : driftR_C));

            const riskD = Math.abs(ePrice - stopD) || 0.001;
            const driftR_D = sType === 'LONG' ? (eodPrice - ePrice) / riskD : (ePrice - eodPrice) / riskD;
            if (hitD) q2.stopD.hit++; q2.stopD.winRs.push(hitD ? -1.0 : (hitT1 ? (riskBase / riskD) : driftR_D));

            // Q3 Add
            q3.total++;
            q3.maxMoves.push(mfe / orRange);
            if (mfe >= 0.5 * orRange) q3.hit0_5x++;
            if (mfe >= 1.0 * orRange) q3.hit1_0x++;
            if (mfe >= 1.5 * orRange) q3.hit1_5x++;
            if (mfe >= 2.0 * orRange) q3.hit2_0x++;
            if (mfe >= 3.0 * orRange) q3.hit3_0x++;

            // Q4 Add
            const nGrp = nContext > 0.3 ? 'niftyUp' : (nContext < -0.3 ? 'niftyDown' : 'niftyFlat');
            const lOrS = sType === 'LONG' ? 'longs' : 'shorts';
            q4[nGrp][lOrS].total++;
            if (hitT1) q4[nGrp][lOrS].t1++;

            const vGrp = vContext < 13 ? 'vixCalm' : (vContext > 18 ? 'vixVolatile' : 'vixNormal');
            q4[vGrp][lOrS].total++;
            if (hitT1) q4[vGrp][lOrS].t1++;

            if (ema20) {
                const emGrp = ePrice > ema20 ? 'emaAbove' : 'emaBelow';
                q4[emGrp][lOrS].total++;
                if (hitT1) q4[emGrp][lOrS].t1++;
            }

            const pIdx = bIdx;
            let tGrp = 'time4';
            if (pIdx <= 2) tGrp = 'time1'; // 9:45, 10:15
            else if (pIdx <= 5) tGrp = 'time2'; // 10:45 to 11:45
            else if (pIdx <= 8) tGrp = 'time3'; // 12:15 to 13:15

            q4[tGrp].total++;
            if (hitT1) q4[tGrp].t1++;
        }
    }

    // Averages
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    console.log(`\n=== QUESTION 1: REAL VS FAKE ===`);
    console.log(`Total breakouts: ${q1.total}`);
    console.log(`Real: ${q1.real} (${((q1.real / q1.total) * 100).toFixed(1)}%)`);
    console.log(`Fake: ${q1.fake} (${((q1.fake / q1.total) * 100).toFixed(1)}%)`);

    console.log(`\nA) BREAKOUT CANDLE VOLUME vs average volume:`);
    console.log(`   Real breakouts avg volume ratio: ${avg(q1.realVolRatio).toFixed(2)}x`);
    console.log(`   Fake breakouts avg volume ratio: ${avg(q1.fakeVolRatio).toFixed(2)}x`);

    console.log(`\nB) BREAKOUT CANDLE BODY SIZE:`);
    console.log(`   Real: Avg candle body as % of range: ${avg(q1.realBodyPct).toFixed(1)}%`);
    console.log(`   Fake: Avg candle body as % of range: ${avg(q1.fakeBodyPct).toFixed(1)}%`);

    console.log(`\nC) HOW FAR PAST THE OR LEVEL:`);
    console.log(`   Real: Avg distance past OR level: ${avg(q1.realDistPct).toFixed(1)}%`);
    console.log(`   Fake: Avg distance past OR level: ${avg(q1.fakeDistPct).toFixed(1)}%`);

    console.log(`\nD) DID THE NEXT 30-MIN CANDLE CONFIRM?`);
    console.log(`   Real breakout + next candle continued: ${q1.realHasNext ? ((q1.realNextConf / q1.realHasNext) * 100).toFixed(1) : 0}%`);
    console.log(`   Fake breakout + next candle reversed:  ${q1.fakeHasNext ? (((q1.fakeHasNext - q1.fakeNextConf) / q1.fakeHasNext) * 100).toFixed(1) : 0}%`);

    console.log(`\nE) WAS THERE A RETEST?`);
    console.log(`   How many retested: ${((q1.retested / q1.total) * 100).toFixed(1)}%`);
    console.log(`   Retest + held: ${q1.retested ? ((q1.retestHeld / q1.retested) * 100).toFixed(1) : 0}%`);
    console.log(`   Retest + failed: ${q1.retested ? ((q1.retestFailed / q1.retested) * 100).toFixed(1) : 0}%`);


    console.log(`\n=== QUESTION 2: OPTIMAL STOP LOSS ===`);
    const sEv = (hit, evs) => `  ${((hit / q2.total) * 100).toFixed(1)}% stop hit rate | Avg winner: R calculation complex | EV: ${avg(evs).toFixed(3)}R`;
    console.log(`Stop A (Opposite OR): \n${sEv(q2.stopA.hit, q2.stopA.winRs)}`);
    console.log(`Stop B (Midpoint OR): \n${sEv(q2.stopB.hit, q2.stopB.winRs)}`);
    console.log(`Stop C (Breakout Candle L/H): \n${sEv(q2.stopC.hit, q2.stopC.winRs)}`);
    console.log(`Stop D (0.5% Fixed): \n${sEv(q2.stopD.hit, q2.stopD.winRs)}`);


    console.log(`\n=== QUESTION 3: OPTIMAL TARGET ===`);
    console.log(`Reached 0.5x OR range:  ${((q3.hit0_5x / q3.total) * 100).toFixed(1)}% of breakouts`);
    console.log(`Reached 1.0x OR range:  ${((q3.hit1_0x / q3.total) * 100).toFixed(1)}% of breakouts `);
    console.log(`Reached 1.5x OR range:  ${((q3.hit1_5x / q3.total) * 100).toFixed(1)}% of breakouts`);
    console.log(`Reached 2.0x OR range:  ${((q3.hit2_0x / q3.total) * 100).toFixed(1)}% of breakouts`);
    console.log(`Reached 3.0x OR range:  ${((q3.hit3_0x / q3.total) * 100).toFixed(1)}% of breakouts`);
    console.log(`Average maximum move before failure: ${avg(q3.maxMoves).toFixed(2)}x OR range`);
    console.log(`Winning trades (>=1R hit) hitting 1:2: ${((q3.hit2_0x / Math.max(1, q3.hit1_0x)) * 100).toFixed(1)}%`);
    console.log(`Winning trades (>=1R hit) hitting 1:3: ${((q3.hit3_0x / Math.max(1, q3.hit1_0x)) * 100).toFixed(1)}%`);


    console.log(`\n=== QUESTION 4: EXTERNAL FACTORS ===`);
    const pt = (grp) => `Long T1: ${grp.longs.total ? ((grp.longs.t1 / grp.longs.total) * 100).toFixed(1) : '0'}% | Short T1: ${grp.shorts.total ? ((grp.shorts.t1 / grp.shorts.total) * 100).toFixed(1) : '0'}%`;

    console.log(`A) NIFTY TREND:`);
    console.log(`   NIFTY up > 0.3%:   ${pt(q4.niftyUp)}`);
    console.log(`   NIFTY flat :       ${pt(q4.niftyFlat)}`);
    console.log(`   NIFTY down > 0.3%: ${pt(q4.niftyDown)}`);

    console.log(`\nB) VIX LEVEL: (Proxy Data)`);
    console.log(`   VIX < 13:      ${pt(q4.vixCalm)}`);
    console.log(`   VIX 13-18:     ${pt(q4.vixNormal)}`);
    console.log(`   VIX > 18:      ${pt(q4.vixVolatile)}`);

    console.log(`\nC) STOCK'S DAILY TREND:`);
    console.log(`   Stock above EMA20 + LONG breakout:  ${q4.emaAbove.longs.total ? ((q4.emaAbove.longs.t1 / q4.emaAbove.longs.total) * 100).toFixed(1) : 0}%`);
    console.log(`   Stock above EMA20 + SHORT breakout: ${q4.emaAbove.shorts.total ? ((q4.emaAbove.shorts.t1 / q4.emaAbove.shorts.total) * 100).toFixed(1) : 0}%`);
    console.log(`   Stock below EMA20 + LONG breakout:  ${q4.emaBelow.longs.total ? ((q4.emaBelow.longs.t1 / q4.emaBelow.longs.total) * 100).toFixed(1) : 0}%`);
    console.log(`   Stock below EMA20 + SHORT breakout: ${q4.emaBelow.shorts.total ? ((q4.emaBelow.shorts.t1 / q4.emaBelow.shorts.total) * 100).toFixed(1) : 0}%`);

    console.log(`\nD) TIME OF DAY:`);
    console.log(`   Before 10:15     : ${q4.time1.total ? ((q4.time1.t1 / q4.time1.total) * 100).toFixed(1) : 0}%`);
    console.log(`   10:15 - 12:00    : ${q4.time2.total ? ((q4.time2.t1 / q4.time2.total) * 100).toFixed(1) : 0}%`);
    console.log(`   12:00 - 13:30    : ${q4.time3.total ? ((q4.time3.t1 / q4.time3.total) * 100).toFixed(1) : 0}%`);
    console.log(`   After 13:30      : ${q4.time4.total ? ((q4.time4.t1 / q4.time4.total) * 100).toFixed(1) : 0}%`);

}

main().catch(console.error).finally(() => prisma.$disconnect());
