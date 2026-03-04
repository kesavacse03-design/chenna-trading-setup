/**
 * EXPANDED Deep Forensic Analysis of DAILY_CONTRACTION (NR7) - V3
 * 
 * Objectives:
 * 1. Expand search window to ±15 days.
 * 2. Use SWING logic (Entry @ Close, Exit Day+1 onwards) to match verified winners.
 * 3. Generate detailed timelines for winners to visualize the "Gap & Go" vs "Gap & Follow" behavior.
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const REPORT_FILE = path.join(ARTIFACT_DIR, 'daily_contraction_expanded_analysis_v3.md');

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
// OUTCOME SIMULATION (SWING)
// ═══════════════════════════════════════════════════════════

function simulateOutcome(signal, candles) {
    const { direction, entryPrice, initialStop, entryIdx } = signal;
    const initialRisk = Math.abs(entryPrice - initialStop);
    if (initialRisk <= 0) return null;

    // 1.5R Fixed Target
    const target = direction === 'LONG'
        ? entryPrice + initialRisk * 1.5
        : entryPrice - initialRisk * 1.5;

    const maxDays = 5;
    let exitDay = 0;
    let exitReason = 'TIMEOUT';
    let pnlR = 0;

    // Start checking from Day + 1
    for (let d = 1; d <= maxDays; d++) {
        const ci = entryIdx + d;
        if (ci >= candles.length) break;
        const c = candles[ci];

        // Optimistic check: Target First
        let hitTarget = false;
        let hitStop = false;

        if (direction === 'LONG') {
            if (c.high >= target) hitTarget = true;
            if (c.low <= initialStop) hitStop = true;
        } else {
            if (c.low <= target) hitTarget = true;
            if (c.high >= initialStop) hitStop = true;
        }

        if (hitTarget) {
            exitDay = d;
            exitReason = 'TARGET_HIT';
            pnlR = 1.5;
            break;
        }
        if (hitStop) {
            exitDay = d;
            exitReason = 'SL_HIT';
            pnlR = -1.0;
            break;
        }
    }

    if (exitReason === 'TIMEOUT') {
        const exitC = candles[Math.min(entryIdx + maxDays, candles.length - 1)];
        if (direction === 'LONG') pnlR = (exitC.close - entryPrice) / initialRisk;
        else pnlR = (entryPrice - exitC.close) / initialRisk;
    }

    return { exitReason, exitDay, pnlR };
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function run() {
    console.log('Running Expanded SWING Analysis...');
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
        const timelines = {};

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

            for (let i = 8; i < candles.length - 6; i++) {
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
                        };
                        results.push(trade);

                        // Capture timeline for winners
                        if (outcome.pnlR > 1.0 && signal.isInsider && signal.direction === 'SHORT') {
                            timelines[stock.stock.symbol] = generateTimeline(candles, i);
                        }
                    }
                    break; // Max 1 per stock
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
    const subset = candles.slice(nr7Idx - 5, nr7Idx + 5);
    return subset.map((c, i) => {
        const offset = i - 5;
        const range = ((c.high - c.low) / c.close * 100).toFixed(2);
        const dateStr = (c.timestamp || c.date).split('T')[0];
        let label = '';
        if (offset === 0) label = ' [NR7]';
        if (offset === 1) label = ' [ENTRY]';
        if (offset > 1) label = ' [HOLD]';
        return `${dateStr} (Day ${offset})${label}: O:${c.open} H:${c.high} L:${c.low} C:${c.close} (R:${range}%)`;
    }).join('\n');
}

function generateReport(trades, timelines) {
    const insiders = trades.filter(t => t.type === 'INSIDER_NR7');
    const regulars = trades.filter(t => t.type === 'REGULAR_NR7');

    let md = `# Expanded Daily Contraction Analysis V3 (SWING Logic)
> Window: ±15 days | Stocks: 193 
> Strategy: Entry @ Day 1 Close, Exit Day +1 onwards (Swing)

## 1. Performance Summary

| Type | Direction | Count | Win Rate | Net P&L | Avg Day 1 P&L |
|---|---|---|---|---|---|
| **INSIDER** | **SHORT** | ${insiders.filter(t => t.direction === 'SHORT').length} | **${wr(insiders.filter(t => t.direction === 'SHORT'))}%** | ${pnl(insiders.filter(t => t.direction === 'SHORT'))}R | - |
| INSIDER | LONG | ${insiders.filter(t => t.direction === 'LONG').length} | ${wr(insiders.filter(t => t.direction === 'LONG'))}% | ${pnl(insiders.filter(t => t.direction === 'LONG'))}R | - |
| REGULAR | SHORT | ${regulars.filter(t => t.direction === 'SHORT').length} | ${wr(regulars.filter(t => t.direction === 'SHORT'))}% | ${pnl(regulars.filter(t => t.direction === 'SHORT'))}R | - |

## 2. Confirmed Winners Timelines
`;

    for (const [sym, tl] of Object.entries(timelines)) {
        md += `\n### ${sym}\n\`\`\`\n${tl}\n\`\`\`\n`;
    }

    fs.writeFileSync(REPORT_FILE, md);
    console.log(`\nSaved report to ${REPORT_FILE}`);
}

function wr(list) {
    if (list.length === 0) return '0.0';
    return (list.filter(t => t.pnlR >= 1.5).length / list.length * 100).toFixed(1);
}
function pnl(list) {
    return list.reduce((s, t) => s + t.pnlR, 0).toFixed(1);
}

run();
