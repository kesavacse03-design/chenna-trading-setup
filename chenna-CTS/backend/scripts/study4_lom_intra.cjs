const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { calcRSI, detectDivergence } = require('./synthesizeCandles.cjs');

const CACHE_DIR_15M = path.join(__dirname, '../cache/15minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

function load15mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_15M, `${cleanKey}_master.json`);
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

async function runLomIntraAnalysis(categoryKey, isUpsideLom) {
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

    let totalSetups = 0;
    let validDivergences = 0;
    let target1Hits = 0; // 1:1 RR
    let target2Hits = 0; // 1:2 RR
    let stopLossHits = 0;
    let eodExits = 0;

    for (const sc of stocks) {
        if (!sc.addedDate) continue;
        const targetDateStr = sc.addedDate.toISOString().split('T')[0];
        const sym = sc.stock.symbol;

        const data15m = load15mCache(sym);
        if (!data15m || !data15m[targetDateStr]) continue;

        // We need previous days to calculate accurate 15-min RSI
        // Combine last 3 days of 15-min data if available to seed RSI
        const availableDates = Object.keys(data15m).sort();
        const targetIdx = availableDates.indexOf(targetDateStr);
        if (targetIdx < 2) continue; // Need some history to prime RSI

        let combined15m = [];
        for (let i = Math.max(0, targetIdx - 3); i <= targetIdx; i++) {
            combined15m = combined15m.concat(data15m[availableDates[i]]);
        }

        if (combined15m.length < 20) continue;

        // Calculate RSI for combined array
        const rsiArray = calcRSI(combined15m, 14);

        // Filter the day's candles
        const dayCandles = data15m[targetDateStr];
        const dayStartIdxInCombined = combined15m.findIndex(c => c.date === dayCandles[0].date && c.timeStr === dayCandles[0].timeStr);

        let setupFound = false;
        let entryPrice = 0;
        let stopLoss = 0;
        let sType = isUpsideLom ? 'SHORT' : 'LONG'; // Upside LOM = Reversal Down (Short)

        // Scan through the day's 15m candles
        for (let i = dayStartIdxInCombined; i < combined15m.length; i++) {
            const currentCandles = combined15m.slice(0, i + 1);
            const currentRSI = rsiArray.slice(0, i + 1 - 14); // RSI array length offset

            if (currentRSI.length < 10) continue;

            // detect divergence up to this candle
            const div = detectDivergence(currentCandles, currentRSI, 15);

            if (div) {
                if (isUpsideLom && div.type === 'BEARISH') {
                    setupFound = true;
                    // Enter short on close
                    entryPrice = currentCandles[currentCandles.length - 1].close;
                    stopLoss = currentCandles[currentCandles.length - 1].high * 1.002; // Small buffer above high
                    break;
                }
                if (!isUpsideLom && div.type === 'BULLISH') {
                    setupFound = true;
                    // Enter long on close
                    entryPrice = currentCandles[currentCandles.length - 1].close;
                    stopLoss = currentCandles[currentCandles.length - 1].low * 0.998; // Small buffer below low
                    break;
                }
            }
        }

        if (!setupFound) {
            continue; // False positive scanner result, no valid divergence on 15m
        }

        validDivergences++;
        totalSetups++;

        const trueRisk = Math.abs(entryPrice - stopLoss);
        const targetT1 = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;
        const targetT2 = sType === 'LONG' ? entryPrice + (trueRisk * 2) : entryPrice - (trueRisk * 2);

        // Find entry index in dayCandles
        const entryTimeIdx = dayCandles.findIndex(c => c.close === entryPrice);

        let outcome = null;
        let reachedT1 = false;

        for (let i = entryTimeIdx + 1; i < dayCandles.length; i++) {
            const ch = parseFloat(dayCandles[i].high), cl = parseFloat(dayCandles[i].low);

            if (sType === 'LONG') {
                if (cl <= stopLoss) { outcome = 'STOP'; break; }
                if (ch >= targetT2) { outcome = 'T2'; reachedT1 = true; break; }
                if (ch >= targetT1 && !reachedT1) { reachedT1 = true; }
            } else {
                if (ch >= stopLoss) { outcome = 'STOP'; break; }
                if (cl <= targetT2) { outcome = 'T2'; reachedT1 = true; break; }
                if (cl <= targetT1 && !reachedT1) { reachedT1 = true; }
            }
        }

        if (outcome === 'T2') target2Hits++;
        else if (outcome === 'STOP') stopLossHits++;
        else { eodExits++; }

        if (reachedT1 && outcome !== 'T2') target1Hits++;
        if (outcome === 'T2') target1Hits++;
    }

    console.log(`Total 15m Divergence Validated: ${validDivergences}`);
    if (validDivergences > 0) {
        console.log(`False Signal Rate (Scanned but no 15m Div): ${(((stocks.length - validDivergences) / stocks.length) * 100).toFixed(1)}%`);
        console.log(`Target 1 Hits (1:1): ${target1Hits} (${((target1Hits / validDivergences) * 100).toFixed(1)}%)`);
        console.log(`Target 2 Hits (1:2): ${target2Hits} (${((target2Hits / validDivergences) * 100).toFixed(1)}%)`);
        console.log(`Stop Loss Hits: ${stopLossHits} (${((stopLossHits / validDivergences) * 100).toFixed(1)}%)`);
        console.log(`EOD Exits: ${eodExits} (${((eodExits / validDivergences) * 100).toFixed(1)}%)`);
    } else {
        console.log("Not enough valid setups found.");
    }
}

async function main() {
    await runLomIntraAnalysis('UPSIDE_LOM_INTRA', true);
    await runLomIntraAnalysis('DOWNSIDE_LOM_INTRA', false);
}

main().catch(console.error).finally(() => prisma.$disconnect());
