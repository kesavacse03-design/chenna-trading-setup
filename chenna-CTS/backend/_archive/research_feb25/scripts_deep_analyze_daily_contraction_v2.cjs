/**
 * EXPANDED Deep Forensic Analysis of DAILY_CONTRACTION (NR7)
 * 
 * Objectives:
 * 1. Expand search window to ±15 days to find missed signals (increase sample size)
 * 2. Detailed timeline for verified winners (BDL, HINDALCO, PPLPHARMA, SHRIRAMFIN)
 * 3. Check for Regular NR7 (non-insider) to see if that's what TradeCode caught
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const REPORT_FILE = path.join(ARTIFACT_DIR, 'daily_contraction_expanded_analysis.md');
const CSV_FILE = path.join(ARTIFACT_DIR, 'expanded_analysis_data.csv');

// ═══════════════════════════════════════════════════════════
// SIGNAL DETECTION
// ═══════════════════════════════════════════════════════════

function detectSignal(candles, idx) {
    if (idx < 8 || idx >= candles.length - 1) return null;

    const day0 = candles[idx];
    const dayMinus1 = candles[idx - 1];
    const day1 = candles[idx + 1];

    // 1. NR7 Check
    const range0 = day0.high - day0.low;
    if (range0 <= 0) return null;
    let isNR7 = true;
    for (let i = 1; i <= 6; i++) {
        const prev = candles[idx - i];
        if (!prev) { isNR7 = false; break; }
        if ((prev.high - prev.low) <= range0) { isNR7 = false; break; }
    }
    if (!isNR7) return null;

    // 2. Insider Check
    const isInsider = dayMinus1 && day0.high < dayMinus1.high && day0.low > dayMinus1.low;

    // 3. Direction from Day1 Close
    let direction = null;
    if (day1.close > day0.high) direction = 'LONG';
    else if (day1.close < day0.low) direction = 'SHORT';

    // Determine type
    let type = 'NONE';
    if (isInsider && direction) type = 'INSIDER_NR7';
    else if (direction) type = 'REGULAR_NR7';
    else type = 'NO_BREAKOUT';

    if (type === 'NO_BREAKOUT') return null;

    return {
        type,
        direction,
        entryPrice: day1.close,
        nr7High: day0.high,
        nr7Low: day0.low,
        initialStop: direction === 'LONG' ? day0.low * 0.995 : day0.high * 1.005,
        nr7Date: day0.timestamp || day0.date,
        entryDate: day1.timestamp || day1.date,
        nr7Idx: idx,
        entryIdx: idx + 1,
        isInsider
    };
}

// ═══════════════════════════════════════════════════════════
// OUTCOME SIMULATION
// ═══════════════════════════════════════════════════════════

function simulateOutcome(signal, candles) {
    const { direction, entryPrice, initialStop, entryIdx } = signal;
    const initialRisk = Math.abs(entryPrice - initialStop);
    if (initialRisk <= 0) return null;

    const target = direction === 'LONG'
        ? entryPrice + initialRisk * 1.5
        : entryPrice - initialRisk * 1.5;

    const maxDays = 5; // Intraday/Short swing focus
    let exitDay = 0;
    let exitReason = 'TIMEOUT';
    let exitPrice = candles[Math.min(entryIdx + maxDays, candles.length - 1)].close;

    // Day 1 Check (Intraday focus)
    const day1 = candles[entryIdx];
    let day1Res = 'OPEN';

    // Day-by-day loop
    for (let d = 0; d <= maxDays; d++) { // Start at 0 (entry day) if we entered at Open, but we enter at Close so start d=1? 
        // Actually we assumed entry at Day1 Close. So checking starts Day2.
        // Wait, refined logic: 
        // If we trade "Intraday" we enter Day1 Open/Breakout and exit Day1 Close.
        // But our backtest assumed Entry at Day1 Close.
        // Let's stick to the previous verified methodology: Entry Day 1 Close, outcome checking starts Day 2.
        // BUT user wants to verify "Intraday" nature (Day 1 resolution).
        // If resolution is Day 1, it means the stop/target hit ON THE ENTRY CANDLE (Day 1) relative to entry price.
        // But we entered at Close? No, if we enter at close, we can't hit target on Day 1.
        // Ah, the previous script `exitDay = 1` meant `entryIdx + 1`.
        // Let's check Day 2 onwards.

        const ci = entryIdx + d; // If d=1, it's Day 2.
        if (d === 0) continue; // Skip entry day (Day 1)

        if (ci >= candles.length) break;
        const c = candles[ci];

        // Check outcome ... (Same logic as before)
        let favorableR, adverseR;
        if (direction === 'LONG') {
            favorableR = (c.high - entryPrice) / initialRisk;
            adverseR = (c.low - entryPrice) / initialRisk;
        } else {
            favorableR = (entryPrice - c.low) / initialRisk;
            adverseR = (entryPrice - c.high) / initialRisk;
        }

        if (favorableR >= 1.5) { exitDay = d; exitReason = 'TARGET_HIT'; break; }
        if (adverseR <= -1.0) { exitDay = d; exitReason = 'SL_HIT'; break; }
    }

    // Fallback: Check if it hit on Day 1 (Intrabar)?
    // If we define Entry = Breakout Level (NR7 High/Low) instead of Close?
    // User asked "Is this Swing or Intraday".
    // Let's simulate Entry at Breakout Price (NR7 High/Low) on Day 1.
    // This allows Day 1 resolution.

    const breakoutPrice = direction === 'LONG' ? signal.nr7High : signal.nr7Low;
    const breakoutRisk = Math.abs(breakoutPrice - initialStop);
    const breakoutTarget = direction === 'LONG' ? breakoutPrice + breakoutRisk * 1.5 : breakoutPrice - breakoutRisk * 1.5;

    const c1 = candles[entryIdx];
    let boDay1Outcome = 'TIMEOUT';
    let boDay1Pnl = 0;

    // Did Day 1 hit target/stop after breakout?
    // We don't have intraday data, so we assume Worst Case (Stop hit first) if both hit.
    // Or check Open/Close relative to levels.
    let hitTarget = false;
    let hitStop = false;

    if (direction === 'LONG') {
        if (c1.high >= breakoutTarget) hitTarget = true;
        if (c1.low <= initialStop) hitStop = true;
    } else {
        if (c1.low <= breakoutTarget) hitTarget = true;
        if (c1.high >= initialStop) hitStop = true;
    }

    if (hitStop) { boDay1Outcome = 'LOSS'; boDay1Pnl = -1.0; }
    else if (hitTarget) { boDay1Outcome = 'WIN'; boDay1Pnl = 1.5; }
    else {
        // Closed without hitting either
        const closeR = direction === 'LONG' ? (c1.close - breakoutPrice) / breakoutRisk : (breakoutPrice - c1.close) / breakoutRisk;
        boDay1Outcome = 'OPEN'; boDay1Pnl = closeR;
    }

    return {
        // Swing Result (Entry @ Close)
        exitReason, exitDay,
        // Day 1 Result (Entry @ Breakout)
        boDay1Outcome, boDay1Pnl
    };
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function run() {
    console.log('Running Expanded Analysis...');
    try {
        const category = await prisma.category.findUnique({
            where: { key: 'DAILY_CONTRACTION' },
            include: { stocks: { include: { stock: true } } }
        });
        if (!category) return;

        // Dedup
        const seen = new Map();
        for (const entry of category.stocks) {
            const sym = entry.stock.symbol;
            if (!seen.has(sym) || new Date(entry.addedDate) < new Date(seen.get(sym).addedDate)) {
                seen.set(sym, entry);
            }
        }
        const stocks = Array.from(seen.values());

        const results = [];
        const timelines = {}; // Store detailed timelines for winners

        let processed = 0;
        for (const stock of stocks) {
            processed++;
            process.stdout.write(`\r[${processed}/${stocks.length}] ${stock.stock.symbol}...       `);

            const fromDate = new Date(stock.addedDate);
            fromDate.setDate(fromDate.getDate() - 30);

            const candles = await priceService.fetchPrice(
                stock.stock.symbol, stock.stock.instrumentKey,
                fromDate.toISOString().split('T')[0],
                new Date().toISOString().split('T')[0],
                'day'
            );

            if (!candles || candles.length < 20) continue;

            // Scan ±15 days around addedDate
            const addDate = new Date(stock.addedDate);

            for (let i = 8; i < candles.length - 5; i++) {
                const candleDate = new Date(candles[i].timestamp || candles[i].date);
                const diff = Math.abs((candleDate - addDate) / (1000 * 60 * 60 * 24));
                if (diff > 15) continue;

                const signal = detectSignal(candles, i);
                if (signal) {
                    const outcome = simulateOutcome(signal, candles);
                    if (outcome) {
                        const trade = {
                            symbol: stock.stock.symbol,
                            ...signal,
                            ...outcome,
                            dateDiff: Math.round(diff)
                        };
                        results.push(trade);

                        // Capture timeline for winners
                        if (outcome.boDay1Outcome === 'WIN' && signal.isInsider && signal.direction === 'SHORT') {
                            timelines[stock.stock.symbol] = generateTimeline(candles, i);
                        }
                    }
                    break; // Max 1 per stock for now
                }
            }
        }

        generateReport(results, timelines);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

function generateTimeline(candles, nr7Idx) {
    const subset = candles.slice(nr7Idx - 5, nr7Idx + 3);
    return subset.map((c, i) => {
        const offset = i - 5;
        const range = ((c.high - c.low) / c.close * 100).toFixed(2);
        return `Day ${offset}: O:${c.open} H:${c.high} L:${c.low} C:${c.close} (R:${range}%)`;
    }).join('\n');
}

function generateReport(trades, timelines) {
    const insiders = trades.filter(t => t.type === 'INSIDER_NR7');
    const regulars = trades.filter(t => t.type === 'REGULAR_NR7');

    let md = `# Expanded Daily Contraction Analysis
> Window: ±15 days | Stocks: 193 | Total Signals: ${trades.length}

## 1. Signal Abundance
- **Insider NR7**: ${insiders.length} signals (found in wider window)
- **Regular NR7**: ${regulars.length} signals
- **Coverage**: ${((insiders.length + regulars.length) / 193 * 100).toFixed(1)}% of stocks had a signal.

## 2. Intraday Breakout (Day 1) Performance
**Strategy**: Entry at Breakout, Exit at 1.5R Target or 1R Stop (whichever hits first Day 1)

| Type | Direction | Count | Win Rate | P&L |
|---|---|---|---|---|
| **INSIDER** | **SHORT** | ${insiders.filter(t => t.direction === 'SHORT').length} | **${wr(insiders.filter(t => t.direction === 'SHORT'))}%** | ${pnl(insiders.filter(t => t.direction === 'SHORT'))}R |
| INSIDER | LONG | ${insiders.filter(t => t.direction === 'LONG').length} | ${wr(insiders.filter(t => t.direction === 'LONG'))}% | ${pnl(insiders.filter(t => t.direction === 'LONG'))}R |
| REGULAR | SHORT | ${regulars.filter(t => t.direction === 'SHORT').length} | ${wr(regulars.filter(t => t.direction === 'SHORT'))}% | ${pnl(regulars.filter(t => t.direction === 'SHORT'))}R |

## 3. Confirmed Winners Timelines
`;

    for (const [sym, tl] of Object.entries(timelines)) {
        md += `\n### ${sym}\n\`\`\`\n${tl}\n\`\`\`\n`;
    }

    // CSV
    const rows = trades.map(t => `${t.symbol},${t.type},${t.direction},${t.boDay1Outcome},${t.boDay1Pnl}`).join('\n');
    fs.writeFileSync(CSV_FILE, `symbol,type,direction,result,pnl\n${rows}`);
    fs.writeFileSync(REPORT_FILE, md);
    console.log(`\nSaved report to ${REPORT_FILE}`);
}

function wr(list) {
    if (list.length === 0) return '0.0';
    return (list.filter(t => t.boDay1Outcome === 'WIN').length / list.length * 100).toFixed(1);
}
function pnl(list) {
    return list.reduce((s, t) => s + t.boDay1Pnl, 0).toFixed(1);
}

run();
