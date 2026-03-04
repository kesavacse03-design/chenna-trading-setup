const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CACHE_DIR = path.join(__dirname, '../cache/1minute');

function load1mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        // Group by day for easier traversal
        const byDay = {};
        for (const c of raw) {
            // raw timestamp is like 2026-02-16T09:15:00+05:30
            // Safely parse it keeping IST (assume the timestamp is already ISO with +05:30 or similar)
            // Just use string splitting because Upstox timestamp format is predictable: "YYYY-MM-DDTHH:mm:ss+05:30"
            const parts = c.timestamp.split('T');
            const d = parts[0];
            const t = parts[1].substring(0, 8); // "09:15:00"
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push({ ...c, timeStr: t });
        }
        return byDay;
    } catch (e) { return null; }
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
    if (current) candles.push(current); // push remainder
    return candles;
}

function runORB(candles, oneMinCandles) {
    if (candles.length < 5) return null; // Not enough data

    // Find initial trend and opposite color
    const c1 = candles[0];
    const isC1Green = c1.close >= c1.open;

    let orbEndIdx = 0;
    let orbHigh = c1.high;
    let orbLow = c1.low;

    for (let i = 1; i < candles.length; i++) {
        const cx = candles[i];
        orbHigh = Math.max(orbHigh, cx.high);
        orbLow = Math.min(orbLow, cx.low);

        const isGreen = cx.close > cx.open;
        const isRed = cx.close < cx.open;

        // If color reversed
        if ((isC1Green && isRed) || (!isC1Green && isGreen)) {
            orbEndIdx = i;
            break;
        }

        // Timeout if ORB never ends (e.g., straight trend till 10:30)
        if (i > 10) {
            break; // Let's cap ORB formulation at ~10 candles max
        }
    }

    if (orbEndIdx === 0 || orbEndIdx > 10) return null; // No proper ORB formed

    // Breakout Watch
    let breakoutCandle = null;
    let setupType = null;

    for (let i = orbEndIdx + 1; i < Math.min(candles.length, 30); i++) { // Only look for breakouts in first couple hours
        const cx = candles[i];
        if (cx.close > orbHigh) {
            breakoutCandle = cx;
            setupType = 'LONG';
            break;
        } else if (cx.close < orbLow) {
            breakoutCandle = cx;
            setupType = 'SHORT';
            break;
        }
    }

    if (!breakoutCandle) return null;

    const entryPrice = breakoutCandle.close;
    const entryTime = breakoutCandle.end;
    let stopLoss = setupType === 'LONG' ? orbLow : orbHigh;
    let risk = Math.abs(entryPrice - stopLoss);

    // Too tight or too loose risk rejection?
    if (risk / entryPrice < 0.002 || risk / entryPrice > 0.05) return null;

    const t1 = setupType === 'LONG' ? entryPrice + risk : entryPrice - risk;
    const t2 = setupType === 'LONG' ? entryPrice + (2 * risk) : entryPrice - (2 * risk);

    // Monitor minute-by-minute starting from breakout time
    let hitT1 = false;
    let hitT2 = false;
    let hitStop = false;
    let finalPnl = 0;
    let resolveTime = null;
    let exitReason = 'EOD';

    const minStartIdx = oneMinCandles.findIndex(c => c.timeStr >= entryTime);
    if (minStartIdx === -1) return null;

    for (let i = minStartIdx + 1; i < oneMinCandles.length; i++) {
        const mx = oneMinCandles[i];

        if (setupType === 'LONG') {
            if (mx.low <= stopLoss) {
                hitStop = true;
                finalPnl = stopLoss - entryPrice;
                resolveTime = mx.timeStr;
                exitReason = 'STOP';
                break;
            }
            if (!hitT1 && mx.high >= t1) { hitT1 = true; }
            if (mx.high >= t2) {
                hitT2 = true;
                hitT1 = true;
                finalPnl = t2 - entryPrice;
                resolveTime = mx.timeStr;
                exitReason = 'T2';
                break;
            }
        } else {
            if (mx.high >= stopLoss) {
                hitStop = true;
                finalPnl = entryPrice - stopLoss;
                resolveTime = mx.timeStr;
                exitReason = 'STOP';
                break;
            }
            if (!hitT1 && mx.low <= t1) { hitT1 = true; }
            if (mx.low <= t2) {
                hitT2 = true;
                hitT1 = true;
                finalPnl = entryPrice - t2;
                resolveTime = mx.timeStr;
                exitReason = 'T2';
                break;
            }
        }
    }

    if (!resolveTime) {
        // EOD Close
        const lastLx = oneMinCandles[oneMinCandles.length - 1];
        resolveTime = lastLx.timeStr;
        finalPnl = setupType === 'LONG' ? lastLx.close - entryPrice : entryPrice - lastLx.close;
    }

    return {
        type: setupType,
        orbHigh, orbLow, range: orbHigh - orbLow,
        entryPrice, stopLoss, risk,
        t1, t2, hitT1, hitT2, hitStop,
        finalPnl, resolveTime, exitReason,
        finalR: finalPnl / risk
    };
}

async function main() {
    // 1. Get exact dates from past 20 trading days
    const THIRTY_DAYS_AGO = new Date();
    THIRTY_DAYS_AGO.setDate(THIRTY_DAYS_AGO.getDate() - 30);

    const rawCategories = await prisma.stockCategory.findMany({
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: { gte: THIRTY_DAYS_AGO }
        },
        include: { stock: true }
    });

    // mapping: date -> list of symbols
    const dateMap = {};
    for (const r of rawCategories) {
        if (!r.addedDate || !r.stock) continue;
        const dt = r.addedDate.toISOString().split('T')[0];
        if (!dateMap[dt]) dateMap[dt] = [];
        dateMap[dt].push(r.stock.symbol);
    }

    const sortedDates = Object.keys(dateMap).sort().slice(-20); // Last 20 days
    console.log(`Analyzing ORB across ${sortedDates.length} distinct trading days.`);

    // Load all caches in memory
    const allSymbols = [...new Set(rawCategories.map(r => r.stock?.symbol).filter(Boolean))];
    const fileCache = {};
    for (const sym of allSymbols) {
        const c = load1mCache(sym);
        if (c) fileCache[sym] = c;
    }

    let stats5m = { total: 0, t1: 0, t2: 0, stops: 0, timeT1: [], timeT2: [], netR: 0, gapFlat: 0, gapUp: 0, gapDown: 0 };
    let stats3m = { total: 0, t1: 0, t2: 0, stops: 0, timeT1: [], timeT2: [], netR: 0, gapFlat: 0, gapUp: 0, gapDown: 0 };

    const traceLog = [];

    for (const day of sortedDates) {
        const symbols = dateMap[day];
        const dayGaps = [];

        // Find prev day to calc gap
        const allLocalDates = Object.keys(fileCache[symbols[0]] || {}).sort();
        const prevIdx = allLocalDates.indexOf(day) - 1;
        const prevDay = prevIdx >= 0 ? allLocalDates[prevIdx] : null;

        for (const sym of symbols) {
            const data = fileCache[sym];
            if (!data || !data[day]) continue;

            const m1Today = data[day];
            if (m1Today.length < 30) continue; // broken day

            let prevClose = null;
            if (prevDay && data[prevDay]) {
                const pd = data[prevDay];
                prevClose = pd[pd.length - 1].close;
            } else {
                // Fallback to day open (gap = 0%)
                prevClose = m1Today[0].open;
            }

            // Gap % at 09:20
            const c920 = m1Today.find(c => c.timeStr === '09:20:00') || m1Today[4] || m1Today[0];
            const gapPct = (c920.close - prevClose) / prevClose * 100;
            dayGaps.push({ sym, gapPct, m1Today });
        }

        // Sort by absolute gap strength (momentum)
        dayGaps.sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));
        const top5 = dayGaps.slice(0, 5);

        const isTraceDay = traceLog.filter(l => l.type === 'day').length < 5;
        if (isTraceDay && top5.length > 0) {
            traceLog.push({ type: 'day', day, tops: top5.map(t => `${t.sym} (${t.gapPct.toFixed(2)}%)`) });
        }

        for (const pick of top5) {
            const m1 = pick.m1Today;
            const m5 = buildCandles(m1, 5);
            const m3 = buildCandles(m1, 3);

            const res5 = runORB(m5, m1);
            const res3 = runORB(m3, m1);

            if (res5) {
                stats5m.total++;
                if (res5.hitT1) stats5m.t1++;
                if (res5.hitT2) stats5m.t2++;
                if (res5.hitStop) stats5m.stops++;
                stats5m.netR += res5.finalR;
            }

            if (res3) {
                stats3m.total++;
                if (res3.hitT1) stats3m.t1++;
                if (res3.hitT2) stats3m.t2++;
                if (res3.hitStop) stats3m.stops++;
                stats3m.netR += res3.finalR;
            }

            if (isTraceDay && res5) {
                traceLog.push({ type: 'trade', sym: pick.sym, gap: pick.gapPct, res: res5 });
            }
        }
    }

    const outLines = [];
    outLines.push(`\n=== 5-MIN ORB ACCURATE STUDY ===`);
    outLines.push(`Total Trades   : ${stats5m.total}`);
    if (stats5m.total > 0) {
        outLines.push(`T1 Hit Rate    : ${((stats5m.t1 / stats5m.total) * 100).toFixed(1)}%`);
        outLines.push(`T2 Hit Rate    : ${((stats5m.t2 / stats5m.total) * 100).toFixed(1)}%`);
        outLines.push(`Stop Hit Rate  : ${((stats5m.stops / stats5m.total) * 100).toFixed(1)}%`);
        outLines.push(`Net Return (R) : ${stats5m.netR.toFixed(2)} R`);
    }

    outLines.push(`\n=== 3-MIN ORB ACCURATE STUDY ===`);
    outLines.push(`Total Trades   : ${stats3m.total}`);
    if (stats3m.total > 0) {
        outLines.push(`T1 Hit Rate    : ${((stats3m.t1 / stats3m.total) * 100).toFixed(1)}%`);
        outLines.push(`T2 Hit Rate    : ${((stats3m.t2 / stats3m.total) * 100).toFixed(1)}%`);
        outLines.push(`Stop Hit Rate  : ${((stats3m.stops / stats3m.total) * 100).toFixed(1)}%`);
        outLines.push(`Net Return (R) : ${stats3m.netR.toFixed(2)} R`);
    }

    outLines.push(`\n=== PROOF TRACE (First 5 Days) ===`);
    for (const lg of traceLog) {
        if (lg.type === 'day') {
            outLines.push(`\nDate: ${lg.day}`);
            outLines.push(`  Top 5 Gaps: ${lg.tops.join(', ')}`);
        } else {
            const r = lg.res;
            outLines.push(`  Stock: ${lg.sym}`);
            outLines.push(`    Gap: ${lg.gap.toFixed(2)}% | ORB High: ₹${r.orbHigh} | ORB Low: ₹${r.orbLow} | Range: ₹${r.range.toFixed(2)}`);
            outLines.push(`    Breakout (${r.type}) | Entry: ₹${r.entryPrice} | Stop: ₹${r.stopLoss} | Risk: ₹${r.risk.toFixed(2)}`);
            outLines.push(`    T1 (1:1): ₹${r.t1.toFixed(2)} — ${r.hitT1 ? 'HIT ✓' : 'MISSED'}`);
            outLines.push(`    T2 (1:2): ₹${r.t2.toFixed(2)} — ${r.hitT2 ? 'HIT ✓' : 'MISSED'}`);
            outLines.push(`    Stop Hit? ${r.hitStop ? 'YES' : 'NO'} | Final Result: ${(r.finalR).toFixed(2)} R | Resolved: ${r.resolveTime} (${r.exitReason})`);
        }
    }

    fs.writeFileSync(path.join(__dirname, 'clean_orb_output.txt'), outLines.join('\n'));
    console.log("Done computing ORB. Results saved to clean_orb_output.txt");
}

main().catch(console.error).finally(() => prisma.$disconnect());
