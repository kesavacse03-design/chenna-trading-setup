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

async function buildDatabase() {
    console.log("=== Building Factor-Outcome Database ===");

    // The CSV headers
    const factorNames = [
        'D_EMA20', 'D_EMA50', 'D_EMA200', 'D_STACK', 'D_SLOPE20', 'D_DIST20',
        'D_RSI', 'D_RSI_ZONE', 'D_ADX', 'D_ATR_PCT', 'D_TREND', 'W_EMA20',
        'W_EMA50', 'W_RSI', 'W_TREND', 'W_RANGE', 'V_RATIO', 'V_TREND',
        'V_SPIKE', 'CP_PIN', 'CP_DOJI', 'CP_ENGULF', 'CP_INSIDE', 'SF_SWEEP',
        'SF_PDH', 'SF_PDL', 'PS_GAP', 'PS_GAPDIR', 'PS_PRICE', 'PS_PREV',
        'PS_PREVR', 'PS_2DAYH', 'PS_2DAYL', 'PS_OR_PCT'
    ];

    const headers = [
        'symbol', 'date', 'category', 'setup_type',
        ...factorNames,
        't1_hit', 't2_hit', 'mfe_pct', 'mae_pct', 'final_result'
    ];

    const outPath = path.join(__dirname, 'factor_analysis_master.csv');
    fs.writeFileSync(outPath, headers.join(',') + '\n', 'utf8');

    // Fetch all stock-category entries in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stocks = await prisma.stockCategory.findMany({
        where: { addedDate: { gte: thirtyDaysAgo } },
        include: { stock: true, category: true }
    });

    console.log(`Processing ${stocks.length} stock-day pairs...`);

    let processedCount = 0;

    for (const sc of stocks) {
        if (!sc.addedDate || !sc.category) continue;
        const targetDateStr = sc.addedDate.toISOString().split('T')[0];
        const sym = sc.stock.symbol;
        const catKey = sc.category.key;

        const factors = calculateAllFactors(sym, targetDateStr);
        if (!factors) continue; // Not enough history or missing cache

        // Calculate Outcome (10-day forward looking)
        const dayData = loadDayCache(sym);
        if (!dayData) continue;

        const targetIdx = dayData.findIndex(d => d.date === targetDateStr);
        if (targetIdx === -1 || targetIdx >= dayData.length - 1) continue;

        const forwardData = dayData.slice(targetIdx + 1, targetIdx + 11);
        if (forwardData.length === 0) continue;

        const breakoutCandle = dayData[targetIdx];
        const entryPrice = breakoutCandle.close; // standard naive entry on close

        // Setup Type determination (LONG vs SHORT) based on category
        let isLong = true;
        if (catKey.includes('DOWNSIDE_LOM_SWING') || catKey.includes('MULTI_SUPPORT_BO') || catKey.includes('ST_SWING_BO_DOWN') || catKey.includes('UPSIDE_LOM_INTRA')) {
            isLong = false;
        }

        const risk = isLong ? (breakoutCandle.high - breakoutCandle.low) : (breakoutCandle.high - breakoutCandle.low);
        const stopLoss = isLong ? breakoutCandle.low : breakoutCandle.high;
        const targetT1 = isLong ? entryPrice + risk : entryPrice - risk;
        const targetT2 = isLong ? entryPrice + (risk * 2) : entryPrice - (risk * 2);

        let hitT1 = 0, hitT2 = 0, hitStop = 0;
        let mfe = 0, mae = 0;
        let highestHigh = entryPrice, lowestLow = entryPrice;

        for (const fc of forwardData) {
            if (fc.high > highestHigh) highestHigh = fc.high;
            if (fc.low < lowestLow) lowestLow = fc.low;

            if (!hitStop) {
                if (isLong) {
                    if (fc.low <= stopLoss) hitStop = 1;
                    if (fc.high >= targetT1 && !hitStop) hitT1 = 1;
                    if (fc.high >= targetT2 && !hitStop) hitT2 = 1;
                } else {
                    if (fc.high >= stopLoss) hitStop = 1;
                    if (fc.low <= targetT1 && !hitStop) hitT1 = 1;
                    if (fc.low <= targetT2 && !hitStop) hitT2 = 1;
                }
            }
        }

        if (isLong) {
            mfe = ((highestHigh - entryPrice) / entryPrice) * 100;
            mae = ((entryPrice - lowestLow) / entryPrice) * 100;
        } else {
            mfe = ((entryPrice - lowestLow) / entryPrice) * 100;
            mae = ((highestHigh - entryPrice) / entryPrice) * 100;
        }

        let finalResult = hitStop ? 'LOSS' : (hitT2 ? 'WIN_T2' : (hitT1 ? 'WIN_T1' : 'FLAT'));

        // Serialize to row
        const row = [
            sym, targetDateStr, catKey, isLong ? 'LONG' : 'SHORT'
        ];

        for (const fname of factorNames) {
            let val = factors[fname] !== undefined && factors[fname] !== null ? factors[fname] : '';
            if (typeof val === 'number') val = val.toFixed(2);
            row.push(val);
        }

        row.push(hitT1, hitT2, mfe.toFixed(2), mae.toFixed(2), finalResult);

        fs.appendFileSync(outPath, row.join(',') + '\n', 'utf8');
        processedCount++;
    }

    console.log(`Finished processing. Wrote ${processedCount} valid rows to factor_analysis_master.csv`);
}

buildDatabase().catch(console.error).finally(() => prisma.$disconnect());
