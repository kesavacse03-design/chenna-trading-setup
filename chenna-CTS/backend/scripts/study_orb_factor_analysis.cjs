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
    for (let i = targetDateIdx - 20; i < targetDateIdx; i++) sumVol += dayData[i].volume || 0;
    return sumVol / 20;
}

// Track states for factors
const factorStats = {
    // F1: NIFTY Context
    niftyUp: { long: { total: 0, t1: 0 }, short: { total: 0, t1: 0 } },
    niftyFlat: { long: { total: 0, t1: 0 }, short: { total: 0, t1: 0 } },
    niftyDown: { long: { total: 0, t1: 0 }, short: { total: 0, t1: 0 } },

    // F2: Daily Trend (EMA20)
    emaAbove: { long: { total: 0, t1: 0 }, short: { total: 0, t1: 0 } },
    emaBelow: { long: { total: 0, t1: 0 }, short: { total: 0, t1: 0 } },

    // F3: Prev Day
    prevGreen: { long: { total: 0, t1: 0 }, short: { total: 0, t1: 0 } },
    prevRed: { long: { total: 0, t1: 0 }, short: { total: 0, t1: 0 } },
    prevVolatile: { total: 0, t1: 0 },
    prevQuiet: { total: 0, t1: 0 },

    // F4: Gap
    gapUpBig: { total: 0, t1: 0 },
    gapUpSmall: { total: 0, t1: 0 },
    gapFlat: { total: 0, t1: 0 },
    gapDownSmall: { total: 0, t1: 0 },
    gapDownBig: { total: 0, t1: 0 },

    // F5: OR Size
    orTight: { total: 0, t1: 0 },
    orMed1: { total: 0, t1: 0 },
    orMed2: { total: 0, t1: 0 },
    orWide: { total: 0, t1: 0 },

    // F6: BO Volume
    volHigh: { total: 0, t1: 0 },
    volMed: { total: 0, t1: 0 },
    volLow: { total: 0, t1: 0 },

    // F7: Time
    time2: { total: 0, t1: 0 },
    time3: { total: 0, t1: 0 },
    time4: { total: 0, t1: 0 },
    time5: { total: 0, t1: 0 },
    time6: { total: 0, t1: 0 },

    // F8: Entry Type
    runnerLong: { total: 0, t1: 0 },
    runnerShort: { total: 0, t1: 0 },
    retestLong: { total: 0, t1: 0 },
    retestShort: { total: 0, t1: 0 },

    // F9: Sector Alignment 
    sectAligned: { total: 0, t1: 0 },
    sectOpposite: { total: 0, t1: 0 },
};

// Timing & Execution Studies
const executionStats = {
    boInstant: 0,
    boCrossed: 0,
    crossGapPct: [],

    earlyWarnHit: 0,
    earlyWarnTriggeredNext: 0,

    retestDelay1: 0,
    retestDelay2: 0,
    retestDelay3Plus: 0,

    runnerSlippageCount: 0,
    runnerSlippageTotal: 0,
    runnerSlippageT1Hits: 0
};

async function main() {
    console.log("=== INTRADAY CONFIDENCE SCORE FACTOR ANALYSIS ===");

    const ibCats = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } },
        include: { stock: true }
    });

    const dateMap = {};
    const symObjMap = {};
    const allSymbolsSet = new Set();

    for (const r of ibCats) {
        if (!r.addedDate || !r.stock) continue;
        const dt = r.addedDate.toISOString().split('T')[0];
        const sym = r.stock.symbol;
        allSymbolsSet.add(sym);
        symObjMap[sym] = r.stock;
        if (!dateMap[dt]) dateMap[dt] = [];
        dateMap[dt].push(sym);
    }

    const sortedDates = Object.keys(dateMap).sort();

    const fileCache30m = {};
    const fileCacheDay = {};
    for (const sym of Array.from(allSymbolsSet)) {
        if (sym === 'NIFTY_50') continue;
        const c30 = load30mCache(sym);
        if (c30) fileCache30m[sym] = c30;
        const cD = loadDayCache(sym);
        if (cD) fileCacheDay[sym] = cD;
    }

    const niftyData = loadDayCache('NIFTY_50') || loadDayCache('NIFTY 50');
    let niftyMap = {};
    if (niftyData) {
        for (let i = 1; i < niftyData.length; i++) {
            niftyMap[niftyData[i].date] = { prevClose: niftyData[i - 1].close, open: niftyData[i].open };
        }
    }

    for (const day of sortedDates) {
        for (const sym of dateMap[day]) {
            const data30 = fileCache30m[sym];
            if (!data30 || !data30[day]) continue;
            const candles = data30[day];
            if (candles.length < 5) continue;

            const dataDay = fileCacheDay[sym];
            if (!dataDay) continue;
            const targetDayIdx = dataDay.findIndex(c => c.date >= day);
            if (targetDayIdx < 1) continue;

            const prevDay = dataDay[targetDayIdx - 1];
            const ema20 = calcEMA(dataDay, targetDayIdx - 1, 20);
            const adv20 = calculateADV20(dataDay, targetDayIdx) || candles[0].volume;

            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;
            const orRangePct = (orRange / parseFloat(c1.open)) * 100;
            const gapPct = ((parseFloat(c1.open) - prevDay.close) / prevDay.close) * 100;

            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i < candles.length && i <= 8; i++) { // <= 13:30 limit
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }
            if (bIdx === -1) continue;

            // Early Warning Predictor
            if (bIdx > 1) { // must have a candle before it
                const preC = candles[bIdx - 1];
                const preH = parseFloat(preC.high), preL = parseFloat(preC.low);
                if (sType === 'LONG' && preH >= orh * 0.997 && preH <= orh) {
                    executionStats.earlyWarnHit++;
                    executionStats.earlyWarnTriggeredNext++;
                }
                if (sType === 'SHORT' && preL <= orl * 1.003 && preL >= orl) {
                    executionStats.earlyWarnHit++;
                    executionStats.earlyWarnTriggeredNext++;
                }
            }

            const bCandle = candles[bIdx];
            // Instant vs Crossed
            if (sType === 'LONG') {
                if (parseFloat(bCandle.open) > orh) executionStats.boInstant++;
                else {
                    executionStats.boCrossed++;
                    executionStats.crossGapPct.push(((orh - parseFloat(bCandle.low)) / orh) * 100);
                }
            } else {
                if (parseFloat(bCandle.open) < orl) executionStats.boInstant++;
                else {
                    executionStats.boCrossed++;
                    executionStats.crossGapPct.push(((parseFloat(bCandle.high) - orl) / orl) * 100);
                }
            }

            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);
            const risk = Math.max(Math.abs(boPrice - baseStop), boPrice * 0.005);

            let touchedOR = false, touchedIdx = -1, retestBounce = false, retestFail = false, piercedIntra = false, entryPrice = 0;

            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low), cc = parseFloat(candles[i].close);
                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) { touchedOR = true; touchedIdx = i; entryPrice = orh; if (cl <= baseStop) piercedIntra = true; }
                    if (touchedOR) { if (cc < orh) { retestFail = true; break; } else if (ch > entryPrice + (risk * 0.5)) { retestBounce = true; } }
                } else {
                    if (!touchedOR && ch >= orl) { touchedOR = true; touchedIdx = i; entryPrice = orl; if (ch >= baseStop) piercedIntra = true; }
                    if (touchedOR) { if (cc > orl) { retestFail = true; break; } else if (cl < entryPrice - (risk * 0.5)) { retestBounce = true; } }
                }
            }

            let isEntry = false;
            let entryCategory = '';
            let isWin = false;

            if (!touchedOR) {
                // RUNNER
                isEntry = true;
                entryCategory = 'RUNNER';

                // Track execution slippage entering at NEXT candle OPEN
                if (bIdx + 1 < candles.length) {
                    executionStats.runnerSlippageCount++;
                    const nextOpen = parseFloat(candles[bIdx + 1].open);
                    const slipPct = Math.abs((nextOpen - boPrice) / boPrice) * 100;
                    executionStats.runnerSlippageTotal += slipPct;

                    const slipRisk = Math.max(Math.abs(nextOpen - baseStop), nextOpen * 0.005);
                    const slipT1 = sType === 'LONG' ? nextOpen + slipRisk : nextOpen - slipRisk;
                    let slipHitT1 = false;
                    for (let j = bIdx + 1; j < candles.length; j++) {
                        const eh = parseFloat(candles[j].high), el = parseFloat(candles[j].low);
                        if (sType === 'LONG' && eh >= slipT1) slipHitT1 = true;
                        if (sType === 'SHORT' && el <= slipT1) slipHitT1 = true;
                    }
                    if (slipHitT1) {
                        executionStats.runnerSlippageT1Hits++;
                        isWin = true;
                    }
                }
            } else if (retestBounce && !piercedIntra) {
                // RETEST HELD
                isEntry = true;
                entryCategory = 'RETEST';

                const delayStr = (touchedIdx - bIdx);
                if (delayStr === 1) executionStats.retestDelay1++;
                else if (delayStr === 2) executionStats.retestDelay2++;
                else executionStats.retestDelay3Plus++;

                const rT1 = sType === 'LONG' ? entryPrice + risk : entryPrice - risk;
                for (let j = touchedIdx; j < candles.length; j++) {
                    const eh = parseFloat(candles[j].high), el = parseFloat(candles[j].low);
                    if (sType === 'LONG' && eh >= rT1) { isWin = true; break; }
                    if (sType === 'SHORT' && el <= rT1) { isWin = true; break; }
                }
            }

            if (isEntry) {
                const addF = (obj) => { obj.total++; if (isWin) obj.t1++; };

                // FACTOR 1: NIFTY TREND
                if (niftyMap[day]) {
                    // Use NIFTY open to current 30m? Actually, let's just use NIFTY open compared to NIFTY prevClose to measure macro mood.
                    const nPct = ((niftyMap[day].open - niftyMap[day].prevClose) / niftyMap[day].prevClose) * 100;
                    const sd = sType === 'LONG' ? 'long' : 'short';
                    if (nPct > 0.3) addF(factorStats.niftyUp[sd]);
                    else if (nPct < -0.3) addF(factorStats.niftyDown[sd]);
                    else addF(factorStats.niftyFlat[sd]);
                }

                // FACTOR 2: DAILY TREND
                if (ema20) {
                    const sd = sType === 'LONG' ? 'long' : 'short';
                    if (prevDay.close > ema20) addF(factorStats.emaAbove[sd]);
                    else addF(factorStats.emaBelow[sd]);
                }

                // FACTOR 3: PREV DAY
                const pGreen = prevDay.close > prevDay.open;
                const sd = sType === 'LONG' ? 'long' : 'short';
                if (pGreen) addF(factorStats.prevGreen[sd]); else addF(factorStats.prevRed[sd]);

                const pRange = ((prevDay.high - prevDay.low) / prevDay.low) * 100;
                if (pRange > 2.0) addF(factorStats.prevVolatile); else addF(factorStats.prevQuiet);

                // FACTOR 4: GAP
                if (gapPct > 1.0) addF(factorStats.gapUpBig);
                else if (gapPct > 0) addF(factorStats.gapUpSmall);
                else if (gapPct > -0.5) addF(factorStats.gapFlat);
                else if (gapPct > -1.0) addF(factorStats.gapDownSmall);
                else addF(factorStats.gapDownBig);

                // FACTOR 5: OR SIZE
                if (orRangePct < 0.5) addF(factorStats.orTight);
                else if (orRangePct < 1.0) addF(factorStats.orMed1);
                else if (orRangePct < 1.5) addF(factorStats.orMed2);
                else addF(factorStats.orWide);

                // FACTOR 6: VOLUME
                const boVol = parseFloat(bCandle.volume);
                const avgV = adv20 / 13; // rough 30m avg
                const vRat = boVol / avgV;
                if (vRat > 2) addF(factorStats.volHigh);
                else if (vRat > 1) addF(factorStats.volMed);
                else addF(factorStats.volLow);

                // FACTOR 7: TIME
                if (bIdx === 1) addF(factorStats.time2);
                else if (bIdx === 2) addF(factorStats.time3);
                else if (bIdx === 3) addF(factorStats.time4);
                else if (bIdx === 4) addF(factorStats.time5);
                else addF(factorStats.time6);

                // FACTOR 8: ENTRY TYPE
                if (entryCategory === 'RUNNER') {
                    if (sType === 'LONG') addF(factorStats.runnerLong); else addF(factorStats.runnerShort);
                } else {
                    if (sType === 'LONG') addF(factorStats.retestLong); else addF(factorStats.retestShort);
                }
            }
        }
    }

    const pct = (num, denom) => denom ? ((num / denom) * 100).toFixed(1) : '0.0';
    const logF = (name, obj) => { console.log(`  ${name.padEnd(25)}: ${obj.total.toString().padStart(3)} | T1: ${pct(obj.t1, obj.total).padStart(5)}%`); };
    const logFB = (name, obj, sd) => { console.log(`  ${name.padEnd(25)} [${sd.toUpperCase()}]: ${obj[sd].total.toString().padStart(3)} | T1: ${pct(obj[sd].t1, obj[sd].total).padStart(5)}%`); };

    console.log(`\n=== FACTOR ANALYSIS (172 Viable Triggers) ===`);

    console.log(`\nFACTOR 1: NIFTY TREND (Open Context)`);
    logFB('NIFTY up > 0.3%', factorStats.niftyUp, 'long');
    logFB('NIFTY up > 0.3%', factorStats.niftyUp, 'short');
    logFB('NIFTY flat', factorStats.niftyFlat, 'long');
    logFB('NIFTY flat', factorStats.niftyFlat, 'short');
    logFB('NIFTY down < -0.3%', factorStats.niftyDown, 'long');
    logFB('NIFTY down < -0.3%', factorStats.niftyDown, 'short');

    console.log(`\nFACTOR 2: STOCK'S PRE-TREND (EMA20)`);
    logFB('Above EMA20', factorStats.emaAbove, 'long');
    logFB('Above EMA20', factorStats.emaAbove, 'short');
    logFB('Below EMA20', factorStats.emaBelow, 'long');
    logFB('Below EMA20', factorStats.emaBelow, 'short');

    console.log(`\nFACTOR 3: PREV DAY`);
    logFB('Prev Day GREEN', factorStats.prevGreen, 'long');
    logFB('Prev Day GREEN', factorStats.prevGreen, 'short');
    logFB('Prev Day RED', factorStats.prevRed, 'long');
    logFB('Prev Day RED', factorStats.prevRed, 'short');
    logF('Prev Volatile (>2%)', factorStats.prevVolatile);
    logF('Prev Quiet (<2%)', factorStats.prevQuiet);

    console.log(`\nFACTOR 4: GAP FROM PREV CLOSE`);
    logF('Gap Up > 1%', factorStats.gapUpBig);
    logF('Gap Up 0-1%', factorStats.gapUpSmall);
    logF('Flat', factorStats.gapFlat);
    logF('Gap Down 0-1%', factorStats.gapDownSmall);
    logF('Gap Down > 1%', factorStats.gapDownBig);

    console.log(`\nFACTOR 5: OR RANGE SIZE`);
    logF('OR < 0.5%', factorStats.orTight);
    logF('OR 0.5-1.0%', factorStats.orMed1);
    logF('OR 1.0-1.5%', factorStats.orMed2);
    logF('OR > 1.5%', factorStats.orWide);

    console.log(`\nFACTOR 6: BREAKOUT VOLUME`);
    logF('Vol > 2x Avg', factorStats.volHigh);
    logF('Vol 1-2x Avg', factorStats.volMed);
    logF('Vol < 1x Avg', factorStats.volLow);

    console.log(`\nFACTOR 7: TIME OF BREAKOUT`);
    logF('09:45 (Candle 2)', factorStats.time2);
    logF('10:15 (Candle 3)', factorStats.time3);
    logF('10:45 (Candle 4)', factorStats.time4);
    logF('11:15 (Candle 5)', factorStats.time5);
    logF('11:45 (Candle 6)', factorStats.time6);

    console.log(`\nFACTOR 8: ENTRY TYPE`);
    logF('Runner LONG', factorStats.runnerLong);
    logF('Runner SHORT', factorStats.runnerShort);
    logF('Retest LONG', factorStats.retestLong);
    logF('Retest SHORT', factorStats.retestShort);

    console.log(`\n=== EXECUTION LEAD TIME & SLIPPAGE ANALYSIS ===`);

    console.log(`\n1. BO CANDLE ANATOMY:`);
    console.log(`  Instant Breakouts (Candle opened past OR): ${executionStats.boInstant}`);
    console.log(`  Crossed Breakouts (Candle started inside, broke out during): ${executionStats.boCrossed}`);
    if (executionStats.crossGapPct.length > 0) {
        console.log(`  Avg distance from OR level at crossed point: ${(executionStats.crossGapPct.reduce((a, b) => a + b, 0) / executionStats.crossGapPct.length).toFixed(3)}%`);
    }

    console.log(`\n2. EARLY WARNING PREDICTOR:`);
    console.log(`  "Setup Forming" (Candle prior pressed against OR level <0.3%): ${executionStats.earlyWarnHit} cases`);
    if (executionStats.earlyWarnHit) {
        console.log(`  -> Actual Breakout occurred on next candle: ${pct(executionStats.earlyWarnTriggeredNext, executionStats.earlyWarnHit)}%`);
    }

    console.log(`\n3. RETEST DELAY ANATOMY (Limit Order Preparation Time):`);
    const tot = executionStats.retestDelay1 + executionStats.retestDelay2 + executionStats.retestDelay3Plus;
    console.log(`  Retest on NEXT candle (30m to prep limit): ${pct(executionStats.retestDelay1, tot)}%`);
    console.log(`  Retest 2 candles later (1 hour to prep):   ${pct(executionStats.retestDelay2, tot)}%`);
    console.log(`  Retest 3+ candles later:                   ${pct(executionStats.retestDelay3Plus, tot)}%`);

    console.log(`\n4. RUNNER REALITY CHECK (Slippage Simulation):`);
    console.log(`  Entering at NEXT CANDLE OPEN instead of Breakout Close.`);
    console.log(`  Average real-world slippage penalty: ${(executionStats.runnerSlippageTotal / executionStats.runnerSlippageCount).toFixed(3)}%`);
    console.log(`  Simulated Real-World Runner Win Rate: ${pct(executionStats.runnerSlippageT1Hits, executionStats.runnerSlippageCount)}%`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
