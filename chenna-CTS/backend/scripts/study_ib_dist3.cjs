const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

function load30mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')).reduce((acc, c) => {
        const d = String(c.timestamp || c.date).split('T')[0];
        if (!acc[d]) acc[d] = [];
        acc[d].push(c);
        return acc;
    }, {});
}

function loadDayCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_DAY, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')).map(c => ({
        date: String(c.timestamp || c.date).split('T')[0],
        close: parseFloat(c.close), open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low)
    })).sort((a, b) => a.date.localeCompare(b.date));
}

const sectorDataCache = {}; const niftyDataCache = {};

async function buildSyntheticCache(dates) {
    const allStocks = await prisma.stock.findMany();
    const niftyPath = path.join(__dirname, '../cache/day/NIFTY50_2020-01-01_2026-12-31.json');
    let niftyData = [];
    if (fs.existsSync(niftyPath)) {
        niftyData = JSON.parse(fs.readFileSync(niftyPath, 'utf8')).data.map(c => ({ date: String(c.timestamp || c.date).split('T')[0], close: parseFloat(c.close) })).sort((a, b) => a.date.localeCompare(b.date));
    }
    for (const d of dates) {
        sectorDataCache[d] = {};
        const sums = {}, counts = {};
        for (const st of allStocks) {
            if (!st.sector) continue;
            const data = loadDayCache(st.symbol);
            if (!data) continue;
            const idx = data.findIndex(c => c.date === d);
            if (idx > 0) {
                const pct = ((data[idx].close - data[idx - 1].close) / data[idx - 1].close) * 100;
                if (!sums[st.sector]) sums[st.sector] = 0, counts[st.sector] = 0;
                sums[st.sector] += pct;
                counts[st.sector]++;
            }
        }
        for (const s in sums) sectorDataCache[d][s] = sums[s] / counts[s];
        const nIdx = niftyData.findIndex(c => c.date === d);
        if (nIdx > 0) niftyDataCache[d] = ((niftyData[nIdx].close - niftyData[nIdx - 1].close) / niftyData[nIdx - 1].close) * 100;
    }
}

async function evaluateNewScore() {
    const records = await prisma.stockCategory.findMany({ where: { category: { key: 'INTRADAY_BOOST' } }, include: { stock: true } });
    const uniqueMap = new Map();
    for (const r of records) uniqueMap.set(r.stock.symbol, r.stock);
    const universeStocks = Array.from(uniqueMap.values());

    const allTradingDates = [
        '2025-10-31', '2025-11-20', '2025-12-19', '2026-01-08',
        '2026-02-13', '2026-02-16', '2026-02-17', '2026-02-18',
        '2026-02-19', '2026-02-20'
    ];

    await buildSyntheticCache(allTradingDates);

    const dist = {};

    for (const date of allTradingDates) {
        for (const stock of universeStocks) {
            const sym = stock.symbol;
            const candles = load30mCache(sym)?.[date];
            if (!candles || candles.length < 5) continue;

            const dataDay = loadDayCache(sym);
            if (!dataDay) continue;
            const targetDayIdx = dataDay.findIndex(c => c.date === date);
            if (targetDayIdx < 1) continue;

            const prevDay = dataDay[targetDayIdx - 1];
            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), op = parseFloat(c1.open);
            const orRangePct = Math.abs(((orh - orl) / op) * 100);
            const pRange = Math.abs(((prevDay.high - prevDay.low) / prevDay.low) * 100);

            let bIdx = -1, sType = null;
            for (let i = 1; i <= 5; i++) {
                if (!candles[i]) continue;
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; break; }
            }
            if (bIdx === -1 || bIdx + 1 >= candles.length) continue;

            const baseStop = sType === 'LONG' ? parseFloat(candles[bIdx].low) : parseFloat(candles[bIdx].high);
            let touchedOR = false, piercedIntra = false, entryPrice = 0, entryType = 'RUNNER';

            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) { touchedOR = true; entryType = 'RETEST'; entryPrice = orh; if (cl <= baseStop) piercedIntra = true; }
                } else {
                    if (!touchedOR && ch >= orl) { touchedOR = true; entryType = 'RETEST'; entryPrice = orl; if (ch >= baseStop) piercedIntra = true; }
                }
            }

            if (touchedOR && piercedIntra) continue;
            if (entryType === 'RUNNER') entryPrice = parseFloat(candles[bIdx + 1].open);

            const trueRisk = Math.max(Math.abs(entryPrice - baseStop), entryPrice * 0.005);
            const targetPrice = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;

            let isWin = false;
            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') { if (cl <= baseStop) break; if (ch >= targetPrice) { isWin = true; break; } }
                else { if (ch >= baseStop) break; if (cl <= targetPrice) { isWin = true; break; } }
            }

            // --- NEW SCORING ALGORITHM ---
            let score = 0;
            const sName = stock.sector || 'UNKNOWN';
            const sectorPerf = sectorDataCache[date]?.[sName] || 0;
            const niftyPerf = niftyDataCache[date] || 0;

            const sAlign = (sectorPerf > 0 && sType === 'LONG') || (sectorPerf < 0 && sType === 'SHORT');
            const nAlign = (niftyPerf > 0 && sType === 'LONG') || (niftyPerf < 0 && sType === 'SHORT');

            if (sAlign && nAlign) {
                score += 45;
                if ((sType === 'LONG' && sectorPerf > 0.5) || (sType === 'SHORT' && sectorPerf < -0.5)) score += 15;
            }
            else if (sAlign && !nAlign) score += 30;
            else if (!sAlign && nAlign) score += 20;

            if ((sType === 'LONG' && sectorPerf > 0.5) || (sType === 'SHORT' && sectorPerf < -0.5)) score += 15;
            if (pRange > 2.0) score += 15;
            else if (pRange > 1.0) score += 5;
            if (orRangePct > 1.0) score += 10;
            else if (orRangePct > 0.5) score += 5;

            score = Math.min(100, Math.max(0, score));

            if (!dist[score]) dist[score] = { w: 0, l: 0, total: 0 };
            dist[score].total++;
            if (isWin) dist[score].w++; else dist[score].l++;
        }
    }

    console.log(`\n=== EXACT SCORE DISTRIBUTION FOR 626 SETUPS ===\n`);
    const sorted = Object.keys(dist).sort((a, b) => Number(b) - Number(a));
    let cum = 0;

    for (const s of sorted) {
        const d = dist[s];
        cum += d.total;
        const wr = d.w + d.l > 0 ? ((d.w / (d.w + d.l)) * 100).toFixed(1) : 0;
        console.log(`Score ${s.padStart(3, ' ')} -> Count: ${String(d.total).padStart(3, ' ')} | Cumul: ${String(cum).padStart(3, ' ')} (${((cum / 626) * 100).toFixed(1)}%) | Hit ${wr}%`);
    }
}

evaluateNewScore().then(() => prisma.$disconnect());
