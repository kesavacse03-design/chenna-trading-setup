/**
 * FORENSIC ANALYSIS - SHORT_TERM_SWING_BO_DOWN (COMPLETE)
 * 
 * Objective: Understand the "Story" of the trade (Weeky/Daily Context, Patterns, Trigger, Follow-through).
 * Analyze 50 stocks to find "Winner DNA".
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs'); // Ensure this path is correct
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');

// --- UTILITY FUNCTIONS ---

function average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function findPeaks(candles, window = 3) {
    const peaks = [];
    if (candles.length < window * 2 + 1) return peaks;

    for (let i = window; i < candles.length - window; i++) {
        const current = candles[i].high;
        let isPeak = true;
        // Check left
        for (let j = 1; j <= window; j++) {
            if (candles[i - j].high >= current) isPeak = false;
        }
        // Check right
        for (let j = 1; j <= window; j++) {
            if (candles[i + j].high >= current) isPeak = false;
        }

        if (isPeak) peaks.push({ index: i, price: current, date: candles[i].date || candles[i].timestamp });
    }
    return peaks;
}

function linearRegression(y) {
    const n = y.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += y[i];
        sumXY += i * y[i];
        sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

// --- PATTERN DETECTION ---

function checkLowerHighs(candles) {
    // 5 days before: Day -5 to Day -1
    // Return true if at least 3 of 4 pairs are lower highs
    let count = 0;
    for (let i = candles.length - 4; i < candles.length; i++) {
        if (candles[i].high < candles[i - 1].high) count++;
    }
    return count >= 3;
}

function checkSupportLevel(candles, threshold = 0.02) {
    // Look at last 20 days lows
    const lows = candles.slice(-20).map(c => c.low);
    // Find clusters
    // Simple approach: Find minimum, check how many lows are within 2%
    const minLow = Math.min(...lows);
    let touches = 0;
    for (const low of lows) {
        if ((low - minLow) / minLow < threshold) touches++;
    }
    return { level: minLow, touches };
}

function checkHeadAndShoulders(candles) {
    const peaks = findPeaks(candles.slice(-30)); // Look at last 30 days
    if (peaks.length < 3) return false;

    // Check last 3 peaks
    const [p1, p2, p3] = peaks.slice(-3);
    const head = p2.price;
    const left = p1.price;
    const right = p3.price;

    // Head must be highest
    // Shoulders roughly equal? (Allow 5% diff)
    // Right shoulder lower than head

    const isHead = head > left && head > right;
    const shouldersAlign = Math.abs(left - right) / left < 0.05;

    return isHead && shouldersAlign;
}

function checkDoubleTop(candles) {
    const peaks = findPeaks(candles.slice(-30));
    if (peaks.length < 2) return false;

    const [p1, p2] = peaks.slice(-2);
    // Peaks equal within 2%
    const diff = Math.abs(p1.price - p2.price) / p1.price;
    return diff < 0.02;
}

function checkRisingWedge(candles) {
    const slice = candles.slice(-15);
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);

    const hReg = linearRegression(highs);
    const lReg = linearRegression(lows);

    // Both rising (positive slope)
    // Lines converging (High slope < Low slope)
    // Note: slopes might be small numbers
    return hReg.slope > 0 && lReg.slope > 0 && hReg.slope < lReg.slope;
}

function checkVolumeSpike(currentVol, avgVol) {
    if (!avgVol) return false;
    return currentVol > avgVol * 1.5;
}

// --- MAIN ANALYSIS ---

async function run() {
    const categoryKey = 'SHORT_TERM_SWING_BO_DOWN';
    console.log(`Analyzing ${categoryKey}...`);

    const category = await prisma.category.findUnique({
        where: { key: categoryKey },
        include: { stocks: { include: { stock: true } } }
    });

    if (!category || category.stocks.length === 0) {
        console.log('No stocks found.');
        return;
    }

    // Get 50 recent stocks
    const allStocks = category.stocks.sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));
    const stocks = allStocks.slice(0, 50);
    console.log(`Processing ${stocks.length} stocks...`);

    const results = [];

    for (const stock of stocks) {
        const sym = stock.stock.symbol;
        const entryDate = new Date(stock.addedDate);

        // Fetch context: 200 days before + 10 days after
        const from = new Date(entryDate);
        from.setDate(from.getDate() - 300); // Enough for weekly
        let to = new Date(entryDate);
        to.setDate(to.getDate() + 20);
        if (to > new Date()) to = new Date();

        let candles;
        try {
            candles = await priceService.fetchPrice(
                sym, stock.stock.instrumentKey,
                from.toISOString().split('T')[0],
                to.toISOString().split('T')[0], 'day'
            );
            await new Promise(r => setTimeout(r, 1000)); // Increased delay to 1000ms
        } catch (e) { process.stdout.write('x'); continue; }

        if (!candles || candles.length < 50) { process.stdout.write('.'); continue; }

        // LOCATE TRIGGER DAY
        const addDateStr = entryDate.toISOString().split('T')[0];
        let idx = candles.findIndex(c => (c.timestamp || c.date).toString().startsWith(addDateStr));

        // Fuzzy search: +/- 3 days if not found
        if (idx === -1) {
            for (let offset = -3; offset <= 3; offset++) {
                if (offset === 0) continue;
                const fuzzyDate = new Date(entryDate);
                fuzzyDate.setDate(fuzzyDate.getDate() + offset);
                const fuzzyStr = fuzzyDate.toISOString().split('T')[0];
                idx = candles.findIndex(c => (c.timestamp || c.date).toString().startsWith(fuzzyStr));
                if (idx !== -1) {
                    // console.log(`Fuzzy match for ${sym}: ${addDateStr} -> ${fuzzyStr}`);
                    break;
                }
            }
        }

        if (idx === -1) {
            console.log(`Skip ${sym}: Date ${addDateStr} not found in ${candles.length} candles (${candles[0].date} to ${candles[candles.length - 1].date})`);
            continue;
        }

        // Relaxed constraint: Need at least 5 days history for basic patterns
        if (idx < 5) {
            console.log(`Skip ${sym}: Insufficient history (idx=${idx})`);
            continue;
        }

        const day0 = candles[idx];
        const dayPrev = candles[idx - 1];

        // --- 1. WEEKLY CONTEXT ---
        let weeklyTrend = 'UNKNOWN';
        if (idx >= 50) {
            const sma50 = TA.calculateSMA(candles.slice(0, idx), 50);
            const close = day0.close;
            weeklyTrend = (close < sma50) ? 'DOWN' : (close > sma50 * 1.05) ? 'UP' : 'SIDEWAYS';
        }

        // --- 2. DAILY STRUCTURE (Day -5 to -1) ---
        const preSlice = candles.slice(idx - 5, idx);
        const lowerHighs = checkLowerHighs(preSlice);

        let supportInfo = { touches: 0 };
        if (idx >= 20) {
            supportInfo = checkSupportLevel(candles.slice(idx - 20, idx));
        }

        let rsi = 50; // Neutral default
        if (idx >= 14) {
            rsi = TA.calculateRSI(candles.slice(0, idx), 14);
        }

        // --- 3. PATTERNS ---
        let hasHS = false, hasDoubleTop = false, hasRisingWedge = false;
        if (idx >= 30) {
            hasHS = checkHeadAndShoulders(candles.slice(0, idx));
            hasDoubleTop = checkDoubleTop(candles.slice(0, idx));
            hasRisingWedge = checkRisingWedge(candles.slice(0, idx));
        }

        // --- 4. TRIGGER ANALYSIS ---
        let volSpike = false;
        if (idx >= 20) {
            const vols = candles.slice(idx - 20, idx).map(c => c.volume);
            const avgVol = average(vols);
            volSpike = checkVolumeSpike(day0.volume, avgVol);
        } else {
            // Fallback: Compare to yesterday
            volSpike = day0.volume > dayPrev.volume * 1.5;
        }

        const isBigRed = (day0.close < day0.open) && ((day0.high - day0.low) > (average(candles.slice(idx - 5, idx).map(c => c.high - c.low)) * 1.5));

        // --- 5. FOLLOW THROUGH ---
        // Need Day +1
        const day1 = candles[idx + 1];
        let outcome = 'UNKNOWN';
        let pnl = 0;
        let gapDown = false;

        if (day1) {
            gapDown = day1.open < day0.close;

            // Sim Outcome: Entry @ Day 1 Open, Target 3%, Stop 2%
            // Or Check MFE/MAE
            const entry = day1.open;
            const target = entry * 0.97;
            const stop = entry * 1.02;

            // Scan next 5 days
            let hitT = false, hitS = false;
            for (let i = 1; i <= 5; i++) {
                const c = candles[idx + i];
                if (!c) break;
                if (c.high >= stop) hitS = true;
                if (c.low <= target) hitT = true;
                if (hitS && hitT) { outcome = 'LOSS'; break; } // Ambiguous -> Loss
                if (hitS) { outcome = 'LOSS'; break; }
                if (hitT) { outcome = 'WIN'; break; }
            }

            if (outcome === 'UNKNOWN') {
                // Check final price
                const last = candles[Math.min(idx + 5, candles.length - 1)];
                if (last.close < entry) outcome = 'WIN'; // Profitable hold
                else outcome = 'LOSS';
            }
        } else {
            outcome = 'NO_DATA'; // Today's signal?
        }

        results.push({
            symbol: sym,
            date: addDateStr,
            weeklyTrend,
            rsi,
            lowerHighs,
            supportTouches: supportInfo.touches,
            hasHS,
            hasDoubleTop,
            hasRisingWedge,
            volSpike,
            isBigRed,
            gapDown,
            outcome
        });

        process.stdout.write(outcome === 'WIN' ? '+' : outcome === 'LOSS' ? '-' : '?');
    }

    // --- REPORT GENERATION ---

    // CSV
    const csvHeader = Object.keys(results[0]).join(',');
    const csvRows = results.map(r => Object.values(r).join(','));
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_bo_down_trades.csv'), [csvHeader, ...csvRows].join('\n'));

    // MARKDOWN REPORT
    const total = results.length;
    const closed = results.filter(r => r.outcome !== 'NO_DATA');
    const wins = closed.filter(r => r.outcome === 'WIN');
    const losses = closed.filter(r => r.outcome === 'LOSS');
    const wr = (wins.length / closed.length * 100).toFixed(1);

    const md = [];
    md.push(`# Forensic Analysis: SHORT_TERM_SWING_BO_DOWN`);
    md.push(`**Date**: ${new Date().toISOString()}`);
    md.push(`**Sample**: ${total} stocks (${closed.length} closed trades)`);
    md.push(`**Baseline Win Rate**: ${wr}% (Entry @ Open, 5-day hold)`);
    md.push(``);
    md.push(`## Winner vs Loser DNA`);
    md.push(`| Factor | Winners (${wins.length}) | Losers (${losses.length}) | Difference |`);
    md.push(`|---|---|---|---|`);

    // Analyze factors
    const factors = [
        { label: 'Weekly Downtrend', key: 'weeklyTrend', val: 'DOWN' },
        { label: 'RSI < 50', type: 'num_lt', key: 'rsi', val: 50 },
        { label: 'Lower Highs', key: 'lowerHighs', val: true },
        { label: 'Volume Spike', key: 'volSpike', val: true },
        { label: 'Gap Down (Day +1)', key: 'gapDown', val: true },
        { label: 'Rising Wedge', key: 'hasRisingWedge', val: true },
        { label: 'Double Top', key: 'hasDoubleTop', val: true }
    ];

    factors.forEach(f => {
        let wCount = 0, lCount = 0;
        if (f.type === 'num_lt') {
            wCount = wins.filter(r => r[f.key] < f.val).length;
            lCount = losses.filter(r => r[f.key] < f.val).length;
        } else {
            wCount = wins.filter(r => r[f.key] === f.val).length;
            lCount = losses.filter(r => r[f.key] === f.val).length;
        }

        const wPct = (wCount / wins.length * 100) || 0;
        const lPct = (lCount / losses.length * 100) || 0;
        const diff = (wPct - lPct).toFixed(1);

        md.push(`| ${f.label} | ${wPct.toFixed(1)}% | ${lPct.toFixed(1)}% | **${diff}%** |`);
    });

    md.push(``);
    md.push(`## Top 5 Wins`);
    wins.slice(0, 5).forEach(w => md.push(`- **${w.symbol}** (${w.date}): RSI=${w.rsi.toFixed(1)}, VolSpike=${w.volSpike}, Weekly=${w.weeklyTrend}`));

    md.push(``);
    md.push(`## Top 5 Losses`);
    losses.slice(0, 5).forEach(l => md.push(`- **${l.symbol}** (${l.date}): RSI=${l.rsi.toFixed(1)}, VolSpike=${l.volSpike}, Weekly=${l.weeklyTrend}`));

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'swing_bo_down_forensic_complete.md'), md.join('\n'));
    console.log('\nReport generated.');
}

run();
