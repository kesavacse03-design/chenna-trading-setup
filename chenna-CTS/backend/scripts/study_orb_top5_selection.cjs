const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

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

function calculateADV20(dayData, targetDateIdx) {
    if (targetDateIdx < 20) return null;
    let sumVol = 0;
    for (let i = targetDateIdx - 20; i < targetDateIdx; i++) {
        sumVol += dayData[i].volume || 0;
    }
    return sumVol / 20;
}

async function main() {
    console.log("Loading universe from Database...");

    // Get all IB stocks categorized ever
    const ibCats = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } }
    });

    // mapping: date -> list of symbols
    const dateMap = {};
    const allSymbolsSet = new Set();

    // To get the actual symbols we need the stock relation
    // We didn't include it in findMany to save memory if too large, but let's query stock symbols
    const stocks = await prisma.stock.findMany({
        where: { id: { in: [...new Set(ibCats.map(c => c.stockId))] } },
        select: { id: true, symbol: true }
    });
    const symMap = {};
    stocks.forEach(s => symMap[s.id] = s.symbol);

    for (const r of ibCats) {
        if (!r.addedDate) continue;
        const dt = r.addedDate.toISOString().split('T')[0];
        const sym = symMap[r.stockId];
        if (!sym) continue;

        allSymbolsSet.add(sym);
        if (!dateMap[dt]) dateMap[dt] = [];
        dateMap[dt].push(sym);
    }

    const sortedDates = Object.keys(dateMap).sort();
    console.log(`Analyzing ORB rankings across ${sortedDates.length} trading days.`);

    // Pre-load caches
    const fileCache30m = {};
    const fileCacheDay = {};
    for (const sym of Array.from(allSymbolsSet)) {
        const c30 = load30mCache(sym);
        if (c30) fileCache30m[sym] = c30;

        const cD = loadDayCache(sym);
        if (cD) fileCacheDay[sym] = cD;
    }

    // Stats buckets
    const aggregate = {
        all: { total: 0, triggers: 0, t1: 0, t2: 0, stop: 0 },
        top5Body: { total: 0, triggers: 0, t1: 0, t2: 0, stop: 0 },
        bot5Body: { total: 0, triggers: 0, t1: 0, t2: 0, stop: 0 },
        top5Gap: { total: 0, triggers: 0, t1: 0, t2: 0, stop: 0 },
        top5Vol: { total: 0, triggers: 0, t1: 0, t2: 0, stop: 0 },
        top5Range: { total: 0, triggers: 0, t1: 0, t2: 0, stop: 0 }
    };

    for (const day of sortedDates) {
        const symbols = dateMap[day];
        const dayMetrics = [];

        for (const sym of symbols) {
            const data30 = fileCache30m[sym];
            if (!data30 || !data30[day]) continue;

            const c30Today = data30[day];
            if (c30Today.length < 5) continue;

            const dataDay = fileCacheDay[sym];
            if (!dataDay) continue;
            const targetDayIdx = dataDay.findIndex(c => c.date >= day);
            if (targetDayIdx < 1) continue; // Need prev day

            const prevDay = dataDay[targetDayIdx - 1];
            const adv20 = calculateADV20(dataDay, targetDayIdx);

            const c1 = c30Today[0];
            const o = parseFloat(c1.open);
            const h = parseFloat(c1.high);
            const l = parseFloat(c1.low);
            const c = parseFloat(c1.close);
            const v = parseFloat(c1.volume);

            const gapPct = Math.abs((o - prevDay.close) / prevDay.close * 100);
            const bodyPct = Math.abs(c - o) / o * 100;
            const rangePct = (h - l) / o * 100;
            const volSurge = adv20 ? (v / adv20) : 0;

            // Determine ORB outcome for this stock
            let triggered = false;
            let hitT1 = false;
            let hitT2 = false;
            let hitStop = false;

            let breakoutCandleIdx = -1;
            let setupType = null;
            let entryPrice = 0, stopLoss = 0;
            let orbHigh = h, orbLow = l;

            for (let i = 1; i < c30Today.length; i++) {
                const cx = c30Today[i];
                const cls = parseFloat(cx.close);
                if (cls > orbHigh) {
                    breakoutCandleIdx = i; setupType = 'LONG'; entryPrice = cls; stopLoss = orbLow; triggered = true; break;
                } else if (cls < orbLow) {
                    breakoutCandleIdx = i; setupType = 'SHORT'; entryPrice = cls; stopLoss = orbHigh; triggered = true; break;
                }
            }

            if (triggered) {
                const risk = Math.abs(entryPrice - stopLoss);
                if (risk === 0) {
                    triggered = false; // invalid
                } else {
                    const t1 = setupType === 'LONG' ? entryPrice + risk : entryPrice - risk;
                    const t2 = setupType === 'LONG' ? entryPrice + (2 * risk) : entryPrice - (2 * risk);

                    for (let j = breakoutCandleIdx + 1; j < c30Today.length; j++) {
                        const cx = c30Today[j];
                        const cxH = parseFloat(cx.high);
                        const cxL = parseFloat(cx.low);

                        if (setupType === 'LONG') {
                            if (cxL <= stopLoss) { hitStop = true; break; }
                            if (!hitT1 && cxH >= t1) hitT1 = true;
                            if (cxH >= t2) { hitT2 = true; hitT1 = true; break; }
                        } else {
                            if (cxH >= stopLoss) { hitStop = true; break; }
                            if (!hitT1 && cxL <= t1) hitT1 = true;
                            if (cxL <= t2) { hitT2 = true; hitT1 = true; break; }
                        }
                    }
                }
            }

            const result = { sym, triggered, hitT1, hitT2, hitStop };
            dayMetrics.push({ sym, gapPct, bodyPct, rangePct, volSurge, result });

            // Add to baseline "all"
            aggregate.all.total++;
            if (triggered) {
                aggregate.all.triggers++;
                if (hitT1) aggregate.all.t1++;
                if (hitT2) aggregate.all.t2++;
                if (hitStop) aggregate.all.stop++;
            }
        }

        if (dayMetrics.length === 0) continue;

        // Helper to tabulate
        const addBucket = (bucketName, arr) => {
            for (const item of arr) {
                aggregate[bucketName].total++;
                if (item.result.triggered) {
                    aggregate[bucketName].triggers++;
                    if (item.result.hitT1) aggregate[bucketName].t1++;
                    if (item.result.hitT2) aggregate[bucketName].t2++;
                    if (item.result.hitStop) aggregate[bucketName].stop++;
                }
            }
        };

        // Rank by Body %
        dayMetrics.sort((a, b) => b.bodyPct - a.bodyPct);
        addBucket('top5Body', dayMetrics.slice(0, 5));
        addBucket('bot5Body', dayMetrics.slice(-5));

        // Rank by Gap %
        dayMetrics.sort((a, b) => b.gapPct - a.gapPct);
        addBucket('top5Gap', dayMetrics.slice(0, 5));

        // Rank by Range %
        dayMetrics.sort((a, b) => b.rangePct - a.rangePct);
        addBucket('top5Range', dayMetrics.slice(0, 5));

        // Rank by Vol Surge
        dayMetrics.sort((a, b) => b.volSurge - a.volSurge);
        addBucket('top5Vol', dayMetrics.slice(0, 5));
    }

    // Pretty Print
    const formatOut = (name, b) => {
        if (b.triggers === 0) return `${name}: No triggers.`;
        const wr = (b.t1 / b.triggers) * 100;
        const t2 = (b.t2 / b.triggers) * 100;
        const sr = (b.stop / b.triggers) * 100;
        return `  ${name}:
    Total samples: ${b.total} | Breakout Triggers: ${b.triggers} (${((b.triggers / b.total) * 100).toFixed(1)}%)
    T1 (1:1): ${wr.toFixed(1)}% | T2 (1:2): ${t2.toFixed(1)}% | Stop: ${sr.toFixed(1)}%`;
    };

    console.log(`\n=== 30-MIN ORB RANKING STUDY ===`);
    console.log(formatOut("ALL 49 STOCKS (UNFILTERED)", aggregate.all));
    console.log('');
    console.log(formatOut("TOP 5 BY FIRST CANDLE BODY %", aggregate.top5Body));
    console.log(formatOut("BOTTOM 5 BY FIRST CANDLE BODY %", aggregate.bot5Body));
    console.log('');
    console.log(formatOut("TOP 5 BY ABSOLUTE GAP %", aggregate.top5Gap));
    console.log(formatOut("TOP 5 BY FIRST CANDLE RANGE %", aggregate.top5Range));
    console.log(formatOut("TOP 5 BY VOLUME SURGE VS ADV20", aggregate.top5Vol));

}

main().catch(console.error).finally(() => prisma.$disconnect());
