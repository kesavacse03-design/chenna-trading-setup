const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const cacheDirDay = path.join(__dirname, '../cache/day');
const cacheDir30m = path.join(__dirname, '../cache/30minute');

function loadCache(symbol, dir) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fp = path.join(dir, `${cleanKey}_master.json`);
    if (!fs.existsSync(fp)) return null;
    try {
        const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
        return d.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            open: parseFloat(c.open), high: parseFloat(c.high),
            low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume),
            fullDate: c.timestamp || c.date
        })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return null; }
}

async function getTrades(category) {
    const dumpPath = path.join(__dirname, '../db_trades_dump.json');
    if (!fs.existsSync(dumpPath)) return [];

    const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    let runId = null;

    if (category === 'SHORT_TERM_SWING_BO_UP') runId = 'c2f83919-7fb8-47e9-84d8-2bd69c3d54e0';
    else if (category === 'SHORT_TERM_SWING_BO_DOWN') runId = '1fa6b975-690c-43db-929c-e5f16a0c2931';
    else if (category === 'LT_SWING_BO_UP') runId = '83cfbb5d-5aa0-4e8a-8f96-38bfb776b545';

    if (!runId) return [];

    const run = data.runs.find(r => r.id === runId);
    if (!run || !run.trades) return [];

    return run.trades.map(t => ({
        stockSymbol: t.symbol,
        entryDate: t.entryDate || t.signalDate,
        pnl: t.pnl || 0,
        signalData: { signalDate: t.signalDate }
    }));
}

// ============== Analysis Handlers ==============

async function analyzeStopHunts(trades, catName) {
    console.log(`\n[ ${catName} Part A: Stop Hunt / Liquidity Sweep Before Entry ]`);

    let swept = { w: 0, l: 0, d05_1: { w: 0, l: 0 }, d1_2: { w: 0, l: 0 }, d2: { w: 0, l: 0 } };
    let clean = { w: 0, l: 0 };

    for (const t of trades) {
        if (!t.entryDate || !t.signalData) continue;
        const d = loadCache(t.stockSymbol, cacheDirDay);
        if (!d) continue;

        const sigDate = t.signalData.signalDate ? new Date(t.signalData.signalDate).toISOString().split('T')[0] : new Date(t.entryDate).toISOString().split('T')[0];
        const sIdx = d.findIndex(c => c.date === sigDate);
        if (sIdx < 15) continue;

        const isWin = t.pnl > 0;

        // For UP categories (Stop Hunt = dipping below 10d low, then recovering)
        if (catName.includes('UP')) {
            // Find 10d low BEFORE the 5 day window
            const prior10d = d.slice(sIdx - 15, sIdx - 5);
            const prior10dLow = Math.min(...prior10d.map(c => c.low));

            // Check the 5 days before signal
            const window5d = d.slice(sIdx - 5, sIdx);
            const lowestInWindow = Math.min(...window5d.map(c => c.low));

            if (lowestInWindow < prior10dLow && d[sIdx].close > prior10dLow) {
                if (isWin) swept.w++; else swept.l++;
                const dipPct = ((prior10dLow - lowestInWindow) / prior10dLow) * 100;

                if (dipPct < 1.0) { if (isWin) swept.d05_1.w++; else swept.d05_1.l++; }
                else if (dipPct <= 2.0) { if (isWin) swept.d1_2.w++; else swept.d1_2.l++; }
                else { if (isWin) swept.d2.w++; else swept.d2.l++; }
            } else {
                if (isWin) clean.w++; else clean.l++;
            }
        }
        else {
            // For DOWN category (Stop Hunt = ripping above 10d high, then braking down)
            const prior10d = d.slice(sIdx - 15, sIdx - 5);
            const prior10dHigh = Math.max(...prior10d.map(c => c.high));

            const window5d = d.slice(sIdx - 5, sIdx);
            const highestInWindow = Math.max(...window5d.map(c => c.high));

            if (highestInWindow > prior10dHigh && d[sIdx].close < prior10dHigh) {
                if (isWin) swept.w++; else swept.l++;
                const ripPct = ((highestInWindow - prior10dHigh) / prior10dHigh) * 100;

                if (ripPct < 1.0) { if (isWin) swept.d05_1.w++; else swept.d05_1.l++; }
                else if (ripPct <= 2.0) { if (isWin) swept.d1_2.w++; else swept.d1_2.l++; }
                else { if (isWin) swept.d2.w++; else swept.d2.l++; }
            } else {
                if (isWin) clean.w++; else clean.l++;
            }
        }
    }

    const tSwept = swept.w + swept.l; const tClean = clean.w + clean.l;
    console.log(`  YES (Stop hunt before breakout):  ${String(tSwept).padStart(3)} signals | WR: ${tSwept ? (swept.w / tSwept * 100).toFixed(1) : '0.0'}%`);
    console.log(`  NO (Clean approach to breakout):  ${String(tClean).padStart(3)} signals | WR: ${tClean ? (clean.w / tClean * 100).toFixed(1) : '0.0'}%`);
    if (tSwept > 0) {
        const d05t = swept.d05_1.w + swept.d05_1.l, d1t = swept.d1_2.w + swept.d1_2.l, d2t = swept.d2.w + swept.d2.l;
        console.log(`    Swept 0-1% below:   ${String(d05t).padStart(3)} signals | WR: ${d05t ? (swept.d05_1.w / d05t * 100).toFixed(1) : '0.0'}%`);
        console.log(`    Swept 1-2% below:   ${String(d1t).padStart(3)} signals | WR: ${d1t ? (swept.d1_2.w / d1t * 100).toFixed(1) : '0.0'}%`);
        console.log(`    Swept 2%+ below:    ${String(d2t).padStart(3)} signals | WR: ${d2t ? (swept.d2.w / d2t * 100).toFixed(1) : '0.0'}%`);
    }
}

async function analyzeFairValueGaps(trades, catName) {
    console.log(`\n[ ${catName} Part B: Fair Value Gaps (Imbalance Zones) ]`);

    let fvg = { w: 0, l: 0 }, noFvg = { w: 0, l: 0 };

    for (const t of trades) {
        if (!t.entryDate || !t.signalData) continue;
        const d = loadCache(t.stockSymbol, cacheDirDay);
        if (!d) continue;

        const sigDate = t.signalData.signalDate ? new Date(t.signalData.signalDate).toISOString().split('T')[0] : new Date(t.entryDate).toISOString().split('T')[0];
        const sIdx = d.findIndex(c => c.date === sigDate);
        if (sIdx < 2) continue;

        const isWin = t.pnl > 0;
        const c0 = d[sIdx], c1 = d[sIdx - 1], c2 = d[sIdx - 2];

        let hasFVG = false;
        if (catName.includes('UP')) {
            if (c0.low > c1.high) hasFVG = true; // standard gap up
            else if (c0.low > c2.high) hasFVG = true; // 3-bar FVG
        } else {
            if (c0.high < c1.low) hasFVG = true;
            else if (c0.high < c2.low) hasFVG = true;
        }

        if (hasFVG) { if (isWin) fvg.w++; else fvg.l++; }
        else { if (isWin) noFvg.w++; else noFvg.l++; }
    }

    const tFvg = fvg.w + fvg.l; const tNo = noFvg.w + noFvg.l;
    console.log(`  Breakout WITH FVG:    ${String(tFvg).padStart(3)} signals | WR: ${tFvg ? (fvg.w / tFvg * 100).toFixed(1) : '0.0'}%`);
    console.log(`  Breakout WITHOUT FVG: ${String(tNo).padStart(3)} signals | WR: ${tNo ? (noFvg.w / tNo * 100).toFixed(1) : '0.0'}%`);
}

async function analyzeOrderBlocks(trades, catName) {
    console.log(`\n[ ${catName} Part C: Order Block Detection ]`);
    let hold = { w: 0, l: 0 }, missed = { w: 0, l: 0 }, broke = { w: 0, l: 0 };

    // To keep simple, mostly applicable to UP categories
    if (!catName.includes('UP')) return;

    for (const t of trades) {
        if (!t.entryDate || !t.signalData) continue;
        const d = loadCache(t.stockSymbol, cacheDirDay);
        if (!d) continue;

        const sigDate = t.signalData.signalDate ? new Date(t.signalData.signalDate).toISOString().split('T')[0] : new Date(t.entryDate).toISOString().split('T')[0];
        const sIdx = d.findIndex(c => c.date === sigDate);
        if (sIdx < 6 || sIdx + 3 >= d.length) continue;

        const isWin = t.pnl > 0;

        // Find last Red candle before breakout
        let obCandle = null;
        for (let i = sIdx - 1; i >= sIdx - 5; i--) {
            if (d[i].close < d[i].open) { obCandle = d[i]; break; }
        }

        if (obCandle) {
            const obHigh = obCandle.high, obLow = obCandle.low;
            // look at next 3 days
            let retested = false, brokeBelow = false;
            for (let i = sIdx + 1; i <= sIdx + 3; i++) {
                if (d[i].low <= obHigh) retested = true;
                if (d[i].close < obLow) brokeBelow = true;
            }

            if (brokeBelow) { if (isWin) broke.w++; else broke.l++; }
            else if (retested) { if (isWin) hold.w++; else hold.l++; }
            else { if (isWin) missed.w++; else missed.l++; }
        }
    }

    const tH = hold.w + hold.l, tM = missed.w + missed.l, tB = broke.w + broke.l;
    console.log(`  YES (retested OB and held):       ${String(tH).padStart(3)} signals | WR: ${tH ? (hold.w / tH * 100).toFixed(1) : '0.0'}%`);
    console.log(`  NO  (never came back):            ${String(tM).padStart(3)} signals | WR: ${tM ? (missed.w / tM * 100).toFixed(1) : '0.0'}%`);
    console.log(`  YES (retested and broke below):   ${String(tB).padStart(3)} signals | WR: ${tB ? (broke.w / tB * 100).toFixed(1) : '0.0'}%`);
}

async function analyzeVolumeImbalance(trades, catName) {
    console.log(`\n[ ${catName} Part D: Volume Imbalance ]`);
    let heavy_acc = { w: 0, l: 0 }, bal = { w: 0, l: 0 }, dist = { w: 0, l: 0 };

    for (const t of trades) {
        if (!t.entryDate || !t.signalData) continue;
        const d = loadCache(t.stockSymbol, cacheDirDay);
        if (!d) continue;

        const sigDate = t.signalData.signalDate ? new Date(t.signalData.signalDate).toISOString().split('T')[0] : new Date(t.entryDate).toISOString().split('T')[0];
        const sIdx = d.findIndex(c => c.date === sigDate);
        if (sIdx < 11) continue;

        const isWin = t.pnl > 0;
        const window10d = d.slice(sIdx - 10, sIdx);

        let upVol = 0, dnVol = 0;
        for (const c of window10d) {
            if (c.close >= c.open) upVol += c.volume;
            else dnVol += c.volume;
        }

        const ratio = dnVol === 0 ? 999 : upVol / dnVol;

        if (catName.includes('UP')) {
            if (ratio > 2.0) { if (isWin) heavy_acc.w++; else heavy_acc.l++; }
            else if (ratio >= 1.0) { if (isWin) bal.w++; else bal.l++; }
            else { if (isWin) dist.w++; else dist.l++; }
        } else {
            if (ratio < 0.5) { if (isWin) heavy_acc.w++; else heavy_acc.l++; }
            else if (ratio <= 1.0) { if (isWin) bal.w++; else bal.l++; }
            else { if (isWin) dist.w++; else dist.l++; }
        }
    }

    const th = heavy_acc.w + heavy_acc.l, tb = bal.w + bal.l, td = dist.w + dist.l;
    if (catName.includes('UP')) {
        console.log(`  Ratio > 2.0 (heavy accum):   ${String(th).padStart(3)} signals | WR: ${th ? (heavy_acc.w / th * 100).toFixed(1) : '0.0'}%`);
        console.log(`  Ratio 1.0-2.0 (balanced):    ${String(tb).padStart(3)} signals | WR: ${tb ? (bal.w / tb * 100).toFixed(1) : '0.0'}%`);
        console.log(`  Ratio < 1.0 (distribution):  ${String(td).padStart(3)} signals | WR: ${td ? (dist.w / td * 100).toFixed(1) : '0.0'}%`);
    } else {
        console.log(`  Ratio < 0.5 (heavy dist):    ${String(th).padStart(3)} signals | WR: ${th ? (heavy_acc.w / th * 100).toFixed(1) : '0.0'}%`);
        console.log(`  Ratio 0.5-1.0 (balanced):    ${String(tb).padStart(3)} signals | WR: ${tb ? (bal.w / tb * 100).toFixed(1) : '0.0'}%`);
        console.log(`  Ratio > 1.0 (accumulation):  ${String(td).padStart(3)} signals | WR: ${td ? (dist.w / td * 100).toFixed(1) : '0.0'}%`);
    }
}

async function analyzeCounterTrend(trades, catName) {
    console.log(`\n[ ${catName} Part E: Counter-Intuitive Inducement ]`);
    let trap = { w: 0, l: 0 }, obvious = { w: 0, l: 0 };

    for (const t of trades) {
        if (!t.entryDate || !t.signalData) continue;
        const d = loadCache(t.stockSymbol, cacheDirDay);
        if (!d) continue;

        const sigDate = t.signalData.signalDate ? new Date(t.signalData.signalDate).toISOString().split('T')[0] : new Date(t.entryDate).toISOString().split('T')[0];
        const sIdx = d.findIndex(c => c.date === sigDate);
        if (sIdx < 6) continue;

        const isWin = t.pnl > 0;

        let dt = true, ut = true;
        for (let i = 0; i < 4; i++) {
            if (d[sIdx - i - 1].high >= d[sIdx - i - 2].high) dt = false;
            if (d[sIdx - i - 1].low <= d[sIdx - i - 2].low) ut = false;
        }

        if (catName.includes('UP')) {
            if (dt) { if (isWin) trap.w++; else trap.l++; }
            else { if (isWin) obvious.w++; else obvious.l++; }
        } else {
            if (ut) { if (isWin) trap.w++; else trap.l++; }
            else { if (isWin) obvious.w++; else obvious.l++; }
        }
    }

    const tT = trap.w + trap.l, tO = obvious.w + obvious.l;
    if (catName.includes('UP')) {
        console.log(`  YES (breakout from downtrend): ${String(tT).padStart(3)} signals | WR: ${tT ? (trap.w / tT * 100).toFixed(1) : '0.0'}%`);
        console.log(`  NO  (obvious/choppy):          ${String(tO).padStart(3)} signals | WR: ${tO ? (obvious.w / tO * 100).toFixed(1) : '0.0'}%`);
    } else {
        console.log(`  YES (breakdown from uptrend):  ${String(tT).padStart(3)} signals | WR: ${tT ? (trap.w / tT * 100).toFixed(1) : '0.0'}%`);
        console.log(`  NO  (obvious/choppy):          ${String(tO).padStart(3)} signals | WR: ${tO ? (obvious.w / tO * 100).toFixed(1) : '0.0'}%`);
    }
}


async function analyzeIntradayVolume(trades, catName) {
    console.log(`\n[ ${catName} Part F: Intraday Volume Profile (Morning vs Afternoon) ]`);
    let inst = { w: 0, l: 0 }, retail = { w: 0, l: 0 };

    for (const t of trades) {
        if (!t.entryDate || !t.signalData) continue;
        const sigDateStr = t.signalData.signalDate ? new Date(t.signalData.signalDate).toISOString().split('T')[0] : new Date(t.entryDate).toISOString().split('T')[0];

        const d30 = loadCache(t.stockSymbol, cacheDir30m);
        if (!d30) continue;

        // Find all 30m candles for the breakout (signal) day
        const dayCandles = d30.filter(c => c.date.startsWith(sigDateStr));
        if (dayCandles.length < 5) continue; // Need enough coverage

        let v1 = 0, v2 = 0;
        for (const c of dayCandles) {
            const timeStr = c.fullDate.split('T')[1];
            const hour = parseInt(timeStr.split(':')[0]);
            const min = parseInt(timeStr.split(':')[1]);

            // 9:15 - 12:30 is V1, 12:30 - 3:30 is V2
            // Upstox time is normally matching the candle start.
            if (hour < 12 || (hour === 12 && min < 30)) v1 += c.volume;
            else v2 += c.volume;
        }

        const isWin = t.pnl > 0;

        if (catName.includes('DOWN')) {
            // For DOWN, maybe V2 > V1 is institution pushing it LOWER into close, or vice versa?
            // The prompt asked for "breakout day". We'll just apply the same logic.
            if (v2 > v1) { if (isWin) inst.w++; else inst.l++; }
            else { if (isWin) retail.w++; else retail.l++; }
        } else {
            if (v2 > v1) { if (isWin) inst.w++; else inst.l++; }
            else { if (isWin) retail.w++; else retail.l++; }
        }
    }

    const tI = inst.w + inst.l, tR = retail.w + retail.l;
    console.log(`  V2 > V1 (afternoon institutional): ${String(tI).padStart(3)} signals | WR: ${tI ? (inst.w / tI * 100).toFixed(1) : '0.0'}%`);
    console.log(`  V1 > V2 (morning retail FOMO):     ${String(tR).padStart(3)} signals | WR: ${tR ? (retail.w / tR * 100).toFixed(1) : '0.0'}%`);
}

async function main() {
    console.log('======================================================');
    console.log('STUDY 9: INSTITUTIONAL FOOTPRINT ANALYSIS');

    // Categories to test
    const categories = ['SHORT_TERM_SWING_BO_UP', 'LT_SWING_BO_UP', 'SHORT_TERM_SWING_BO_DOWN'];

    for (const cat of categories) {
        console.log(`\n>>> CATEGORY: ${cat} <<<`);
        const catTrades = await getTrades(cat);
        if (catTrades.length === 0) continue;

        await analyzeStopHunts(catTrades, cat);
        await analyzeFairValueGaps(catTrades, cat);
        if (cat.includes('UP')) {
            await analyzeOrderBlocks(catTrades, cat);
        }
        await analyzeVolumeImbalance(catTrades, cat);
        await analyzeCounterTrend(catTrades, cat);
        await analyzeIntradayVolume(catTrades, cat);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
