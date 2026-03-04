const prisma = require('../lib/prisma.cjs');
const confirmationService = require('../services/confirmationService.cjs');
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


async function runStudy2() {
    console.log("=== HIGH_POWERED_STOCKS ORB STUDY ===");

    // 1. Get stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const hpsCat = await prisma.category.findUnique({ where: { key: 'HIGH_POWERED_STOCKS' } });

    if (!hpsCat) {
        console.log("Missing categories in DB.");
        return;
    }

    const hpsStocks = await prisma.stockCategory.findMany({
        where: {
            categoryId: hpsCat.id,
            addedDate: { gte: thirtyDaysAgo }
        },
        include: { stock: true }
    });

    // Prepare backtest data
    const hpsDatesObj = {};
    for (const s of hpsStocks) {
        if (!s.addedDate) continue;
        const dStr = s.addedDate.toISOString().split('T')[0];
        if (!hpsDatesObj[dStr]) hpsDatesObj[dStr] = [];
        hpsDatesObj[dStr].push(s.stock);
    }

    let totalSetups = 0;
    let longTriggers = 0;
    let shortTriggers = 0;
    let target1Hits = 0;
    let target2Hits = 0;
    let stopLossHits = 0;
    let eodExits = 0;

    console.log(`\nSimulating ORB on ${hpsStocks.length} HPS stocks over ${Object.keys(hpsDatesObj).length} days...`);

    for (const [targetDateStr, activeHpsStocks] of Object.entries(hpsDatesObj)) {

        for (const stock of activeHpsStocks) {
            totalSetups++;
            const sym = stock.symbol;

            const data30 = load30mCache(sym);
            if (!data30 || !data30[targetDateStr]) continue;

            const candles = data30[targetDateStr];
            if (candles.length < 2) continue;

            const dataDay = loadDayCache(sym);
            if (!dataDay) continue;
            const targetDayIdx = dataDay.findIndex(c => c.date === targetDateStr);
            if (targetDayIdx < 1) continue;

            const c1 = candles[0]; // 09:15-09:45
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;

            // Find breakout up to 12:00 (Index 5)
            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i < candles.length && i <= 5; i++) {
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }

            if (bIdx === -1) continue; // No breakout before 12:00

            if (sType === 'LONG') longTriggers++;
            if (sType === 'SHORT') shortTriggers++;

            const bCandle = candles[bIdx];
            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);
            const entryPrice = parseFloat(candles[bIdx + 1].open);

            if (isNaN(entryPrice)) continue;

            const trueRisk = Math.max(Math.abs(entryPrice - baseStop), entryPrice * 0.005);
            const targetT1 = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;
            const targetT2 = sType === 'LONG' ? entryPrice + (trueRisk * 2) : entryPrice - (trueRisk * 2);

            let outcome = null;
            let reachedT1 = false;

            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low), cc = parseFloat(candles[i].close);

                if (sType === 'LONG') {
                    // Check SL first
                    if (cl <= baseStop) { outcome = 'STOP'; break; }
                    if (ch >= targetT2) { outcome = 'T2'; reachedT1 = true; break; }
                    if (ch >= targetT1 && !reachedT1) { reachedT1 = true; }
                } else {
                    if (ch >= baseStop) { outcome = 'STOP'; break; }
                    if (cl <= targetT2) { outcome = 'T2'; reachedT1 = true; break; }
                    if (cl <= targetT1 && !reachedT1) { reachedT1 = true; }
                }
            }

            if (outcome === 'T2') target2Hits++;
            else if (outcome === 'STOP') stopLossHits++;
            else { eodExits++; } // Finished day still active

            if (reachedT1 && outcome !== 'T2') target1Hits++; // if hit T1 but didn't hit T2, still count as T1 hit
            if (outcome === 'T2') target1Hits++; // if hit T2, naturally hit T1
        }
    }

    console.log("\n=== ORB BACKTEST RESULTS (HIGH_POWERED_STOCKS) ===");
    console.log(`Total Days: ${Object.keys(hpsDatesObj).length}`);
    console.log(`Total Scanned Stocks: ${totalSetups}`);
    console.log(`Total Breakout Triggers: ${longTriggers + shortTriggers} (L: ${longTriggers}, S: ${shortTriggers})`);

    // Total Trades Executed isn't equal to triggers due to some returning NaN entry
    const totalExecuted = target2Hits + stopLossHits + eodExits;
    console.log(`Total Executed Trades: ${totalExecuted}`);

    if (totalExecuted > 0) {
        console.log(`Target 1 Hits: ${target1Hits} (${((target1Hits / totalExecuted) * 100).toFixed(2)}%)`);
        console.log(`Target 2 Hits: ${target2Hits} (${((target2Hits / totalExecuted) * 100).toFixed(2)}%)`);
        console.log(`Stop Loss Hits: ${stopLossHits} (${((stopLossHits / totalExecuted) * 100).toFixed(2)}%)`);
        console.log(`EOD Holds (No T2 or Stop hit): ${eodExits} (${((eodExits / totalExecuted) * 100).toFixed(2)}%)`);
    }
}

runStudy2().catch(e => console.error(e));
