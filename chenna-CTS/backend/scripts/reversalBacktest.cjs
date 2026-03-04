const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { loadDayCache } = require('./factorCalculator.cjs');

async function testReversal(categoryKey, isSpring) {
    console.log(`\n=== Testing ${isSpring ? 'Wyckoff Spring' : 'Wyckoff Upthrust'} on ${categoryKey} ===`);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const stocks = await prisma.stockCategory.findMany({
        where: {
            addedDate: { gte: ninetyDaysAgo },
            category: { key: categoryKey }
        },
        include: { stock: true }
    });

    console.log(`Scanning ${stocks.length} raw setups...`);

    let processed = 0;
    let reversals = 0;
    let wins = 0;
    let totalR = 0;

    for (const sc of stocks) {
        if (!sc.addedDate || !sc.stock) continue;
        const sym = sc.stock.symbol;
        const signalDateStr = sc.addedDate.toISOString().split('T')[0];

        const dayData = loadDayCache(sym);
        if (!dayData) continue;

        const sigIdx = dayData.findIndex(d => d.date === signalDateStr);
        if (sigIdx === -1 || sigIdx >= dayData.length - 1) continue;

        processed++;
        const signalCandle = dayData[sigIdx];

        const prevCandle = sigIdx > 0 ? dayData[sigIdx - 1] : signalCandle;
        const breakoutLevel = isSpring ? prevCandle.low : prevCandle.high;

        let entryIdx = -1;
        let extPoint = isSpring ? signalCandle.low : signalCandle.high;

        for (let i = sigIdx + 1; i <= Math.min(sigIdx + 2, dayData.length - 1); i++) {
            const today = dayData[i];

            if (isSpring) {
                if (today.low < extPoint) extPoint = today.low;
                if (today.close > breakoutLevel) {
                    entryIdx = i;
                    break;
                }
            } else {
                if (today.high > extPoint) extPoint = today.high;
                if (today.close < breakoutLevel) {
                    entryIdx = i;
                    break;
                }
            }
        }

        if (entryIdx === -1) continue;

        const entryPrice = dayData[entryIdx].close;
        const stopPrice = isSpring ? extPoint * 0.995 : extPoint * 1.005;

        if (isSpring && stopPrice >= entryPrice) continue;
        if (!isSpring && stopPrice <= entryPrice) continue;

        const risk = Math.abs(entryPrice - stopPrice);
        const targetPrice = isSpring ? entryPrice + (risk * 2) : entryPrice - (risk * 2);

        reversals++;
        let exitReason = 'PENDING';
        let finalRisk = 0;

        for (let i = entryIdx + 1; i <= Math.min(entryIdx + 10, dayData.length - 1); i++) {
            const c = dayData[i];

            if (isSpring) {
                if (c.low <= stopPrice) { exitReason = 'STOP'; break; }
                if (c.high >= targetPrice) { exitReason = 'TARGET'; break; }
            } else {
                if (c.high >= stopPrice) { exitReason = 'STOP'; break; }
                if (c.low <= targetPrice) { exitReason = 'TARGET'; break; }
            }

            if (i === entryIdx + 10 || i === dayData.length - 1) {
                exitReason = 'TIME';
                finalRisk = isSpring ? (c.close - entryPrice) / risk : (entryPrice - c.close) / risk;
                break;
            }
        }

        if (exitReason === 'STOP') {
            totalR -= 1;
        } else if (exitReason === 'TARGET') {
            wins++;
            totalR += 2;
        } else if (exitReason === 'TIME') {
            totalR += finalRisk;
            if (finalRisk > 1) wins++;
        }
    }

    const wr = reversals > 0 ? ((wins / reversals) * 100) : 0;
    const ev = reversals > 0 ? (totalR / reversals) : 0;

    console.log(`Setups Processed: ${processed}`);
    console.log(`Reversals Found: ${reversals} (${((reversals / processed) * 100 || 0).toFixed(1)}% occurrence rate)`);
    if (reversals > 0) {
        console.log(`Win Rate (1:2 R:R): ${wr.toFixed(1)}%`);
        console.log(`Expected Value: ${ev > 0 ? '+' : ''}${ev.toFixed(2)}R`);
    } else {
        console.log(`Not enough data to form conclusive proof.`);
    }
}

async function run() {
    await testReversal('MULTI_SUPPORT_BO', true);
    await testReversal('MULTI_RESISTANCE_BO', false);
    process.exit(0);
}

run();
