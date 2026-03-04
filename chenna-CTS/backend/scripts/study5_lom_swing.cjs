const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { synthesize1Hour, calcRSI, detectDivergence } = require('./synthesizeCandles.cjs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
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

async function runLomSwingAnalysis(categoryKey, isUpsideLom) {
    console.log(`\n=== Analyzing ${categoryKey} ===`);

    const cat = await prisma.category.findUnique({ where: { key: categoryKey } });
    if (!cat) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stocks = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id, addedDate: { gte: thirtyDaysAgo } },
        include: { stock: true }
    });

    console.log(`Total sample size in last 30 days: ${stocks.length}`);

    let validSetups = 0;
    let day1Hold = 0;
    let day3Hold = 0;
    let day5Hold = 0;
    let totalMFE = 0;
    let totalMAE = 0;
    let winRate1to1 = 0;

    for (const sc of stocks) {
        if (!sc.addedDate) continue;
        const targetDateStr = sc.addedDate.toISOString().split('T')[0];
        const sym = sc.stock.symbol;

        const data30m = load30mCache(sym);
        if (!data30m || !data30m[targetDateStr]) continue;

        // Combine last 10 days of 30-min data up to the target date to synthesize 1H and calculate RSI
        const availableDates = Object.keys(data30m).sort();
        const targetIdx = availableDates.indexOf(targetDateStr);
        if (targetIdx < 2) continue;

        let combined30m = [];
        for (let i = Math.max(0, targetIdx - 10); i <= targetIdx; i++) {
            combined30m = combined30m.concat(data30m[availableDates[i]]);
        }

        const data1h = synthesize1Hour(combined30m);
        if (data1h.length < 20) continue;

        const rsi1h = calcRSI(data1h, 14);
        if (rsi1h.length < 15) continue;

        // Check if there's divergence on the breakout date
        // Divergence needs to happen around the target date. Let's run detectDivergence on the whole sequence.
        const div = detectDivergence(data1h, rsi1h, 20); // Longer lookback for swing

        let setupFound = false;
        let entryPrice = 0;
        let stopLoss = 0;
        let sType = isUpsideLom ? 'SHORT' : 'LONG'; // Upside LOM = Reversal Down

        // For SWING we just check if divergence triggered recently
        if (div) {
            if (isUpsideLom && div.type === 'BEARISH') {
                setupFound = true;
                entryPrice = data1h[data1h.length - 1].close;
                stopLoss = data1h[data1h.length - 1].high * 1.01; // 1% buffer
            }
            if (!isUpsideLom && div.type === 'BULLISH') {
                setupFound = true;
                entryPrice = data1h[data1h.length - 1].close;
                stopLoss = data1h[data1h.length - 1].low * 0.99; // 1% buffer
            }
        }

        if (!setupFound) continue;

        const dataDay = loadDayCache(sym);
        if (!dataDay) continue;

        const targetDayIdx = dataDay.findIndex(c => c.date === targetDateStr);
        if (targetDayIdx === -1) continue;

        const forwardData = dataDay.slice(targetDayIdx + 1, targetDayIdx + 11);
        if (forwardData.length === 0) continue;

        validSetups++;

        let mfe = 0;
        let mae = 0;

        let hitDay1 = false, hitDay3 = false, hitDay5 = false;
        let highestHigh = entryPrice, lowestLow = entryPrice;
        let hitTarget = false, hitStop = false;

        for (let i = 0; i < forwardData.length; i++) {
            const futureCandle = forwardData[i];

            if (futureCandle.high > highestHigh) highestHigh = futureCandle.high;
            if (futureCandle.low < lowestLow) lowestLow = futureCandle.low;

            // Held direction?
            if (i === 0) {
                if (sType === 'LONG' && futureCandle.close > entryPrice) hitDay1 = true;
                if (sType === 'SHORT' && futureCandle.close < entryPrice) hitDay1 = true;
            }
            if (i === 2) {
                if (sType === 'LONG' && futureCandle.close > entryPrice) hitDay3 = true;
                if (sType === 'SHORT' && futureCandle.close < entryPrice) hitDay3 = true;
            }
            if (i === 4) {
                if (sType === 'LONG' && futureCandle.close > entryPrice) hitDay5 = true;
                if (sType === 'SHORT' && futureCandle.close < entryPrice) hitDay5 = true;
            }

            const risk = Math.abs(entryPrice - stopLoss);
            const target = sType === 'LONG' ? entryPrice + risk : entryPrice - risk;

            if (!hitStop && !hitTarget) {
                if (sType === 'LONG') {
                    if (futureCandle.low <= stopLoss) hitStop = true;
                    if (futureCandle.high >= target && !hitStop) hitTarget = true;
                } else {
                    if (futureCandle.high >= stopLoss) hitStop = true;
                    if (futureCandle.low <= target && !hitStop) hitTarget = true;
                }
            }
        }

        if (sType === 'LONG') {
            mfe = ((highestHigh - entryPrice) / entryPrice) * 100;
            mae = ((entryPrice - lowestLow) / entryPrice) * 100;
        } else {
            mfe = ((entryPrice - lowestLow) / entryPrice) * 100;
            mae = ((highestHigh - entryPrice) / entryPrice) * 100;
        }

        totalMFE += mfe;
        totalMAE += mae;

        if (hitDay1) day1Hold++;
        if (hitDay3) day3Hold++;
        if (hitDay5) day5Hold++;
        if (hitTarget && !hitStop) winRate1to1++;
    }

    if (validSetups > 0) {
        console.log(`1-Hour Divergences Triggered: ${validSetups} / ${stocks.length} (${((validSetups / stocks.length) * 100).toFixed(1)}%)`);
        console.log(`Positive on Day 1: ${((day1Hold / validSetups) * 100).toFixed(1)}%`);
        console.log(`Positive on Day 3: ${((day3Hold / validSetups) * 100).toFixed(1)}%`);
        console.log(`Positive on Day 5: ${((day5Hold / validSetups) * 100).toFixed(1)}%`);
        console.log(`Avg MFE (10-Day): ${(totalMFE / validSetups).toFixed(2)}%`);
        console.log(`Avg MAE (10-Day): ${(totalMAE / validSetups).toFixed(2)}%`);
        console.log(`1:1 RR Win Rate: ${((winRate1to1 / validSetups) * 100).toFixed(1)}%`);
    } else {
        console.log("INSUFFICIENT DATA / No Valid 1H Divergences");
    }
}

async function main() {
    await runLomSwingAnalysis('UPSIDE_LOM_SWING', true);
    await runLomSwingAnalysis('DOWNSIDE_LOM_SWING', false);
}

main().catch(console.error).finally(() => prisma.$disconnect());
