const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { calcAllRound2Factors, loadDayCache } = require('./factorCalculator.cjs');

function calcSMA(data, startIdx, period) {
    if (startIdx < period - 1) return null;
    let sum = 0;
    for (let i = startIdx - period + 1; i <= startIdx; i++) sum += data[i].close;
    return sum / period;
}

// 6. Formatting for the CSV
const factorNames = [
    'NR7', 'NR4', 'INSIDER', 'INSIDER_NR7', 'VCP_SCORE', 'ATR_CONTRACT',
    'BO_N_DAY', 'TOUCH_COUNT', 'LEVEL_AGE', 'RSI2', 'RSI2_CUM', 'STOCH_RSI',
    'MACD_HIST', 'MACD_HIST_SLOPE', 'VOL_BUILDUP', 'ACCUM', 'BO_VOL_RATIO',
    'D_EMA20', 'D_EMA50', 'D_EMA200', 'D_STACK', 'PS_GAP', 'W_EMA20'
];

async function buildBounceBacktest() {
    console.log("=== Building Bounce Backtest: SHORT_TERM_SWING_BO_DOWN ===");

    const headers = [
        'symbol', 'signal_date', 'entry_date', 'days_to_entry',
        'entry_price', 'stop_price', 'risk_pct', 'target_1_price', 'target_2_price',
        ...factorNames,
        'result_1r', 'result_2r', 'result_3r', 'mfe_pct', 'mae_pct'
    ];

    const outPath = path.join(__dirname, 'bounce_backtest_results.csv');
    fs.writeFileSync(outPath, headers.join(',') + '\n', 'utf8');

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const stocks = await prisma.stockCategory.findMany({
        where: {
            addedDate: { gte: ninetyDaysAgo },
            category: { key: 'SHORT_TERM_SWING_BO_DOWN' }
        },
        include: { stock: true }
    });

    console.log(`Processing ${stocks.length} signal setups for Long Bounces...`);

    let processedSetups = 0;
    let validBounces = 0;

    for (const sc of stocks) {
        if (!sc.addedDate || !sc.stock) continue;
        const sym = sc.stock.symbol;
        const signalDateStr = sc.addedDate.toISOString().split('T')[0];

        const dayData = loadDayCache(sym);
        if (!dayData) continue;

        const sigIdx = dayData.findIndex(d => d.date === signalDateStr);
        if (sigIdx === -1 || sigIdx >= dayData.length - 1) continue;

        processedSetups++;

        // 2. Scan forward from Day 1 to Day 15
        let entryIdx = -1;
        let absoluteLow = dayData[sigIdx].low;

        for (let i = sigIdx; i < Math.min(sigIdx + 16, dayData.length); i++) {
            if (dayData[i].low < absoluteLow) absoluteLow = dayData[i].low;

            // wait for at least Day 1 (post signal)
            if (i > sigIdx) {
                const sma10 = calcSMA(dayData, i, 10);
                if (sma10 && dayData[i].close > sma10) {
                    entryIdx = i;
                    break;
                }
            }
        }

        if (entryIdx === -1) continue; // No bounce entry found

        const daysToEntry = entryIdx - sigIdx;
        const entryPrice = dayData[entryIdx].close;
        const entryDateStr = dayData[entryIdx].date;

        // Stop calculation
        const stopPrice = absoluteLow * 0.995; // Small buffer
        if (stopPrice >= entryPrice) continue; // Invalid

        const riskVal = entryPrice - stopPrice;
        const riskPct = (riskVal / entryPrice) * 100;

        const t1Price = entryPrice + riskVal;
        const t2Price = entryPrice + (riskVal * 2);
        const t3Price = entryPrice + (riskVal * 3);

        // 4. Calculate factors on ENTRY date, not signal date
        // Since we are buying the dip, we set setupDirection to LONG for the factor calculations
        const factors = calcAllRound2Factors(sym, entryDateStr, 'LONG');
        if (!factors) continue;

        const factorVals = factorNames.map(fn => {
            let val = factors[fn];
            if (val === null || val === undefined || isNaN(val) && val !== 'NULL' && typeof val !== 'string' && typeof val !== 'boolean') return 'NULL';
            if (typeof val === 'number') {
                if (!isFinite(val)) return 'NULL';
                return val.toFixed(4); // Keep precision
            }
            return String(val);
        });

        // 3. Track forward for exits
        let mfe = 0, mae = 0;
        let res1r = 0, res2r = 0, res3r = 0; // 0=Flat/Time, 1=Win, -1=Loss
        let hitStop = false, hitT1 = false, hitT2 = false, hitT3 = false;

        for (let i = entryIdx + 1; i < Math.min(entryIdx + 21, dayData.length); i++) {
            const h = dayData[i].high;
            const l = dayData[i].low;

            const dayMfe = ((h - entryPrice) / entryPrice) * 100;
            const dayMae = ((l - entryPrice) / entryPrice) * 100;

            if (dayMfe > mfe) mfe = dayMfe;
            if (dayMae < mae) mae = dayMae;

            // Check if stop hit
            if (!hitStop && l <= stopPrice) hitStop = true;

            // Check if targets hit before stop
            if (!hitStop) {
                if (!hitT1 && h >= t1Price) hitT1 = true;
                if (!hitT2 && h >= t2Price) hitT2 = true;
                if (!hitT3 && h >= t3Price) hitT3 = true;
            }

            // Exits logic
            if (hitStop) {
                if (!hitT1) res1r = -1;
                if (!hitT2) res2r = -1;
                if (!hitT3) res3r = -1;
                break; // Trade is over
            }

            if (i - entryIdx === 10) {
                // Day 10 time stop
                if (!hitStop) {
                    if (hitT1) res1r = 1;
                    if (hitT2) res2r = 1;
                    if (hitT3) res3r = 1;
                }
                break;
            }
        }

        // If end of loop and no stop hit but we reached end of data
        if (!hitStop) {
            if (hitT1) res1r = 1;
            if (hitT2) res2r = 1;
            if (hitT3) res3r = 1;
        }

        validBounces++;
        const row = [
            sym, signalDateStr, entryDateStr, daysToEntry,
            entryPrice.toFixed(2), stopPrice.toFixed(2), riskPct.toFixed(2), t1Price.toFixed(2), t2Price.toFixed(2),
            ...factorVals,
            res1r, res2r, res3r, mfe.toFixed(2), mae.toFixed(2)
        ];

        fs.appendFileSync(outPath, row.join(',') + '\n', 'utf8');
    }

    console.log(`Finished processing. Found ${validBounces} valid SMA10 reclaim bounces out of ${processedSetups} total setups.`);
}

buildBounceBacktest().then(() => {
    console.log("Done.");
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
