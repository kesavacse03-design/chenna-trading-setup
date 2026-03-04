const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');

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

async function main() {
    console.log("=== COMPLETE IB OUTCOME MAP ===");

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
    for (const sym of Array.from(allSymbolsSet)) {
        const c30 = load30mCache(sym);
        if (c30) fileCache30m[sym] = c30;
    }

    let totalSamples = 0;
    let cat1_NoBreakout = 0;
    let cat2_Runner = 0;
    let cat3_RetestHeld = 0;
    let cat4_RetestFailed = 0;
    let cat5_IntraCandleStop = 0;

    // Runner Stats
    const runner = {
        long: { count: 0, t1: 0, t2: 0, maxMoves: [] },
        short: { count: 0, t1: 0, t2: 0, maxMoves: [] }
    };

    // Retest Held Stats
    const retestHeld = {
        long: { count: 0, t1: 0 },
        short: { count: 0, t1: 0 }
    };

    // Retest Failed Stats
    const retestFailAftermath = {
        reversedToOtherSide: 0,
        stayedChoppy: 0,
        brokeOutAgain: 0
    };

    // Overall Breakout Direction Stats
    const overall = {
        long: { count: 0, runners: 0, runT1: 0, held: 0, heldT1: 0, failed: 0, intraStop: 0 },
        short: { count: 0, runners: 0, runT1: 0, held: 0, heldT1: 0, failed: 0, intraStop: 0 }
    };

    for (const day of sortedDates) {
        for (const sym of dateMap[day]) {
            const data30 = fileCache30m[sym];
            if (!data30 || !data30[day]) continue;
            const candles = data30[day];
            if (candles.length < 5) continue;

            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;

            totalSamples++;

            // Breakout detection
            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i < candles.length && i <= 8; i++) { // <= 13:30
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }

            if (bIdx === -1) {
                cat1_NoBreakout++;
                continue;
            }

            const dirStats = sType === 'LONG' ? overall.long : overall.short;
            dirStats.count++;

            const bCandle = candles[bIdx];
            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);
            const risk = Math.max(Math.abs(boPrice - baseStop), boPrice * 0.005);
            const dt1 = sType === 'LONG' ? boPrice + risk : boPrice - risk;
            const dt2 = sType === 'LONG' ? boPrice + (risk * 2) : boPrice - (risk * 2);

            let touchedOR = false;
            let retestBounce = false;
            let retestFail = false;
            let piercedStopDuringRetestCandle = false;
            let touchedIdx = -1;
            let entryPrice = 0;

            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low), cc = parseFloat(candles[i].close);

                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) {
                        touchedOR = true; touchedIdx = i; entryPrice = orh;
                        if (cl <= baseStop) piercedStopDuringRetestCandle = true;
                    }
                    if (touchedOR) {
                        if (cc < orh) { retestFail = true; break; }
                        else if (ch > entryPrice + (risk * 0.5)) { retestBounce = true; }
                    }
                } else {
                    if (!touchedOR && ch >= orl) {
                        touchedOR = true; touchedIdx = i; entryPrice = orl;
                        if (ch >= baseStop) piercedStopDuringRetestCandle = true;
                    }
                    if (touchedOR) {
                        if (cc > orl) { retestFail = true; break; }
                        else if (cl < entryPrice - (risk * 0.5)) { retestBounce = true; }
                    }
                }
            }

            if (!touchedOR) {
                // CATEGORY 2: RUNNER
                cat2_Runner++;
                dirStats.runners++;
                const rstats = sType === 'LONG' ? runner.long : runner.short;
                rstats.count++;

                let maxFavorable = 0;
                let hitT1 = false, hitT2 = false;
                for (let i = bIdx + 1; i < candles.length; i++) {
                    const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                    if (sType === 'LONG') {
                        if (ch > boPrice) maxFavorable = Math.max(maxFavorable, ch - boPrice);
                        if (!hitT1 && ch >= dt1) hitT1 = true;
                        if (!hitT2 && ch >= dt2) hitT2 = true;
                    } else {
                        if (cl < boPrice) maxFavorable = Math.max(maxFavorable, boPrice - cl);
                        if (!hitT1 && cl <= dt1) hitT1 = true;
                        if (!hitT2 && cl <= dt2) hitT2 = true;
                    }
                }
                if (hitT1) { rstats.t1++; dirStats.runT1++; }
                if (hitT2) rstats.t2++;
                rstats.maxMoves.push(maxFavorable / orRange);

            } else {
                if (piercedStopDuringRetestCandle) {
                    // CATEGORY 5: INTRA-CANDLE STOP
                    cat5_IntraCandleStop++;
                    dirStats.intraStop++;
                } else if (retestFail) {
                    // CATEGORY 4: RETEST FAILED
                    cat4_RetestFailed++;
                    dirStats.failed++;

                    // What happened after?
                    let reversedToOtherSide = false;
                    let brokeOutAgain = false;
                    for (let i = touchedIdx + 1; i < candles.length; i++) {
                        const cc = parseFloat(candles[i].close);
                        if (sType === 'LONG') {
                            if (cc < orl) reversedToOtherSide = true;
                            if (cc > orh) brokeOutAgain = true;
                        } else {
                            if (cc > orh) reversedToOtherSide = true;
                            if (cc < orl) brokeOutAgain = true;
                        }
                    }
                    if (reversedToOtherSide) retestFailAftermath.reversedToOtherSide++;
                    else if (brokeOutAgain) retestFailAftermath.brokeOutAgain++;
                    else retestFailAftermath.stayedChoppy++;

                } else if (retestBounce) {
                    // CATEGORY 3: RETEST HELD
                    cat3_RetestHeld++;
                    dirStats.held++;
                    const hstats = sType === 'LONG' ? retestHeld.long : retestHeld.short;
                    hstats.count++;

                    const t1 = sType === 'LONG' ? entryPrice + risk : entryPrice - risk;
                    let hitT1 = false;
                    for (let i = touchedIdx; i < candles.length; i++) {
                        const eh = parseFloat(candles[i].high), el = parseFloat(candles[i].low);
                        if (sType === 'LONG' && eh >= t1) hitT1 = true;
                        if (sType === 'SHORT' && el <= t1) hitT1 = true;
                    }
                    if (hitT1) { hstats.t1++; dirStats.heldT1++; }
                }
            }
        }
    }

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const pct = (num, denom) => denom ? ((num / denom) * 100).toFixed(1) : '0.0';

    console.log(`TOTAL IB STOCK-DAYS: ${totalSamples}\n`);

    console.log(`CATEGORY 1: NO BREAKOUT (stayed inside OR all day or broke too late)`);
    console.log(`  Count: ${cat1_NoBreakout}`);
    console.log(`  % of total: ${pct(cat1_NoBreakout, totalSamples)}%\n`);

    console.log(`CATEGORY 2: BREAKOUT → NO RETEST (kept running)`);
    console.log(`  Count: ${cat2_Runner}`);
    console.log(`  `);
    console.log(`  Of these runners:`);
    console.log(`  LONG runners (broke above OR_High, never came back):`);
    console.log(`    Count: ${runner.long.count}`);
    console.log(`    Hit T1 (1:1): ${pct(runner.long.t1, runner.long.count)}%`);
    console.log(`    Hit T2 (1:2): ${pct(runner.long.t2, runner.long.count)}%`);
    console.log(`    Average max move: ${avg(runner.long.maxMoves).toFixed(2)}x OR range`);
    console.log(`    `);
    console.log(`  SHORT runners (broke below OR_Low, never came back):`);
    console.log(`    Count: ${runner.short.count}`);
    console.log(`    Hit T1 (1:1): ${pct(runner.short.t1, runner.short.count)}%`);
    console.log(`    Hit T2 (1:2): ${pct(runner.short.t2, runner.short.count)}%`);
    console.log(`    Average max move: ${avg(runner.short.maxMoves).toFixed(2)}x OR range\n`);

    console.log(`CATEGORY 3: BREAKOUT → RETEST → HELD (our entry)`);
    console.log(`  Count: ${cat3_RetestHeld}`);
    console.log(`  `);
    console.log(`  LONG retest-hold entries:`);
    console.log(`    Count: ${retestHeld.long.count}`);
    console.log(`    T1 hit: ${pct(retestHeld.long.t1, retestHeld.long.count)}%`);
    console.log(`    `);
    console.log(`  SHORT retest-hold entries:`);
    console.log(`    Count: ${retestHeld.short.count}`);
    console.log(`    T1 hit: ${pct(retestHeld.short.t1, retestHeld.short.count)}%\n`);

    console.log(`CATEGORY 4: BREAKOUT → RETEST → FAILED (no trade)`);
    console.log(`  Count: ${cat4_RetestFailed}`);
    console.log(`  `);
    console.log(`  What happened AFTER the retest failed?`);
    console.log(`  Reversed to other side of OR: ${retestFailAftermath.reversedToOtherSide}`);
    console.log(`  Stayed choppy inside OR: ${retestFailAftermath.stayedChoppy}`);
    console.log(`  Eventually broke out again later: ${retestFailAftermath.brokeOutAgain}\n`);

    console.log(`CATEGORY 5: BREAKOUT → RETEST → STOP HIT INTRA-CANDLE`);
    console.log(`  Count: ${cat5_IntraCandleStop}\n`);

    console.log(`FULL MAP:`);
    console.log(`  Cat 1 (No breakout):       ${cat1_NoBreakout.toString().padEnd(5)} | ${pct(cat1_NoBreakout, totalSamples)}%`);
    console.log(`  Cat 2 (Runner no retest):  ${cat2_Runner.toString().padEnd(5)} | ${pct(cat2_Runner, totalSamples)}%`);
    console.log(`  Cat 3 (Retest held):       ${cat3_RetestHeld.toString().padEnd(5)} | ${pct(cat3_RetestHeld, totalSamples)}%`);
    console.log(`  Cat 4 (Retest failed):     ${cat4_RetestFailed.toString().padEnd(5)} | ${pct(cat4_RetestFailed, totalSamples)}%`);
    console.log(`  Cat 5 (Intra-candle stop): ${cat5_IntraCandleStop.toString().padEnd(5)} | ${pct(cat5_IntraCandleStop, totalSamples)}%`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  Total:                     ${totalSamples.toString().padEnd(5)} | 100.0%\n`);

    console.log(`\nALL LONG breakouts (above OR_High):`);
    console.log(`  Total: ${overall.long.count}`);
    console.log(`  Runners: ${overall.long.runners} | T1: ${pct(overall.long.runT1, overall.long.runners)}%`);
    console.log(`  Retest held: ${overall.long.held} | T1: ${pct(overall.long.heldT1, overall.long.held)}%`);
    console.log(`  Retest failed: ${overall.long.failed}`);
    console.log(`  Intra-candle stop: ${overall.long.intraStop}\n`);

    console.log(`ALL SHORT breakouts (below OR_Low):`);
    console.log(`  Total: ${overall.short.count}`);
    console.log(`  Runners: ${overall.short.runners} | T1: ${pct(overall.short.runT1, overall.short.runners)}%`);
    console.log(`  Retest held: ${overall.short.held} | T1: ${pct(overall.short.heldT1, overall.short.held)}%`);
    console.log(`  Retest failed: ${overall.short.failed}`);
    console.log(`  Intra-candle stop: ${overall.short.intraStop}\n`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
