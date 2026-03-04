const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const priceService = require('./services/priceService.cjs');
const fs = require('fs');

function calcSMA(candles, period) {
    if (!candles || candles.length < period) return null;
    const closes = candles.slice(-period).map(c => c.close);
    return closes.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const chg = candles[i].close - candles[i - 1].close;
        if (chg > 0) avgGain += chg; else avgLoss -= chg;
    }
    avgGain /= period;
    avgLoss /= period;
    for (let i = period + 1; i < candles.length; i++) {
        const chg = candles[i].close - candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + (chg > 0 ? chg : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (chg < 0 ? Math.abs(chg) : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
}

function toISTDateString(dateObj) {
    if (!dateObj) return null;
    const d = new Date(dateObj);
    return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];
}

async function diagnose() {
    console.log("=== DIAGNOSING HEROMOTOCO ON 2025-08-04 ===");
    const symbol = 'HEROMOTOCO';
    const targetDateStr = '2025-08-04';
    const targetDateObj = new Date(targetDateStr);

    const stock = await prisma.stock.findUnique({ where: { symbol } });

    function classifyMinerviniStage(price, sma50, sma200) {
        if (!sma50 || !sma200 || !price) return { stage: 0, label: 'UNKNOWN' };
        if (price > sma50 && sma50 > sma200) return { stage: 2, label: 'STAGE_2_UPTREND' };
        if (price < sma50 && sma50 < sma200) return { stage: 4, label: 'STAGE_4_DECLINE' };
        if (price < sma50 && price > sma200) return { stage: 3, label: 'STAGE_3_TOPPING' };
        return { stage: 1, label: 'STAGE_1_BASING' };
    }

    // 1. Study Logic (365 days lookback)
    const studyFromObj = new Date(targetDateObj);
    studyFromObj.setDate(studyFromObj.getDate() - 365);
    const studyToObj = new Date(targetDateObj);
    studyToObj.setDate(studyToObj.getDate() + 1);

    const studyCandles = await priceService.fetchPrice(
        symbol, stock.instrumentKey, toISTDateString(studyFromObj), toISTDateString(studyToObj)
    );
    studyCandles.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));
    const studyTargetIdx = studyCandles.findIndex(c => String(c.date || c.timestamp).includes(targetDateStr));
    const studyPast = studyTargetIdx !== -1 ? studyCandles.slice(0, studyTargetIdx + 1) : studyCandles;

    const studySMA50 = calcSMA(studyPast, 50);
    const studySMA200 = calcSMA(studyPast, 200);
    const studyRSI = calcRSI(studyPast, 14);
    const studyPrice = studyPast[studyPast.length - 1]?.close;
    const studyStage = classifyMinerviniStage(studyPrice, studySMA50, studySMA200);

    // 2. Old Engine Logic (200 days lookback)
    const engineFromObj = new Date(targetDateObj);
    engineFromObj.setDate(engineFromObj.getDate() - 200);
    const engineToObj = new Date(targetDateObj);
    engineToObj.setDate(engineToObj.getDate() + 1);

    const engineCandles = await priceService.fetchPrice(
        symbol, stock.instrumentKey, toISTDateString(engineFromObj), toISTDateString(engineToObj)
    );
    engineCandles.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));
    const engineTargetIdx = engineCandles.findIndex(c => String(c.date || c.timestamp).includes(targetDateStr));
    const enginePast = engineTargetIdx !== -1 ? engineCandles.slice(0, engineTargetIdx + 1) : engineCandles;

    const engineSMA50 = calcSMA(enginePast, 50);
    const engineSMA200 = calcSMA(enginePast, 200);
    const engineRSI = calcRSI(enginePast, 14);
    const enginePrice = enginePast[enginePast.length - 1]?.close;
    const engineStage = classifyMinerviniStage(enginePrice, engineSMA50, engineSMA200);

    const output = {
        STUDY_LOGIC_365: {
            candlesFetched: studyPast.length,
            targetDate: String(studyPast[studyPast.length - 1]?.date || studyPast[studyPast.length - 1]?.timestamp),
            SMA50: studySMA50 ? studySMA50.toFixed(2) : null,
            SMA200: studySMA200 ? studySMA200.toFixed(2) : null,
            Price: studyPrice ? studyPrice.toFixed(2) : null,
            Stage: studyStage.label,
            RSI14: studyRSI ? studyRSI.toFixed(2) : null
        },
        OLD_ENGINE_LOGIC_200: {
            candlesFetched: enginePast.length,
            targetDate: String(enginePast[enginePast.length - 1]?.date || enginePast[enginePast.length - 1]?.timestamp),
            SMA50: engineSMA50 ? engineSMA50.toFixed(2) : null,
            SMA200: engineSMA200 ? engineSMA200.toFixed(2) : null,
            Price: enginePrice ? enginePrice.toFixed(2) : null,
            Stage: engineStage.label,
            RSI14: engineRSI ? engineRSI.toFixed(2) : null
        }
    };

    fs.writeFileSync('diag.json', JSON.stringify(output, null, 2));
    console.log("Successfully wrote diag.json");
}

diagnose().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
