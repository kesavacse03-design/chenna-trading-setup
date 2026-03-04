const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { synthesizeWeekly, calcRSI } = require('./synthesizeCandles.cjs');

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

function calcSMA(data, startIdx, period) {
    if (startIdx < period - 1) return null;
    let sum = 0;
    for (let i = startIdx - period + 1; i <= startIdx; i++) sum += data[i].close;
    return sum / period;
}

async function runAnalysis(categoryKey, isResistance) {
    console.log(`\n=== Analyzing ${categoryKey} ===`);

    const cat = await prisma.category.findUnique({ where: { key: categoryKey } });
    if (!cat) return;

    const stocks = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

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

        const dataDay = loadDayCache(sym);
        if (!dataDay) continue;

        const targetIdx = dataDay.findIndex(c => c.date === targetDateStr);
        if (targetIdx < 2) continue; // Need at least day-1 and day-2

        // Historical data UP TO the target date for context calculation
        const historyData = dataDay.slice(0, targetIdx + 1);
        const currentCandle = historyData[historyData.length - 1];
        const prev1 = historyData[historyData.length - 2];
        const prev2 = historyData[historyData.length - 3] || prev1;

        // a) DAILY context
        const ema20 = calcEMA(historyData, historyData.length - 1, 20);
        const ema50 = calcEMA(historyData, historyData.length - 1, 50);
        const prevDayRange = ((prev1.high - prev1.low) / prev1.low) * 100;

        const rsiArray = calcRSI(historyData, 14);
        const dailyRsi = rsiArray.length > 0 ? rsiArray[rsiArray.length - 1].value : null;

        // Breaking genuine 2-day high/low?
        let breakoutLevel, genuineBreakout;
        if (isResistance) {
            breakoutLevel = Math.max(prev1.high, prev2.high);
            genuineBreakout = currentCandle.close > breakoutLevel;
        } else {
            breakoutLevel = Math.min(prev1.low, prev2.low);
            genuineBreakout = currentCandle.close < breakoutLevel;
        }

        if (!genuineBreakout) continue; // Skip if not a genuine breakout on the close

        // b) WEEKLY context
        const weeklyData = synthesizeWeekly(historyData).sort((a, b) => a.date.localeCompare(b.date));
        let weeklyUptrend = false;
        let weeklyRsiVal = null;

        if (weeklyData.length >= 20) {
            const sma20_w = calcSMA(weeklyData, weeklyData.length - 1, 20);
            if (sma20_w && weeklyData[weeklyData.length - 1].close > sma20_w) {
                weeklyUptrend = true;
            }
        }
        const wRsiArray = calcRSI(weeklyData, 14);
        if (wRsiArray.length > 0) weeklyRsiVal = wRsiArray[wRsiArray.length - 1].value;

        // c) OUTCOME tracking (Next 10 days)
        const forwardData = dataDay.slice(targetIdx + 1, targetIdx + 11);
        if (forwardData.length === 0) continue; // Need at least some future data

        validSetups++;
        const entryPrice = currentCandle.close;
        const stopLoss = breakoutLevel; // strict stop at breakout level

        let mfe = 0; // Max Favorable Excursion (% from entry)
        let mae = 0; // Max Adverse Excursion (% from entry)

        let hitDay1 = false, hitDay3 = false, hitDay5 = false;
        let highestHigh = entryPrice, lowestLow = entryPrice;
        let hitTarget = false, hitStop = false;

        for (let i = 0; i < forwardData.length; i++) {
            const futureCandle = forwardData[i];

            if (futureCandle.high > highestHigh) highestHigh = futureCandle.high;
            if (futureCandle.low < lowestLow) lowestLow = futureCandle.low;

            // Check if held above breakout on specific days
            if (i === 0) {
                if (isResistance && futureCandle.close > breakoutLevel) hitDay1 = true;
                if (!isResistance && futureCandle.close < breakoutLevel) hitDay1 = true;
            }
            if (i === 2) {
                if (isResistance && futureCandle.close > breakoutLevel) hitDay3 = true;
                if (!isResistance && futureCandle.close < breakoutLevel) hitDay3 = true;
            }
            if (i === 4) {
                if (isResistance && futureCandle.close > breakoutLevel) hitDay5 = true;
                if (!isResistance && futureCandle.close < breakoutLevel) hitDay5 = true;
            }

            // Standard 1:1 R:R check
            const risk = Math.abs(entryPrice - stopLoss);
            const target = isResistance ? entryPrice + risk : entryPrice - risk;

            if (!hitStop && !hitTarget) {
                if (isResistance) {
                    if (futureCandle.low <= stopLoss) hitStop = true;
                    if (futureCandle.high >= target && !hitStop) hitTarget = true;
                } else {
                    if (futureCandle.high >= stopLoss) hitStop = true;
                    if (futureCandle.low <= target && !hitStop) hitTarget = true;
                }
            }
        }

        if (isResistance) {
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
        console.log(`Genuine Breakouts Found: ${validSetups}`);
        console.log(`Held Day 1: ${((day1Hold / validSetups) * 100).toFixed(1)}%`);
        console.log(`Held Day 3: ${((day3Hold / validSetups) * 100).toFixed(1)}%`);
        console.log(`Held Day 5: ${((day5Hold / validSetups) * 100).toFixed(1)}%`);
        console.log(`Avg MFE: ${(totalMFE / validSetups).toFixed(2)}%`);
        console.log(`Avg MAE: ${(totalMAE / validSetups).toFixed(2)}%`);
        console.log(`1:1 RR Win Rate: ${((winRate1to1 / validSetups) * 100).toFixed(1)}%`);
    } else {
        console.log("INSUFFICIENT DATA — need more history");
    }
}

async function main() {
    await runAnalysis('MULTI_RESISTANCE_BO', true);
    await runAnalysis('MULTI_SUPPORT_BO', false);
}

main().catch(console.error).finally(() => prisma.$disconnect());
