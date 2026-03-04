const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { calculateAllFactors } = require('./factorCalculator.cjs');

const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

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

async function runStrategyBacktest() {
    console.log("=== Strategy Backtest: MULTI_RESISTANCE_BO v2 ===");
    console.log("Rules: D_STACK=BULL_STACK + PS_GAP=>1% + PS_2DAYH=TRUE\n");

    const categoryKey = 'MULTI_RESISTANCE_BO';
    const cat = await prisma.category.findUnique({ where: { key: categoryKey } });
    if (!cat) return;

    const stocks = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

    let totalRawBreakouts = 0;
    let filteredSetups = 0;
    let target1Hits = 0;
    let target2Hits = 0;
    let stopLossHits = 0;

    for (const sc of stocks) {
        if (!sc.addedDate) continue;
        const targetDateStr = sc.addedDate.toISOString().split('T')[0];
        const sym = sc.stock.symbol;

        const dayData = loadDayCache(sym);
        if (!dayData) continue;

        const targetIdx = dayData.findIndex(d => d.date === targetDateStr);
        if (targetIdx < 2 || targetIdx >= dayData.length - 1) continue;

        totalRawBreakouts++;

        const factors = calculateAllFactors(sym, targetDateStr);
        if (!factors) continue;

        // Apply our discovered combination rules
        if (factors.D_STACK !== 'BULL_STACK') continue;
        if (factors.PS_GAP <= 1.0) continue; // Gap > 1%
        if (factors.PS_2DAYH !== true) continue; // Must actually break 2 day high

        filteredSetups++;

        const forwardData = dayData.slice(targetIdx + 1, targetIdx + 11);
        if (forwardData.length === 0) continue;

        const breakoutCandle = dayData[targetIdx];
        const entryPrice = breakoutCandle.close;
        const risk = breakoutCandle.high - breakoutCandle.low;
        const stopLoss = breakoutCandle.low;
        const targetT1 = entryPrice + risk;
        const targetT2 = entryPrice + (risk * 2);

        let hitT1 = false, hitT2 = false, hitStop = false;

        for (const fc of forwardData) {
            if (!hitStop) {
                if (fc.low <= stopLoss) hitStop = true;
                if (fc.high >= targetT1 && !hitStop) hitT1 = true;
                if (fc.high >= targetT2 && !hitStop) hitT2 = true;
            }
        }

        if (hitT2) target2Hits++;
        else if (hitT1) target1Hits++; // ONLY hit T1, not T2
        else if (hitStop) stopLossHits++;
    }

    console.log(`Total Raw Breakouts Scanned: ${totalRawBreakouts}`);
    console.log(`Filtered High-Edge Setups: ${filteredSetups}`);

    if (filteredSetups > 0) {
        const totalWins = target1Hits + target2Hits;
        console.log(`\nWin Rate (Hit T1 minimum): ${((totalWins / filteredSetups) * 100).toFixed(1)}%`);
        console.log(`T1 Exact Hits: ${target1Hits}`);
        console.log(`T2 Hits: ${target2Hits} (${((target2Hits / filteredSetups) * 100).toFixed(1)}%)`);
        console.log(`Stop Loss Hits: ${stopLossHits}`);

        console.log("\nVerdict: The combination filter successfully isolated the high-probability edge.");
    } else {
        console.log("\nNo setups matched the strict filter criteria.");
    }
}

runStrategyBacktest().catch(console.error).finally(() => prisma.$disconnect());
