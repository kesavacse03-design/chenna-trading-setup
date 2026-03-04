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

function calculateADV20(dayData, targetDateIdx) {
    if (targetDateIdx < 20) return null;
    let sumVol = 0;
    for (let i = targetDateIdx - 20; i < targetDateIdx; i++) sumVol += dayData[i].volume || 0;
    return sumVol / 20;
}

function scoreTrade(factors) {
    let score = 0;

    // F1: Breakout Volume (max 30)
    if (factors.volObj.vRat < 1) score += 30;
    else if (factors.volObj.vRat <= 2) score += 15;
    else score += 0;

    // F2: OR Range Size (max 25)
    if (factors.orRangePct < 0.5) score += 25;
    else if (factors.orRangePct <= 1.0) score += 20;
    else if (factors.orRangePct <= 1.5) score += 10;
    else score += 0;

    // F3: Mean Reversion Context (max 20)
    if (factors.prevRed && factors.sType === 'LONG') score += 20;
    else if (factors.prevGreen && factors.sType === 'SHORT') score += 20;
    else if (factors.prevGreen && factors.sType === 'LONG') score += 5;
    else if (factors.prevRed && factors.sType === 'SHORT') score += 5;

    // F4: Previous Day Volatility (max 15)
    if (factors.pRange < 1.0) score += 15;
    else if (factors.pRange <= 2.0) score += 10;
    else score += 0;

    // F5: Gap Size (max 10)
    const absGap = Math.abs(factors.gapPct);
    if (absGap < 0.5) score += 10;
    else if (absGap <= 1.0) score += 7;
    else score += 0;

    return Math.min(100, Math.max(0, score));
}

let tiers = {
    t1: { count: 0, wins: 0, evR: 0, losses: 0, drifts: 0 }, // 75-100
    t2: { count: 0, wins: 0, evR: 0, losses: 0, drifts: 0 }, // 45-74
    t3: { count: 0, wins: 0, evR: 0, losses: 0, drifts: 0 }  // 0-44
};

async function main() {
    console.log("=== INTRADAY CONFIDENCE TIER VALIDATION ===");

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
        if (sym === 'NIFTY_50') continue;
        const c30 = load30mCache(sym);
        if (c30) fileCache30m[sym] = c30;
        const cD = loadDayCache(sym);
        if (cD) fileCacheDay[sym] = cD;
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
            const adv20 = calculateADV20(dataDay, targetDayIdx) || candles[0].volume;

            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;

            // F2: OR Size
            const orRangePct = (orRange / parseFloat(c1.open)) * 100;
            // F5: Gap Size
            const gapPct = ((parseFloat(c1.open) - prevDay.close) / prevDay.close) * 100;
            // F4: Prev day
            const pRange = ((prevDay.high - prevDay.low) / prevDay.low) * 100;
            // F3: Mean reversion
            const pGreen = prevDay.close > prevDay.open;
            const pRed = prevDay.open > prevDay.close;

            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i < candles.length && i <= 8; i++) { // <= 13:30 limit
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }
            if (bIdx === -1) continue;

            const bCandle = candles[bIdx];

            // F1: Volume
            const boVol = parseFloat(bCandle.volume);
            const avgV = adv20 / 13; // rough 30m avg
            const vRat = boVol / avgV;

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
            let hitT1 = false;
            let hitStop = false;
            let driftR = 0;

            // Retest logic
            if (touchedOR && retestBounce && !piercedIntra) {
                isEntry = true;
                const rT1 = sType === 'LONG' ? entryPrice + risk : entryPrice - risk;
                for (let j = touchedIdx; j < candles.length; j++) {
                    const eh = parseFloat(candles[j].high), el = parseFloat(candles[j].low);
                    if (sType === 'LONG') {
                        if (el < baseStop) { hitStop = true; break; }
                        if (eh >= rT1) { hitT1 = true; break; }
                    } else {
                        if (eh > baseStop) { hitStop = true; break; }
                        if (el <= rT1) { hitT1 = true; break; }
                    }
                }
                if (!hitT1 && !hitStop) {
                    const eodC = parseFloat(candles[candles.length - 1].close);
                    driftR = sType === 'LONG' ? (eodC - entryPrice) / risk : (entryPrice - eodC) / risk;
                }
            }
            // Runner logic (eval with slippage)
            else if (!touchedOR) {
                if (bIdx + 1 < candles.length) {
                    isEntry = true;
                    // Real world slippage
                    const nextOpen = parseFloat(candles[bIdx + 1].open);
                    const slipRisk = Math.max(Math.abs(nextOpen - baseStop), nextOpen * 0.005);
                    const slipT1 = sType === 'LONG' ? nextOpen + slipRisk : nextOpen - slipRisk;
                    entryPrice = nextOpen;

                    for (let j = bIdx + 1; j < candles.length; j++) {
                        const eh = parseFloat(candles[j].high), el = parseFloat(candles[j].low);
                        if (sType === 'LONG') {
                            if (el < baseStop) { hitStop = true; break; }
                            if (eh >= slipT1) { hitT1 = true; break; }
                        } else {
                            if (eh > baseStop) { hitStop = true; break; }
                            if (el <= slipT1) { hitT1 = true; break; }
                        }
                    }
                    if (!hitT1 && !hitStop) {
                        const eodC = parseFloat(candles[candles.length - 1].close);
                        driftR = sType === 'LONG' ? (eodC - entryPrice) / slipRisk : (entryPrice - eodC) / slipRisk;
                    }
                }
            }

            if (isEntry) {
                const score = scoreTrade({
                    volObj: { vRat }, orRangePct, sType, prevGreen: pGreen, prevRed: pRed, pRange, gapPct
                });

                let targetTier = tiers.t3;
                if (score >= 75) targetTier = tiers.t1;
                else if (score >= 45) targetTier = tiers.t2;

                targetTier.count++;
                if (hitT1) targetTier.wins++;
                else if (hitStop) { targetTier.losses++; targetTier.evR -= 1.0; } // Stop is 1R loss
                else { targetTier.drifts++; targetTier.evR += driftR; } // Drift PnL
                if (hitT1) targetTier.evR += 1.0; // Win is 1R win
            }
        }
    }

    const pct = (num, denom) => denom ? ((num / denom) * 100).toFixed(1) : '0.0';

    console.log(`\n=== TIER VALIDATION (172 Entries) ===`);
    console.log(`Tier 1 (75-100): ${tiers.t1.count.toString().padStart(3)} trades | T1 WR: ${pct(tiers.t1.wins, tiers.t1.count)}% | EV: ${(tiers.t1.evR / (tiers.t1.count || 1)).toFixed(2)}R`);
    console.log(`Tier 2 (45-74) : ${tiers.t2.count.toString().padStart(3)} trades | T1 WR: ${pct(tiers.t2.wins, tiers.t2.count)}% | EV: ${(tiers.t2.evR / (tiers.t2.count || 1)).toFixed(2)}R`);
    console.log(`Tier 3 (0-44)  : ${tiers.t3.count.toString().padStart(3)} trades | T1 WR: ${pct(tiers.t3.wins, tiers.t3.count)}% | EV: ${(tiers.t3.evR / (tiers.t3.count || 1)).toFixed(2)}R`);

    const monotonic = (tiers.t1.wins / tiers.t1.count > tiers.t2.wins / tiers.t2.count) && (tiers.t2.wins / tiers.t2.count > tiers.t3.wins / tiers.t3.count);
    console.log(`\nMonotonic Win Rates?: ${monotonic ? "PASSED" : "FAILED"}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
