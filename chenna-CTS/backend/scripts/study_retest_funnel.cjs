const fs = require('fs');
const path = require('path');

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

async function main() {
    console.log("Analyzing Complete Retest Funnel...");

    // We'll read all cached symbols from the directory instead of DB to maximize sample size
    const allFiles = fs.readdirSync(CACHE_DIR_30M);
    const symbols = allFiles.map(f => f.replace('_master.json', ''));

    // Funnel stats
    let totalStockDays = 0;
    let totalBreakouts = 0;
    let totalRetests = 0;
    let retestHeld = 0;
    let retestFailed = 0;
    let noRetest = 0;
    let noRetestWins = 0;

    let totalHeldT1Hits = 0;
    let totalHeldT2Hits = 0;
    let totalHeldStops = 0;
    let totalHeldDrifts = 0;
    let totalHeldWinR = 0;
    let totalHeldDriftR = 0;

    const examples = [];

    // Process every single cached file
    for (const sym of symbols) {
        const data30 = load30mCache(sym);
        if (!data30) continue;

        const dates = Object.keys(data30).sort();
        for (const day of dates) {
            const candles = data30[day];
            if (candles.length < 5) continue;
            totalStockDays++;

            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;

            // Find Breakout (must occur before 13:30 for validity per previous findings)
            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i < candles.length && i <= 8; i++) { // <=8 means up to 13:00 candle close
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }
            if (bIdx === -1) continue;

            totalBreakouts++;

            const bCandle = candles[bIdx];
            // Stop C: Breakout candle low/high
            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);
            const risk = Math.abs(boPrice - baseStop);

            if (risk === 0) continue; // Invalid candle structure 

            let touchedOR = false;
            let retestBounce = false;
            let retestFail = false;
            let touchedIdx = -1;
            let entryPrice = 0;

            let hitT1 = false, hitT2 = false, hitStop = false;
            let currentMFE = 0;

            // Find Retest Phase
            for (let i = bIdx + 1; i < candles.length; i++) {
                const c = candles[i];
                const ch = parseFloat(c.high);
                const cl = parseFloat(c.low);
                const cc = parseFloat(c.close);

                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) {
                        touchedOR = true;
                        touchedIdx = i;
                        entryPrice = orh; // We enter precisely ON the OR line touch
                    }
                    if (touchedOR) {
                        // Did it hold or fail?
                        if (cc < orh) { // Close back inside the OR
                            retestFail = true;
                            break; // Sequence dead
                        } else if (ch > entryPrice + (risk * 0.5)) {
                            // Strong bounce off the level => HELD
                            retestBounce = true;
                        }
                    }
                } else {
                    if (!touchedOR && ch >= orl) {
                        touchedOR = true;
                        touchedIdx = i;
                        entryPrice = orl;
                    }
                    if (touchedOR) {
                        if (cc > orl) {
                            retestFail = true;
                            break;
                        } else if (cl < entryPrice - (risk * 0.5)) {
                            retestBounce = true;
                        }
                    }
                }
            }

            if (touchedOR) {
                totalRetests++;
                if (retestFail) {
                    retestFailed++;
                } else if (retestBounce) {
                    retestHeld++;

                    // Track execution specifically from the Entry point (the Retest Touch)
                    const actRisk = Math.abs(entryPrice - baseStop);
                    // if target is too tight because stop was too close, bound risk at minimum 0.5%
                    const boundedRisk = Math.max(actRisk, entryPrice * 0.005);
                    const t1 = sType === 'LONG' ? entryPrice + boundedRisk : entryPrice - boundedRisk;
                    const t2 = sType === 'LONG' ? entryPrice + (boundedRisk * 2) : entryPrice - (boundedRisk * 2);

                    let execT1 = false, execT2 = false, execStop = false, finalExecR = null;

                    for (let j = touchedIdx; j < candles.length; j++) {
                        const exc = candles[j];
                        const eh = parseFloat(exc.high), el = parseFloat(exc.low);

                        if (sType === 'LONG') {
                            if (el < baseStop) { execStop = true; finalExecR = -1; break; }
                            if (!execT1 && eh >= t1) execT1 = true;
                            if (eh >= t2) { execT2 = true; execT1 = true; finalExecR = 2; break; }
                        } else {
                            if (eh > baseStop) { execStop = true; finalExecR = -1; break; }
                            if (!execT1 && el <= t1) execT1 = true;
                            if (el <= t2) { execT2 = true; execT1 = true; finalExecR = 2; break; }
                        }
                    }

                    if (finalExecR === null) {
                        const eod = parseFloat(candles[candles.length - 1].close);
                        if (sType === 'LONG') finalExecR = (eod - entryPrice) / boundedRisk;
                        else finalExecR = (entryPrice - eod) / boundedRisk;
                        if (execT1) finalExecR = 1.0;
                    }

                    if (execT1) { totalHeldT1Hits++; totalHeldWinR += finalExecR > 0 ? finalExecR : 1.0; }
                    if (execT2) totalHeldT2Hits++;
                    if (execStop) { totalHeldStops++; }
                    if (!execT1 && !execStop) { totalHeldDrifts++; totalHeldDriftR += finalExecR; }

                    // Capture 5 clean examples
                    if (execT1 && examples.length < 5 && boundedRisk > (entryPrice * 0.005)) { // Don't show micro-stops
                        examples.push({ sym, day, sType, orh, orl, bIdx, touchedIdx, entryPrice, baseStop, t1, execT1, execT2, boundedRisk, candles });
                    }
                }
            } else {
                noRetest++;
                // Track no-retest direct wins for stats
                let directT1 = false;
                const dRisk = Math.max(risk, boPrice * 0.005);
                const dT1 = sType === 'LONG' ? boPrice + dRisk : boPrice - dRisk;
                for (let i = bIdx + 1; i < candles.length; i++) {
                    const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                    if (sType === 'LONG' && ch >= dT1) { directT1 = true; break; }
                    if (sType === 'SHORT' && cl <= dT1) { directT1 = true; break; }
                }
                if (directT1) noRetestWins++;
            }
        }
    }

    const unqDays = [...new Set(examples.map(x => x.day).concat(['2025-01-01', '2026-01-01']))].length; // Rough day count
    // Actual unique days from the whole cache:
    const tempDays = new Set();
    for (const sym of symbols) {
        const cd = load30mCache(sym);
        if (cd) Object.keys(cd).forEach(d => tempDays.add(d));
    }
    const totalDays = tempDays.size || 120;

    // EV math
    const avgWinR = totalHeldT1Hits > 0 ? (totalHeldWinR / totalHeldT1Hits) : 0;
    const avgDriftR = totalHeldDrifts > 0 ? (totalHeldDriftR / totalHeldDrifts) : 0;
    const triggerCount = retestHeld;
    const wr = triggerCount ? totalHeldT1Hits / triggerCount : 0;
    const sr = triggerCount ? totalHeldStops / triggerCount : 0;
    const dr = triggerCount ? totalHeldDrifts / triggerCount : 0;
    const ev = triggerCount ? ((wr * avgWinR) + (sr * -1) + (dr * avgDriftR)) : 0;

    console.log(`\n=== RETEST FUNNEL — FULL MATH ===\n`);
    console.log(`Dataset Scale: ${totalStockDays} Stock-Days analyzed across ~${totalDays} trading days.`);
    console.log(`Total 30m Breakouts: ${totalBreakouts} (Before 1:30 PM)`);
    console.log(`  -> Retested the OR level: ${totalRetests} (${((totalRetests / totalBreakouts) * 100).toFixed(1)}%)`);
    console.log(`      -> Retest HELD (Bounced off OR): ${retestHeld} (${((retestHeld / totalRetests) * 100).toFixed(1)}%)`);
    console.log(`          Win rate (T1 Hit): ${((totalHeldT1Hits / retestHeld) * 100).toFixed(1)}%`);
    console.log(`      -> Retest FAILED (Closed back inside): ${retestFailed} (${((retestFailed / totalRetests) * 100).toFixed(1)}%)`);
    console.log(`          [These are NO TRADE - Capital Protected]`);
    console.log(`  -> Never retested (Kept running): ${noRetest} (${((noRetest / totalBreakouts) * 100).toFixed(1)}%)`);
    console.log(`      -> Win rate of runners: ${((noRetestWins / noRetest) * 100).toFixed(1)}%`);

    console.log(`\n=== ACTIONABLE TRADING MECHANICS ===`);
    console.log(`Total Retest-Hold Entries (The Triggers): ${retestHeld}`);
    console.log(`Average precise entries per day: ${(retestHeld / totalDays).toFixed(2)} trades/day`);
    console.log(`Average precise entries per week: ${((retestHeld / totalDays) * 5).toFixed(1)} trades/week`);

    console.log(`\nOverall Win Rate on Execution: ${((totalHeldT1Hits / retestHeld) * 100).toFixed(1)}%`);
    console.log(`Stop Rate: ${((totalHeldStops / retestHeld) * 100).toFixed(1)}%`);
    console.log(`Drift Rate (EOD Exit): ${((totalHeldDrifts / retestHeld) * 100).toFixed(1)}%`);
    console.log(`Using Stop C (Breakout candle low/high bounding at 0.5% min):`);
    console.log(`  Avg winner: +${avgWinR.toFixed(2)}R`);
    console.log(`  Avg loser: -1.00R`);
    console.log(`  Avg drift: ${avgDriftR > 0 ? '+' + avgDriftR.toFixed(2) : avgDriftR.toFixed(2)}R`);
    console.log(`  EV per trade: ${ev > 0 ? '+' + ev.toFixed(3) : ev.toFixed(3)}R`);
    console.log(`  Total Absolute P&L (in R): +${(ev * retestHeld).toFixed(1)}R generated over dataset`);

    console.log(`\n=== 5 PERFECT CANDLE-BY-CANDLE EXAMPLES ===\n`);
    for (let i = 0; i < examples.length; i++) {
        const ex = examples[i];
        console.log(`Example ${i + 1}: Stock: ${ex.sym} | Date: ${ex.day}`);
        console.log(`  OR: High ₹${ex.orh} Low ₹${ex.orl}`);
        const bc = ex.candles[ex.bIdx];
        console.log(`  Breakout: Candle ${ex.bIdx + 1} (${bc.timeStr}), closed ${ex.sType === 'LONG' ? 'above' : 'below'} at ₹${bc.close}`);
        const rc = ex.candles[ex.touchedIdx];
        console.log(`  Retest: Candle ${ex.touchedIdx + 1} (${rc.timeStr}), pulled back exactly strictly to ₹${ex.entryPrice}`);
        console.log(`  Held: Bounced and did not close inside.`);
        console.log(`  Entry: ₹${ex.entryPrice.toFixed(2)}`);
        console.log(`  Stop: ₹${ex.baseStop.toFixed(2)} (Breakout candle extreme)`);
        console.log(`  Risk: ₹${ex.boundedRisk.toFixed(2)} (${((ex.boundedRisk / ex.entryPrice) * 100).toFixed(2)}% distance)`);
        console.log(`  Result: Hit T1 at ₹${ex.t1.toFixed(2)} (+1.00R)\n`);
    }
}

main().catch(console.error);
