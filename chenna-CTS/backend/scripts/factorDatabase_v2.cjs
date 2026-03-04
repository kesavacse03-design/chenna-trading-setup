const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { calcAllRound2Factors, loadDayCache, calcATR } = require('./factorCalculator.cjs');

async function buildDatabaseV2() {
    console.log("=== Building Factor-Outcome Database V2 ===");

    // Define the massive factor array we built in Round 2
    const factorNames = [
        'NR7', 'NR4', 'INSIDER', 'INSIDER_NR7', 'VCP_SCORE', 'ATR_CONTRACT',
        'BO_N_DAY', 'TOUCH_COUNT', 'LEVEL_AGE', 'RSI2', 'RSI2_CUM', 'STOCH_RSI',
        'MACD_HIST', 'MACD_HIST_SLOPE', 'VOL_BUILDUP', 'ACCUM', 'BO_VOL_RATIO',
        'D_EMA20', 'D_EMA50', 'D_EMA200', 'D_STACK', 'PS_GAP', 'W_EMA20'
    ];

    const headers = [
        'symbol', 'date', 'category', 'setup_dir',
        ...factorNames,
        'entry_method', 'entry_active', 'entry_price',
        'stop_swing_pct', 'stop_atr_pct', 'stop_fixed_pct',
        'mfe_pct', 'mae_pct', 'hold1_pct', 'hold3_pct', 'hold5_pct', 'hold10_pct'
    ];

    const outPath = path.join(__dirname, 'factor_analysis_v2_master.csv');
    fs.writeFileSync(outPath, headers.join(',') + '\n', 'utf8');

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const stocks = await prisma.stockCategory.findMany({
        where: { addedDate: { gte: ninetyDaysAgo } },
        include: { stock: true, category: true }
    });

    console.log(`Processing ${stocks.length} stock-day pairs into permutations...`);

    let processedSetups = 0;
    let writtenRows = 0;

    for (const sc of stocks) {
        if (!sc.addedDate || !sc.category) continue;
        const targetDateStr = sc.addedDate.toISOString().split('T')[0];
        const sym = sc.stock.symbol;
        const catKey = sc.category.key;

        let setupDir = 'LONG';
        if (catKey.includes('DOWNSIDE_LOM_SWING') || catKey.includes('MULTI_SUPPORT_BO') || catKey.includes('ST_SWING_BO_DOWN') || catKey.includes('UPSIDE_LOM_INTRA')) {
            setupDir = 'SHORT';
        }

        const factors = calcAllRound2Factors(sym, targetDateStr, setupDir);
        if (!factors) continue;

        const dayData = loadDayCache(sym);
        if (!dayData) continue;

        const targetIdx = dayData.findIndex(d => d.date === targetDateStr);
        if (targetIdx === -1 || targetIdx >= dayData.length - 1) continue;

        const forwardData = dayData.slice(targetIdx + 1, targetIdx + 11);
        if (forwardData.length === 0) continue;

        const breakoutCandle = dayData[targetIdx];
        const atrVal = calcATR(dayData, targetIdx, 14) || (breakoutCandle.high - breakoutCandle.low);

        // Calculate the base factor row string
        const baseRowArr = [
            sym, targetDateStr, catKey, setupDir
        ];
        for (const fname of factorNames) {
            let val = factors[fname];
            if (val === undefined || val === null) val = '';
            else if (typeof val === 'boolean') val = val ? 'TRUE' : 'FALSE';
            else if (typeof val === 'number') val = val.toFixed(4);
            baseRowArr.push(val);
        }

        // Generate the permutations
        const entryMethods = ['CHASE', 'NEXT_OPEN', 'RETEST'];

        for (const method of entryMethods) {
            let entryPrice = 0;
            let entryActive = true;
            let trackingData = forwardData;

            if (method === 'CHASE') {
                entryPrice = breakoutCandle.close;
            } else if (method === 'NEXT_OPEN') {
                entryPrice = forwardData[0].open;
            } else if (method === 'RETEST') {
                const breakoutLevel = setupDir === 'LONG' ?
                    Math.max(dayData[targetIdx - 1]?.high || 0, dayData[targetIdx - 2]?.high || 0) :
                    Math.min(dayData[targetIdx - 1]?.low || 99999, dayData[targetIdx - 2]?.low || 99999);

                entryActive = false;
                // Look for retest in next 3 days
                for (let i = 0; i < Math.min(3, forwardData.length); i++) {
                    if (setupDir === 'LONG' && forwardData[i].low <= breakoutLevel) {
                        entryPrice = breakoutLevel; // Executed
                        entryActive = true;
                        trackingData = forwardData.slice(i); // start tracking from entry
                        break;
                    }
                    if (setupDir === 'SHORT' && forwardData[i].high >= breakoutLevel) {
                        entryPrice = breakoutLevel; // Executed
                        entryActive = true;
                        trackingData = forwardData.slice(i);
                        break;
                    }
                }
            }

            if (!entryActive || entryPrice === 0 || isNaN(entryPrice)) {
                // Keep record but mark inactive
                const row = [...baseRowArr, method, 'FALSE', '', '', '', '', '', '', '', '', '', ''];
                fs.appendFileSync(outPath, row.join(',') + '\n', 'utf8');
                writtenRows++;
                continue;
            }

            // Calculate exact Stop Distances from this Entry
            const swingStop = setupDir === 'LONG' ? breakoutCandle.low : breakoutCandle.high;
            const stopSwingPct = Math.abs(entryPrice - swingStop) / entryPrice * 100;
            const stopAtrPct = (atrVal * 1.5) / entryPrice * 100;
            const stopFixedPct = 2.0;

            let mfe = 0, mae = 0;
            let highestHigh = entryPrice, lowestLow = entryPrice;

            for (const fc of trackingData) {
                if (fc.high > highestHigh) highestHigh = fc.high;
                if (fc.low < lowestLow) lowestLow = fc.low;
            }

            if (setupDir === 'LONG') {
                mfe = ((highestHigh - entryPrice) / entryPrice) * 100;
                mae = ((lowestLow - entryPrice) / entryPrice) * 100; // Negative value
            } else {
                mfe = ((entryPrice - lowestLow) / entryPrice) * 100;
                mae = ((entryPrice - highestHigh) / entryPrice) * 100; // Negative value
            }

            // Hold points (Mark to Market)
            const hold1 = trackingData[0] ? ((setupDir === 'LONG' ? trackingData[0].close - entryPrice : entryPrice - trackingData[0].close) / entryPrice * 100) : '';
            const hold3 = trackingData[2] ? ((setupDir === 'LONG' ? trackingData[2].close - entryPrice : entryPrice - trackingData[2].close) / entryPrice * 100) : '';
            const hold5 = trackingData[4] ? ((setupDir === 'LONG' ? trackingData[4].close - entryPrice : entryPrice - trackingData[4].close) / entryPrice * 100) : '';
            const hold10 = trackingData[9] ? ((setupDir === 'LONG' ? trackingData[9].close - entryPrice : entryPrice - trackingData[9].close) / entryPrice * 100) : '';

            const row = [
                ...baseRowArr,
                method, 'TRUE', entryPrice.toFixed(2),
                stopSwingPct.toFixed(2), stopAtrPct.toFixed(2), stopFixedPct.toFixed(2),
                mfe.toFixed(2), mae.toFixed(2),
                typeof hold1 === 'number' ? hold1.toFixed(2) : '',
                typeof hold3 === 'number' ? hold3.toFixed(2) : '',
                typeof hold5 === 'number' ? hold5.toFixed(2) : '',
                typeof hold10 === 'number' ? hold10.toFixed(2) : ''
            ];

            fs.appendFileSync(outPath, row.join(',') + '\n', 'utf8');
            writtenRows++;
        }
        processedSetups++;
    }

    console.log(`Finished processing. Iterated ${processedSetups} setups, generating ${writtenRows} permutations.`);
}

buildDatabaseV2().catch(console.error).finally(() => prisma.$disconnect());
