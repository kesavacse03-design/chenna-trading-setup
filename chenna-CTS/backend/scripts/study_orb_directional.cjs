const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CACHE_DIR_1M = path.join(__dirname, '../cache/1minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

function load1mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_1M, `${cleanKey}_master.json`);
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
            close: parseFloat(c.close)
        })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return null; }
}

function calcEMA(data, startIdx, period) {
    if (startIdx < period - 1) return null;
    // Simple SMA for the first valid period to seed EMA
    let sum = 0;
    for (let i = startIdx - period + 1; i <= startIdx; i++) {
        sum += data[i].close;
    }
    let ema = sum / period;
    const multiplier = 2 / (period + 1);

    // In a real scenario you'd calculate EMA from the very beginning of the dataset
    // For efficiency, we will calculate from startIdx - period*3 to get a stable EMA
    let seedIdx = Math.max(0, startIdx - period * 3);

    // Calculate initial SMA at seedIdx + period - 1
    if (seedIdx + period - 1 <= startIdx) {
        sum = 0;
        for (let i = seedIdx; i < seedIdx + period; i++) sum += data[i].close;
        ema = sum / period;

        for (let i = seedIdx + period; i <= startIdx; i++) {
            ema = (data[i].close - ema) * multiplier + ema;
        }
    }

    return ema;
}

function buildCandles(oneMinCandles, periodSize) {
    const candles = [];
    let current = null;
    for (let c of oneMinCandles) {
        if (!current) {
            current = { ...c, start: c.timeStr, end: c.timeStr, volume: c.volume, count: 1 };
        } else {
            current.high = Math.max(current.high, c.high);
            current.low = Math.min(current.low, c.low);
            current.close = c.close;
            current.end = c.timeStr;
            current.volume += c.volume;
            current.count++;
        }
        if (current.count === periodSize) {
            candles.push(current);
            current = null;
        }
    }
    if (current) candles.push(current);
    return candles;
}

async function main() {
    const THIRTY_DAYS_AGO = new Date();
    THIRTY_DAYS_AGO.setDate(THIRTY_DAYS_AGO.getDate() - 30);

    // Get IB stocks
    const ibCats = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' }, addedDate: { gte: THIRTY_DAYS_AGO } },
        include: { stock: true }
    });

    // Get HPS stocks
    const hpsCats = await prisma.stockCategory.findMany({
        where: { category: { key: 'HIGH_POWERED_STOCKS' }, addedDate: { gte: THIRTY_DAYS_AGO } },
        include: { stock: true }
    });

    const hpsSet = new Set();
    for (const hc of hpsCats) {
        if (hc.stock && hc.addedDate) {
            hpsSet.add(`${hc.stock.symbol}_${hc.addedDate.toISOString().split('T')[0]}`);
        }
    }

    // mapping: date -> list of dual symbols
    const dateMap = {};
    for (const r of ibCats) {
        if (!r.addedDate || !r.stock) continue;
        const dt = r.addedDate.toISOString().split('T')[0];
        const sym = r.stock.symbol;
        if (hpsSet.has(`${sym}_${dt}`)) {
            if (!dateMap[dt]) dateMap[dt] = [];
            dateMap[dt].push(sym);
        }
    }

    const sortedDates = Object.keys(dateMap).sort().slice(-20);
    console.log(`Analyzing Directional ORB across ${sortedDates.length} distinct trading days.`);

    const allSymbols = [...new Set(ibCats.map(r => r.stock?.symbol).filter(Boolean))];
    const fileCache1m = {};
    const fileCacheDay = {};
    for (const sym of allSymbols) {
        const c1 = load1mCache(sym);
        if (c1) fileCache1m[sym] = c1;

        const d1 = loadDayCache(sym);
        if (d1) fileCacheDay[sym] = d1;
    }

    let stats = {
        total: 0,
        longs: 0, shorts: 0,
        t1: 0, t2: 0, stops: 0,
        netR: 0,
        gapHuge: { total: 0, t1: 0 }, // >2%
        gapMed: { total: 0, t1: 0 },  // 0.5-2%
        gapFlat: { total: 0, t1: 0 }  // <0.5%
    };

    const traceLog = [];

    for (const day of sortedDates) {
        const symbols = dateMap[day];
        if (!symbols || symbols.length === 0) continue;

        const candidates = [];

        for (const sym of symbols) {
            const data1m = fileCache1m[sym];
            if (!data1m || !data1m[day]) continue;
            const m1Today = data1m[day];
            if (m1Today.length < 30) continue;

            const dataDay = fileCacheDay[sym];
            if (!dataDay) continue;

            const prevDayIdx = dataDay.findIndex(c => c.date >= day) - 1;
            if (prevDayIdx < 0) continue;

            const prevClose = dataDay[prevDayIdx].close;

            // Calculate EMA 20 up to prevDay
            const ema20 = calcEMA(dataDay, prevDayIdx, 20);
            if (!ema20) continue;

            // Gap % at 09:15
            const c915 = m1Today[0];
            const gapPct = (c915.open - prevClose) / prevClose * 100;

            candidates.push({ sym, gapPct, ema20, prevClose, m1Today });
        }

        // Take top 5 by absolute gap size
        candidates.sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));
        const top5 = candidates.slice(0, 5);

        const isTraceDay = traceLog.filter(l => l.type === 'day').length < 5;
        if (isTraceDay && top5.length > 0) {
            traceLog.push({ type: 'day', day, tops: top5.map(t => `${t.sym} (${t.gapPct.toFixed(2)}%)`) });
        }

        for (const pick of top5) {
            const m1 = pick.m1Today;
            const m5 = buildCandles(m1, 5);
            if (m5.length < 5) continue;

            // Step 3: Direction Confirmation
            const firstCandle = m5[0];
            const isGreen = firstCandle.close >= firstCandle.open;
            const isRed = firstCandle.close < firstCandle.open;

            let bias = null;
            if (pick.gapPct > 0 && isGreen) bias = 'LONG';
            else if (pick.gapPct < 0 && isRed) bias = 'SHORT';
            else continue; // Contradiction

            // Daily Trend Check
            if (bias === 'LONG' && pick.prevClose < pick.ema20) continue;
            if (bias === 'SHORT' && pick.prevClose > pick.ema20) continue;

            // Step 4: Define ORB
            let orbEndIdx = 0;
            let orbHigh = firstCandle.high;
            let orbLow = firstCandle.low;

            for (let i = 1; i < m5.length; i++) {
                const cx = m5[i];
                orbHigh = Math.max(orbHigh, cx.high);
                orbLow = Math.min(orbLow, cx.low);

                const cxGreen = cx.close > cx.open;
                const cxRed = cx.close < cx.open;

                if ((isGreen && cxRed) || (isRed && cxGreen)) {
                    orbEndIdx = i;
                    break;
                }
                if (i >= 6) { // Prorate to 30 mins
                    break;
                }
            }

            if (orbEndIdx === 0 || orbEndIdx >= 6) continue;

            // Step 5: Entry
            let entryPrice = 0, stopLoss = 0, entryTime = null;
            let setupFound = false;

            for (let i = orbEndIdx + 1; i < Math.min(m5.length, 36); i++) { // look till ~12:15 PM
                const cx = m5[i];

                if (bias === 'LONG' && cx.close > orbHigh) {
                    entryPrice = cx.close;
                    entryTime = cx.end;
                    // retracement low? Just use ORB Low for strictness
                    stopLoss = orbLow;
                    setupFound = true;
                    break;
                } else if (bias === 'SHORT' && cx.close < orbLow) {
                    entryPrice = cx.close;
                    entryTime = cx.end;
                    stopLoss = orbHigh;
                    setupFound = true;
                    break;
                }
            }

            if (!setupFound) continue;

            const risk = Math.abs(entryPrice - stopLoss);
            if (risk / entryPrice < 0.002 || risk / entryPrice > 0.03) continue; // Skip massive or tiny risks

            const t1 = bias === 'LONG' ? entryPrice + risk : entryPrice - risk;
            const t2 = bias === 'LONG' ? entryPrice + (2 * risk) : entryPrice - (2 * risk);

            // Monitor Trade on 1m
            let hitT1 = false, hitT2 = false, hitStop = false;
            let finalPnl = 0, exitReason = '12:30_HARD_EXIT', resolveTime = '12:30:00';
            let currentStop = stopLoss;
            let positionSize = 1.0; // 100%
            let realizedR = 0;

            const startIdx = m1.findIndex(c => c.timeStr >= entryTime);
            if (startIdx === -1) continue;

            for (let i = startIdx + 1; i < m1.length; i++) {
                const mx = m1[i];

                if (mx.timeStr >= '12:30:00') {
                    // Hard exit remainder
                    if (positionSize > 0) {
                        const exitPrice = mx.close;
                        const pnl = bias === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
                        realizedR += (pnl / risk) * positionSize;
                        positionSize = 0;
                    }
                    if (exitReason !== 'STOP') exitReason = '12:30_HARD_EXIT';
                    resolveTime = mx.timeStr;
                    break;
                }

                if (bias === 'LONG') {
                    if (mx.low <= currentStop) {
                        const pnl = currentStop - entryPrice;
                        realizedR += (pnl / risk) * positionSize;
                        positionSize = 0;
                        if (!hitT1) { hitStop = true; exitReason = 'STOP'; resolveTime = mx.timeStr; }
                        else { exitReason = 'BE_STOP'; resolveTime = mx.timeStr; }
                        break;
                    }
                    if (!hitT1 && mx.high >= t1) {
                        hitT1 = true;
                        realizedR += 1.0 * 0.7; // book 70% at 1R
                        positionSize = 0.3;     // 30% left
                        currentStop = entryPrice; // move stop to entry
                    }
                    if (!hitT2 && mx.high >= t2) {
                        hitT2 = true;
                        // Simplification: We could trail 30%, but let's assume T2 catches the rest
                        realizedR += 2.0 * positionSize;
                        positionSize = 0;
                        exitReason = 'T2_HIT';
                        resolveTime = mx.timeStr;
                        break;
                    }
                } else {
                    if (mx.high >= currentStop) {
                        const pnl = entryPrice - currentStop;
                        realizedR += (pnl / risk) * positionSize;
                        positionSize = 0;
                        if (!hitT1) { hitStop = true; exitReason = 'STOP'; resolveTime = mx.timeStr; }
                        else { exitReason = 'BE_STOP'; resolveTime = mx.timeStr; }
                        break;
                    }
                    if (!hitT1 && mx.low <= t1) {
                        hitT1 = true;
                        realizedR += 1.0 * 0.7; // book 70%
                        positionSize = 0.3;
                        currentStop = entryPrice; // move stop to breakeven
                    }
                    if (!hitT2 && mx.low <= t2) {
                        hitT2 = true;
                        realizedR += 2.0 * positionSize;
                        positionSize = 0;
                        exitReason = 'T2_HIT';
                        resolveTime = mx.timeStr;
                        break;
                    }
                }
            }

            if (positionSize > 0) {
                const lx = m1[m1.length - 1];
                const exitPrice = lx.close;
                const pnl = bias === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
                realizedR += (pnl / risk) * positionSize;
                resolveTime = lx.timeStr;
            }

            // Stats
            stats.total++;
            stats.netR += realizedR;
            if (bias === 'LONG') stats.longs++; else stats.shorts++;
            if (hitT1) stats.t1++;
            if (hitT2) stats.t2++;
            if (hitStop) stats.stops++;

            const absGap = Math.abs(pick.gapPct);
            if (absGap > 2.0) { stats.gapHuge.total++; if (hitT1) stats.gapHuge.t1++; }
            else if (absGap >= 0.5) { stats.gapMed.total++; if (hitT1) stats.gapMed.t1++; }
            else { stats.gapFlat.total++; if (hitT1) stats.gapFlat.t1++; }

            if (isTraceDay) {
                traceLog.push({ type: 'trade', sym: pick.sym, gap: pick.gapPct, bias, orbHigh, orbLow, range: orbHigh - orbLow, entryPrice, stopLoss, risk, t1, t2, hitT1, hitT2, hitStop, realizedR, resolveTime, exitReason });
            }
        }
    }

    const outLines = [];
    outLines.push(`=== DIRECTION-ALIGNED ORB STUDY ===`);
    outLines.push(`Total Trades Triggered : ${stats.total}`);
    if (stats.total > 0) {
        outLines.push(`T1 Hit Rate (1:1 R)    : ${((stats.t1 / stats.total) * 100).toFixed(1)}%`);
        outLines.push(`T2 Hit Rate (1:2 R)    : ${((stats.t2 / stats.total) * 100).toFixed(1)}%`);
        outLines.push(`Stop Hit Rate          : ${((stats.stops / stats.total) * 100).toFixed(1)}%`);
        outLines.push(`Net Return (R)         : ${stats.netR.toFixed(2)} R`);

        outLines.push(`\nBreakdown by Type:`);
        outLines.push(`  LONG Trades  : ${stats.longs}`);
        outLines.push(`  SHORT Trades : ${stats.shorts}`);

        outLines.push(`\nBreakdown by Gap Size:`);
        if (stats.gapHuge.total > 0) outLines.push(`  Gap > 2%     : ${stats.gapHuge.total} trades | T1 WR: ${(stats.gapHuge.t1 / stats.gapHuge.total * 100).toFixed(1)}%`);
        if (stats.gapMed.total > 0) outLines.push(`  Gap 0.5-2%   : ${stats.gapMed.total} trades | T1 WR: ${(stats.gapMed.t1 / stats.gapMed.total * 100).toFixed(1)}%`);
        if (stats.gapFlat.total > 0) outLines.push(`  Flat (<0.5%) : ${stats.gapFlat.total} trades | T1 WR: ${(stats.gapFlat.t1 / stats.gapFlat.total * 100).toFixed(1)}%`);
    }

    outLines.push(`\n=== PROOF TRACE (First 5 Days) ===`);
    for (const lg of traceLog) {
        if (lg.type === 'day') {
            outLines.push(`\nDate: ${lg.day}`);
            outLines.push(`  Top 5 Gaps (Dual IB+HPS): ${lg.tops.join(', ')}`);
        } else {
            outLines.push(`  Stock: ${lg.sym}`);
            outLines.push(`    Gap: ${lg.gap.toFixed(2)}% | Direction Bias: ${lg.bias}`);
            outLines.push(`    ORB High: ₹${lg.orbHigh} | ORB Low: ₹${lg.orbLow} | Range: ₹${lg.range.toFixed(2)}`);
            outLines.push(`    Breakout (${lg.bias}) | Entry: ₹${lg.entryPrice} | Stop: ₹${lg.stopLoss} | Risk: ₹${lg.risk.toFixed(2)}`);
            outLines.push(`    T1 (1:1): ₹${lg.t1.toFixed(2)} — ${lg.hitT1 ? 'HIT ✓' : 'MISSED'}`);
            outLines.push(`    T2 (1:2): ₹${lg.t2.toFixed(2)} — ${lg.hitT2 ? 'HIT ✓' : 'MISSED'}`);
            outLines.push(`    Hard Stop Hit? ${lg.hitStop ? 'YES' : 'NO'}`);
            outLines.push(`    Final Result: ${lg.realizedR.toFixed(2)} R | Resolved: ${lg.resolveTime} (${lg.exitReason})`);
        }
    }

    fs.writeFileSync(path.join(__dirname, 'clean_directional_orb_out.txt'), outLines.join('\n'));
    console.log("Done computing Directional ORB. Results saved to clean_directional_orb_out.txt");
}

main().catch(console.error).finally(() => prisma.$disconnect());
