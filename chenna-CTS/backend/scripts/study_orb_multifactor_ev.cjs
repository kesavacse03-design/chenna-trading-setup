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
    console.log("Loading universe from Database...");

    // Get ALL IB logs
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

    let totalExpected = ibCats.length;
    let totalCached = 0;

    // Pre-load caches
    const fileCache30m = {};
    const fileCacheDay = {};
    for (const sym of Array.from(allSymbolsSet)) {
        const c30 = load30mCache(sym);
        if (c30) fileCache30m[sym] = c30;

        const cD = loadDayCache(sym);
        if (cD) fileCacheDay[sym] = cD;
    }

    console.log(`\n=== DATASET DIAGNOSTIC ===`);
    console.log(`Total Dates with IB entries: ${sortedDates.length}`);
    console.log(`Total Stock-Day pairs expected in DB: ${totalExpected}`);

    // Check how many we actually have cache for
    for (const day of sortedDates) {
        for (const sym of dateMap[day]) {
            if (fileCache30m[sym] && fileCache30m[sym][day] && fileCache30m[sym][day].length >= 5) {
                totalCached++;
            }
        }
    }
    console.log(`Total Stock-Day pairs with fully cached 30-min data: ${totalCached}`);
    console.log(`Missing Data Reason: We only cached 1-minute and 30-minute data recently for a specific batch of 170~ symbols over the last 30~60 days. To reach 5,800, we'd need to bulk fetch 30-min Upstox data back 6 months for all those historical days. For this study, we strictly use the pristine cache we have available (${totalCached} samples).`);

    console.log(`\nRunning Combination Study on the ${totalCached} valid samples...`);

    const tests = {
        'A_Bottom_5_Body_Only': { total: 0, triggers: 0, longs: 0, shorts: 0, t1: 0, t2: 0, stop: 0, winR: 0, lossR: 0, driftR: 0, drifts: 0 },
        'B_Combined_Tight_Gap': { total: 0, triggers: 0, longs: 0, shorts: 0, t1: 0, t2: 0, stop: 0, winR: 0, lossR: 0, driftR: 0, drifts: 0 },
        'C_Tight_Plus_EMA20': { total: 0, triggers: 0, longs: 0, shorts: 0, t1: 0, t2: 0, stop: 0, winR: 0, lossR: 0, driftR: 0, drifts: 0 },
        'D_Tight_Plus_PrevHigh': { total: 0, triggers: 0, longs: 0, shorts: 0, t1: 0, t2: 0, stop: 0, winR: 0, lossR: 0, driftR: 0, drifts: 0 },
        'E_Tight_Plus_VolSurge': { total: 0, triggers: 0, longs: 0, shorts: 0, t1: 0, t2: 0, stop: 0, winR: 0, lossR: 0, driftR: 0, drifts: 0 },
        'F_Tight_Plus_TightRange': { total: 0, triggers: 0, longs: 0, shorts: 0, t1: 0, t2: 0, stop: 0, winR: 0, lossR: 0, driftR: 0, drifts: 0 }
    };

    for (const day of sortedDates) {
        const symbols = dateMap[day];
        const dayMetrics = [];

        for (const sym of symbols) {
            const data30 = fileCache30m[sym];
            if (!data30 || !data30[day]) continue;
            const c30Today = data30[day];
            if (c30Today.length < 5) continue;

            const dataDay = fileCacheDay[sym];
            if (!dataDay) continue;
            const targetDayIdx = dataDay.findIndex(c => c.date >= day);
            if (targetDayIdx < 1) continue;

            const prevDay = dataDay[targetDayIdx - 1];
            const ema20 = calcEMA(dataDay, targetDayIdx - 1, 20);
            const adv20 = calculateADV20(dataDay, targetDayIdx);

            const c1 = c30Today[0];
            const o = parseFloat(c1.open), h = parseFloat(c1.high), l = parseFloat(c1.low), c = parseFloat(c1.close), v = parseFloat(c1.volume);

            const gapPct = Math.abs((o - prevDay.close) / prevDay.close * 100);
            const gapDir = o > prevDay.close ? 'UP' : 'DOWN';
            const bodyPct = Math.abs(c - o) / o * 100;
            const rangePct = (h - l) / o * 100;
            const volSurge = adv20 ? (v / adv20) : 0;
            const prevCloseNearHigh = (prevDay.close - prevDay.low) / (prevDay.high - prevDay.low) > 0.8;

            // Determine ORB
            let triggered = false;
            let hitT1 = false, hitT2 = false, hitStop = false;
            let breakoutCandleIdx = -1, setupType = null;
            let entryPrice = 0, stopLoss = 0, finalR = null;
            let orbHigh = h, orbLow = l;

            for (let i = 1; i < c30Today.length; i++) {
                const cx = c30Today[i];
                const cls = parseFloat(cx.close);
                if (cls > orbHigh) {
                    breakoutCandleIdx = i; setupType = 'LONG'; entryPrice = cls; stopLoss = orbLow; triggered = true; break;
                } else if (cls < orbLow) {
                    breakoutCandleIdx = i; setupType = 'SHORT'; entryPrice = cls; stopLoss = orbHigh; triggered = true; break;
                }
            }

            if (triggered) {
                const risk = Math.abs(entryPrice - stopLoss);
                if (risk === 0) { triggered = false; }
                else {
                    const t1 = setupType === 'LONG' ? entryPrice + risk : entryPrice - risk;
                    const t2 = setupType === 'LONG' ? entryPrice + (2 * risk) : entryPrice - (2 * risk);

                    for (let j = breakoutCandleIdx + 1; j < c30Today.length; j++) {
                        const cx = c30Today[j];
                        const cxH = parseFloat(cx.high), cxL = parseFloat(cx.low);

                        if (setupType === 'LONG') {
                            if (cxL <= stopLoss) { hitStop = true; finalR = -1; break; }
                            if (!hitT1 && cxH >= t1) hitT1 = true;
                            if (cxH >= t2) { hitT2 = true; hitT1 = true; finalR = 2; break; }
                        } else {
                            if (cxH >= stopLoss) { hitStop = true; finalR = -1; break; }
                            if (!hitT1 && cxL <= t1) hitT1 = true;
                            if (cxL <= t2) { hitT2 = true; hitT1 = true; finalR = 2; break; }
                        }
                    }

                    if (finalR === null) {
                        // Drift
                        const eodExit = parseFloat(c30Today[c30Today.length - 1].close);
                        if (setupType === 'LONG') finalR = (eodExit - entryPrice) / risk;
                        else finalR = (entryPrice - eodExit) / risk;

                        // If it hit T1 but drifted, we assume 1R booked and stop at BE for the rest
                        if (hitT1) {
                            finalR = 1.0;
                        }
                    }
                }
            }

            const result = { sym, triggered, setupType, hitT1, hitT2, hitStop, finalR };
            dayMetrics.push({ sym, gapPct, gapDir, bodyPct, rangePct, volSurge, prevCloseNearHigh, ema20, prevClose: prevDay.close, result });
        }

        if (dayMetrics.length === 0) continue;

        // Base List
        const addTrig = (testKey, arr) => {
            for (const item of arr) {
                tests[testKey].total++;
                if (item.result.triggered) {
                    tests[testKey].triggers++;
                    if (item.result.setupType === 'LONG') tests[testKey].longs++; else tests[testKey].shorts++;
                    if (item.result.hitT1) tests[testKey].t1++;
                    if (item.result.hitT2) tests[testKey].t2++;
                    if (item.result.hitStop) {
                        tests[testKey].stop++;
                        tests[testKey].lossR += -1;
                    } else if (!item.result.hitT1 && !item.result.hitStop) {
                        tests[testKey].drifts++;
                        tests[testKey].driftR += item.result.finalR;
                    } else if (item.result.hitT1) {
                        if (item.result.hitT2) tests[testKey].winR += 2;
                        else tests[testKey].winR += 1; // Assuming strict T1 exit for avg calc (or 1R locked)
                    }
                }
            }
        };

        // Sort by Body % ascending
        const bodySort = [...dayMetrics].sort((a, b) => a.bodyPct - b.bodyPct);
        const bot10Body = bodySort.slice(0, 10);
        addTrig('A_Bottom_5_Body_Only', bot10Body.slice(0, 5));

        // Combine 1: Tight + Gap
        const gapSort = [...dayMetrics].sort((a, b) => b.gapPct - a.gapPct);
        const top10GapSet = new Set(gapSort.slice(0, 10).map(x => x.sym));
        const overlapGap = bot10Body.filter(x => top10GapSet.has(x.sym)).slice(0, 5);
        addTrig('B_Combined_Tight_Gap', overlapGap);

        // Combine 2: Tight + EMA20
        const overlapEMA = bot10Body.filter(x => {
            if (!x.ema20) return false;
            // Uptrend
            if (x.gapDir === 'UP') return x.prevClose > x.ema20;
            return x.prevClose < x.ema20;
        }).slice(0, 5);
        addTrig('C_Tight_Plus_EMA20', overlapEMA);

        // Combine 3: Tight + Prev High Close
        const overlapPrevH = bot10Body.filter(x => x.prevCloseNearHigh).slice(0, 5);
        addTrig('D_Tight_Plus_PrevHigh', overlapPrevH);

        // Combine 4: Tight + Vol Surge
        const overlapVol = bot10Body.filter(x => x.volSurge > 1.5).slice(0, 5);
        addTrig('E_Tight_Plus_VolSurge', overlapVol);

        // Combine 5: Tight Body + Tight Range (<1%)
        const overlapRange = bot10Body.filter(x => x.rangePct < 1.0).slice(0, 5);
        addTrig('F_Tight_Plus_TightRange', overlapRange);
    }

    // Print Logic
    console.log(`\n=== MULTI-FACTOR ORB EXPECTED VALUE (EV) STUDY ===\n`);
    for (const [key, b] of Object.entries(tests)) {
        console.log(`[ ${key} ]`);
        console.log(`  Total Evaluated : ${b.total} | Triggers: ${b.triggers} (${b.total > 0 ? ((b.triggers / b.total) * 100).toFixed(1) : 0}%)`);

        if (b.triggers > 0) {
            const t1 = (b.t1 / b.triggers) * 100;
            const t2 = (b.t2 / b.triggers) * 100;
            const stop = (b.stop / b.triggers) * 100;
            const driftHit = (b.drifts / b.triggers) * 100;

            const avgWinR = b.t1 > 0 ? (b.winR / b.t1) : 0;
            const avgDriftR = b.drifts > 0 ? (b.driftR / b.drifts) : 0;

            // Expected Value Formula
            const ev = ((b.t1 / b.triggers) * avgWinR) + ((b.stop / b.triggers) * -1) + ((b.drifts / b.triggers) * avgDriftR);

            console.log(`  Hit Rates: T1= ${t1.toFixed(1)}% | T2= ${t2.toFixed(1)}% | Stop= ${stop.toFixed(1)}% | Drift= ${driftHit.toFixed(1)}%`);
            console.log(`  Payouts  : Avg Win= +${avgWinR.toFixed(2)} R | Avg Drift= ${avgDriftR > 0 ? '+' : ''}${avgDriftR.toFixed(2)} R | Stop= -1.0 R`);
            console.log(`  EV/Trade : ${ev > 0 ? '+' + ev.toFixed(3) : ev.toFixed(3)} R`);
        }
        console.log('');
    }

    // Save to file for UI trace
    fs.writeFileSync(path.join(__dirname, 'clean_multifactor_ev_orb_out.txt'), "Completed.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
