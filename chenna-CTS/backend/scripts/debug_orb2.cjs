const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const CACHE_DIR_30M = path.join(__dirname, '../../cache/30minute');
const CACHE_DIR_DAY = path.join(__dirname, '../../cache/day');

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

function calcADV20(dayData, targetDateIdx) {
    if (targetDateIdx < 20) return null;
    let sumVol = 0;
    for (let i = targetDateIdx - 20; i < targetDateIdx; i++) sumVol += dayData[i].volume || 0;
    return sumVol / 20;
}

// Global Sector Cache
const sectorDataCache = {}; // date -> { sectorName -> avgPctChange }
let allStocksWithSector = [];

async function buildSectorCache(dates) {
    allStocksWithSector = await prisma.stock.findMany();
    console.log(`Loaded ${allStocksWithSector.length} stocks for sector mapping.`);

    // For each date, we calculate the average % change for each sector
    for (const d of dates) {
        sectorDataCache[d] = {};
        const sectorSums = {};
        const sectorCounts = {};

        for (const st of allStocksWithSector) {
            if (!st.sector) continue;
            const data = loadDayCache(st.symbol);
            if (!data) continue;

            const idx = data.findIndex(c => c.date === d);
            if (idx > 0) {
                const prevClose = data[idx - 1].close;
                const todayClose = data[idx].close;
                const pct = ((todayClose - prevClose) / prevClose) * 100;

                const sName = st.sector;
                if (!sectorSums[sName]) sectorSums[sName] = 0, sectorCounts[sName] = 0;
                sectorSums[sName] += pct;
                sectorCounts[sName]++;
            }
        }

        for (const sName in sectorSums) {
            sectorDataCache[d][sName] = sectorSums[sName] / sectorCounts[sName];
        }
    }
}

async function analyzeIntraday() {
    const records = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } },
        include: { stock: true }
    });

    // Group by Date
    const byDate = {};
    for (const r of records) {
        if (!r.addedDate) continue;
        const d = r.addedDate.toISOString().split('T')[0]; if (d !== '2026-02-19') continue;
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(r.stock);
    }

    const dates = Object.keys(byDate).sort();
    console.log(`Found ${dates.length} distinct INTRADAY_BOOST active dates.`);

    await buildSectorCache(dates);

    let totalAdded = 0;
    let tier1Count = 0;
    let tier1Wins = 0;

    let tier2Count = 0;
    let tier2Wins = 0;

    const sectorStats = {
        alignWin: 0, alignLoss: 0,
        againstWin: 0, againstLoss: 0
    };

    let validDays = 0;

    for (const date of dates) {
        const stocks = byDate[date];
        totalAdded += stocks.length;
        validDays++;

        for (const stock of stocks) {
            const sym = stock.symbol;
            const sName = stock.sector ? stock.sector : 'Unknown';

            const data30 = load30mCache(sym);
            if (!data30 || !data30[date]) continue;
            const candles = data30[date];
            if (candles.length < 5) continue;

            console.log(Checking : data30=, c1=); const dataDay = loadDayCache(sym);
            if (!dataDay) continue;
            const targetDayIdx = dataDay.findIndex(c => c.date === date);
            if (targetDayIdx < 1) continue;

            const prevDay = dataDay[targetDayIdx - 1];
            const adv20 = calcADV20(dataDay, targetDayIdx) || candles[0].volume;

            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;

            const orRangePct = (orRange / parseFloat(c1.open)) * 100;
            const gapPct = ((parseFloat(c1.open) - prevDay.close) / prevDay.close) * 100;
            const pRange = ((prevDay.high - prevDay.low) / prevDay.low) * 100;
            const pGreen = prevDay.close > prevDay.open;
            const pRed = prevDay.open > prevDay.close;

            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i <= 5; i++) {
                if (!candles[i]) continue;
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }
            if (bIdx === -1) continue; // No breakout

            const bCandle = candles[bIdx];
            const vRat = parseFloat(bCandle.volume) / (adv20 / 13);

            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);

            let score = 0;
            if (vRat < 1) score += 30; else if (vRat <= 2) score += 15;
            if (orRangePct < 0.5) score += 25; else if (orRangePct <= 1.0) score += 20; else if (orRangePct <= 1.5) score += 10;
            if (pRed && sType === 'LONG') score += 20; else if (pGreen && sType === 'SHORT') score += 20; else if (pGreen && sType === 'LONG') score += 5; else if (pRed && sType === 'SHORT') score += 5;
            if (pRange < 1.0) score += 15; else if (pRange <= 2.0) score += 10;
            const absGap = Math.abs(gapPct);
            if (absGap < 0.5) score += 10; else if (absGap <= 1.0) score += 7;

            score = Math.min(100, Math.max(0, score));
            let tier = score >= 75 ? 'TIER_1' : score >= 45 ? 'TIER_2' : 'TIER_3';
            if (score < 45) continue; // Skip Tier 3

            let touchedOR = false, piercedIntra = false, entryPrice = 0, entryType = 'RUNNER';
            if (bIdx + 1 >= candles.length) continue;

            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) { touchedOR = true; entryType = 'RETEST'; entryPrice = orh; if (cl <= baseStop) piercedIntra = true; }
                } else {
                    if (!touchedOR && ch >= orl) { touchedOR = true; entryType = 'RETEST'; entryPrice = orl; if (ch >= baseStop) piercedIntra = true; }
                }
            }

            if (touchedOR && piercedIntra) {
                // Instantly stopped out intra-candle
                if (tier === 'TIER_1') tier1Count++;
                if (tier === 'TIER_2') tier2Count++;

                // Track sector alignment fail
                const secPerf = sectorDataCache[date][sName];
                if (secPerf !== undefined) {
                    const isAligned = (secPerf > 0 && sType === 'LONG') || (secPerf < 0 && sType === 'SHORT');
                    if (isAligned) sectorStats.alignLoss++; else sectorStats.againstLoss++;
                }
                continue;
            }

            if (entryType === 'RUNNER') entryPrice = parseFloat(candles[bIdx + 1].open);

            const trueRisk = Math.max(Math.abs(entryPrice - baseStop), entryPrice * 0.005);
            const targetPrice = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;

            let result = 'DRIFT';
            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') {
                    if (cl <= baseStop) { result = 'LOSS'; break; }
                    if (ch >= targetPrice) { result = 'WIN'; break; }
                } else {
                    if (ch >= baseStop) { result = 'LOSS'; break; }
                    if (cl <= targetPrice) { result = 'WIN'; break; }
                }
            }

            if (tier === 'TIER_1') {
                tier1Count++;
                if (result === 'WIN') tier1Wins++;
            }
            if (tier === 'TIER_2') {
                tier2Count++;
                if (result === 'WIN') tier2Wins++;
            }

            const secPerf = sectorDataCache[date][sName];
            if (secPerf !== undefined) {
                const isAligned = (secPerf > 0 && sType === 'LONG') || (secPerf < 0 && sType === 'SHORT');
                if (isAligned) {
                    if (result === 'WIN') sectorStats.alignWin++; else sectorStats.alignLoss++;
                } else {
                    if (result === 'WIN') sectorStats.againstWin++; else sectorStats.againstLoss++;
                }
            }
        }
    }

    console.log(`\n=== INTRADAY TIER & SECTOR ANALYSIS ===\n`);
    const avgAdded = (totalAdded / validDays).toFixed(1);
    console.log(`Avg Configured Stocks per day:  ${avgAdded} stocks`);

    // Total Valid Triggers per day
    const avgT1 = (tier1Count / validDays).toFixed(1);
    const avgT2 = (tier2Count / validDays).toFixed(1);
    console.log(`Avg TIER 1 Signals per day:       ${avgT1}`);
    console.log(`Avg TIER 2 Signals per day:       ${avgT2}`);

    console.log(`\n--- TIER HIT RATES (Target 1:1) ---`);
    console.log(`TIER 1 Hit Rate: ${((tier1Wins / tier1Count) * 100).toFixed(1)}% (${tier1Wins}/${tier1Count})`);
    console.log(`TIER 2 Hit Rate: ${((tier2Wins / tier2Count) * 100).toFixed(1)}% (${tier2Wins}/${tier2Count})`);

    console.log(`\n--- SECTOR ALIGNMENT ---`);
    const alignTotal = sectorStats.alignWin + sectorStats.alignLoss;
    const againstTotal = sectorStats.againstWin + sectorStats.againstLoss;
    console.log(`Aligned with Sector (Sector UP = Long, Sector Down = Short):`);
    console.log(`  Hit Rate: ${((sectorStats.alignWin / alignTotal) * 100).toFixed(1)}% (${sectorStats.alignWin}/${alignTotal})`);

    console.log(`Going Against Sector (Sector UP = Short, Sector Down = Long):`);
    console.log(`  Hit Rate: ${((sectorStats.againstWin / againstTotal) * 100).toFixed(1)}% (${sectorStats.againstWin}/${againstTotal})`);

    console.log(`\nWhat does Tier 1 vs Tier 2 mean?`);
    console.log(`TIER 1 (75 - 100 pts): Perfect setups. Extremely tight opening 30m coil (<0.5%), exceptionally low volume (<1x avg) on breakout, coming off a mean reversion structure (e.g. yesterday red, today goes long). Very high probability targets.`);
    console.log(`TIER 2 (45 - 74 pts): Good standard setups. Medium opening ranges (0.5 - 1.0%), average breakout volume (1x - 2x). Profitable baseline strategy.`);

}

analyzeIntraday().then(() => prisma.$disconnect());
