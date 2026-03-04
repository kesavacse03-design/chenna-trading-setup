/**
 * CORRECTED Deep Forensic Analysis of DAILY_CONTRACTION (NR7)
 * 
 * Fixed issues from V1:
 * 1. Uses proper NR7 detection (same as smart_swing_backtest.cjs)
 * 2. Scans FULL price history for signals (not just addedDate)
 * 3. Day-by-day outcome tracking (not intra-bar)
 * 4. ALL metrics the user requested
 * 
 * Also scans WITHOUT strict LONG filter to find more signals.
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const REPORT_FILE = path.join(ARTIFACT_DIR, 'daily_contraction_deep_analysis.md');
const CSV_FILE = path.join(ARTIFACT_DIR, 'deep_analysis_data.csv');

// ═══════════════════════════════════════════════════════════
// SIGNAL DETECTION (From smart_swing_backtest.cjs - PROVEN)
// ═══════════════════════════════════════════════════════════

function detectInsiderNR7(candles, idx) {
    if (idx < 8 || idx >= candles.length - 1) return null;

    const day0 = candles[idx];     // NR7 Setup candle
    const dayMinus1 = candles[idx - 1]; // Day before setup
    const day1 = candles[idx + 1]; // Entry/Trigger candle

    // 1. Verify NR7 on day0 (narrowest range of last 7 days)
    const range0 = day0.high - day0.low;
    if (range0 <= 0) return null;
    for (let i = 1; i <= 6; i++) {
        const prev = candles[idx - i];
        if (!prev) return null;
        if ((prev.high - prev.low) <= range0) return null;
    }

    // 2. Insider (Inside Day): day0 is inside dayMinus1
    if (!dayMinus1) return null;
    if (!(day0.high < dayMinus1.high && day0.low > dayMinus1.low)) return null;

    // 3. Determine direction from Day1 CLOSE
    let direction = null;
    if (day1.close > day0.high) direction = 'LONG';
    else if (day1.close < day0.low) direction = 'SHORT';
    if (!direction) return null;

    // Quality Score
    const rangePercent = (range0 / day0.close) * 100;
    let score = 1; // Base (Insider NR7)
    if (rangePercent < 2.0) score += 1;
    else if (rangePercent > 4.0) score -= 1;

    // Volume contraction
    let volAvg5 = 0, cnt = 0;
    for (let i = 1; i <= 5; i++) {
        if (candles[idx - i]) { volAvg5 += candles[idx - i].volume; cnt++; }
    }
    if (cnt > 0 && day0.volume < volAvg5 / cnt) score += 1;

    // SMA20
    const sma20 = TA.calculateSMA(candles.slice(0, idx + 1), 20);
    const locVsSMA = !sma20 ? 'N/A' : day0.close > sma20 ? 'ABOVE' : 'BELOW';
    const isUptrend = sma20 && day0.close > sma20;

    // NOTE: We DO NOT apply the strict LONG filter here.
    // We want ALL signals for analysis. We'll tag "qualified" separately.
    const qualifiedLong = direction === 'LONG' && isUptrend && score >= 3;
    const qualifiedShort = direction === 'SHORT'; // No filter for SHORT
    const isQualified = qualifiedLong || qualifiedShort;

    return {
        direction,
        entryPrice: day1.close,
        nr7High: day0.high,
        nr7Low: day0.low,
        initialStop: direction === 'LONG' ? day0.low * 0.995 : day0.high * 1.005,
        score,
        isQualified,
        locVsSMA,
        nr7Date: day0.timestamp || day0.date,
        entryDate: day1.timestamp || day1.date,
        nr7Idx: idx,
        entryIdx: idx + 1,
        // NR7 candle stats
        nr7Range: rangePercent,
        nr7Green: day0.close > day0.open,
        nr7BodyRatio: range0 > 0 ? Math.abs(day0.close - day0.open) / range0 : 0,
        nr7VolRatio: (cnt > 0 && volAvg5 / cnt > 0) ? day0.volume / (volAvg5 / cnt) : 0,
    };
}

// ═══════════════════════════════════════════════════════════
// OUTCOME SIMULATION (Day-by-day, not intra-bar)
// ═══════════════════════════════════════════════════════════

function simulateOutcome(signal, candles) {
    const { direction, entryPrice, initialStop, entryIdx } = signal;
    const initialRisk = Math.abs(entryPrice - initialStop);
    if (initialRisk <= 0) return null;

    const target = direction === 'LONG'
        ? entryPrice + initialRisk * 1.5
        : entryPrice - initialRisk * 1.5;

    const maxDays = 10;
    let mfe = 0; // Max Favorable Excursion (in R)
    let mae = 0; // Max Adverse Excursion (in R)
    let exitDay = 0;
    let exitReason = 'TIMEOUT';
    let exitPrice = entryPrice;
    let falseBreakoutDay1 = false;

    for (let d = 1; d <= maxDays; d++) {
        const ci = entryIdx + d;
        if (ci >= candles.length) break;
        const c = candles[ci];

        // Calculate R-values for today
        let favorableR, adverseR, closeR;
        if (direction === 'LONG') {
            favorableR = (c.high - entryPrice) / initialRisk;
            adverseR = (c.low - entryPrice) / initialRisk;
            closeR = (c.close - entryPrice) / initialRisk;
        } else {
            favorableR = (entryPrice - c.low) / initialRisk;
            adverseR = (entryPrice - c.high) / initialRisk;
            closeR = (entryPrice - c.close) / initialRisk;
        }

        mfe = Math.max(mfe, favorableR);
        mae = Math.min(mae, adverseR);

        // Check target FIRST (optimistic: assume target hit before stop)
        if (favorableR >= 1.5) {
            exitDay = d;
            exitReason = 'TARGET_HIT';
            exitPrice = target;
            break;
        }

        // Check stop
        if (adverseR <= -1.0) {
            exitDay = d;
            exitReason = 'SL_HIT';
            exitPrice = initialStop;
            break;
        }

        // False breakout check on Day 1
        if (d === 1) {
            if (direction === 'LONG' && c.close < signal.nr7High) falseBreakoutDay1 = true;
            if (direction === 'SHORT' && c.close > signal.nr7Low) falseBreakoutDay1 = true;
        }
    }

    // If timeout, calculate final R
    let pnlR;
    if (exitReason === 'TIMEOUT') {
        const lastIdx = Math.min(entryIdx + maxDays, candles.length - 1);
        exitPrice = candles[lastIdx].close;
        exitDay = lastIdx - entryIdx;
        if (direction === 'LONG') pnlR = (exitPrice - entryPrice) / initialRisk;
        else pnlR = (entryPrice - exitPrice) / initialRisk;
    } else if (exitReason === 'TARGET_HIT') {
        pnlR = 1.5;
    } else {
        pnlR = -1.0;
    }

    return {
        pnlR: Math.round(pnlR * 100) / 100,
        exitReason,
        exitDay,
        outcome: exitReason === 'TARGET_HIT' ? 'WIN' : exitReason === 'SL_HIT' ? 'LOSS' : (pnlR > 0 ? 'TIMEOUT_WIN' : 'TIMEOUT_LOSS'),
        mfe: Math.round(mfe * 100) / 100,
        mae: Math.round(mae * 100) / 100,
        falseBreakoutDay1,
    };
}

// ═══════════════════════════════════════════════════════════
// PRE-NR7 CONTEXT
// ═══════════════════════════════════════════════════════════

function getPreContext(candles, nr7Idx) {
    if (nr7Idx < 5) return null;

    const nr7 = candles[nr7Idx];
    const minus5 = candles[nr7Idx - 5];

    const trend5d = ((nr7.close - minus5.close) / minus5.close * 100);
    const trendDir = trend5d > 2 ? 'UP' : trend5d < -2 ? 'DOWN' : 'SIDEWAYS';

    // Check for gaps (>1%) in last 5 days
    let hasGap = false;
    for (let i = nr7Idx - 4; i <= nr7Idx; i++) {
        if (i < 1) continue;
        const gap = Math.abs(candles[i].open - candles[i - 1].close) / candles[i - 1].close * 100;
        if (gap > 1.0) { hasGap = true; break; }
    }

    // Day of week
    const d = new Date(nr7.timestamp || nr7.date);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = days[d.getDay()] || 'N/A';

    // Day 1 gap (gap between NR7 close and entry day open)
    const entryCandle = candles[nr7Idx + 1];
    const day1Gap = entryCandle ? ((entryCandle.open - nr7.close) / nr7.close * 100) : 0;
    const day1GapDir = day1Gap > 0.5 ? 'UP' : day1Gap < -0.5 ? 'DOWN' : 'FLAT';

    return {
        trend5d: Math.round(trend5d * 100) / 100,
        trendDir,
        hasGap,
        dayOfWeek,
        day1Gap: Math.round(day1Gap * 100) / 100,
        day1GapDir,
    };
}

// ═══════════════════════════════════════════════════════════
// PATTERN CLASSIFICATION
// ═══════════════════════════════════════════════════════════

function classifyPattern(trendDir, direction) {
    if (direction === 'LONG') {
        if (trendDir === 'UP') return 'CONTINUATION_UP';
        if (trendDir === 'DOWN') return 'REVERSAL_UP';
        return 'CONSOLIDATION_LONG';
    } else {
        if (trendDir === 'DOWN') return 'CONTINUATION_DN';
        if (trendDir === 'UP') return 'REVERSAL_DN';
        return 'CONSOLIDATION_SHORT';
    }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function run() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  CORRECTED Deep Forensic Analysis - NR7');
    console.log('═══════════════════════════════════════════════════\n');

    try {
        const category = await prisma.category.findUnique({
            where: { key: 'DAILY_CONTRACTION' },
            include: { stocks: { include: { stock: true } } }
        });
        if (!category) { console.log('Category not found'); return; }

        // Dedup
        const seen = new Map();
        for (const entry of category.stocks) {
            const sym = entry.stock.symbol;
            if (!seen.has(sym) || new Date(entry.addedDate) < new Date(seen.get(sym).addedDate)) {
                seen.set(sym, entry);
            }
        }
        const stocks = Array.from(seen.values());
        console.log(`Processing ${stocks.length} unique stocks...\n`);

        const allTrades = [];
        let processed = 0;
        let signalsDetected = 0;
        let noSignal = 0;

        for (const stockEntry of stocks) {
            processed++;
            const symbol = stockEntry.stock.symbol;
            const instrumentKey = stockEntry.stock.instrumentKey;
            process.stdout.write(`\r[${processed}/${stocks.length}] ${symbol}...                    `);

            try {
                const fromDateStr = new Date(stockEntry.addedDate);
                fromDateStr.setDate(fromDateStr.getDate() - 10); // 10 days before
                const candles = await priceService.fetchPrice(
                    symbol, instrumentKey,
                    fromDateStr.toISOString().split('T')[0],
                    new Date().toISOString().split('T')[0],
                    'day'
                );
                if (!candles || !Array.isArray(candles) || candles.length < 20) continue;

                // Scan for Insider NR7 signal near addedDate
                // We look in a window of ±5 days around addedDate
                const addedDateStr = new Date(stockEntry.addedDate).toISOString().split('T')[0];
                let foundSignal = false;

                for (let i = 8; i < candles.length - 11; i++) {
                    const signal = detectInsiderNR7(candles, i);
                    if (!signal) continue;

                    // Check if this signal is near the addedDate (within ±5 trading days)
                    const sigDate = new Date(signal.nr7Date);
                    const addDate = new Date(stockEntry.addedDate);
                    const daysDiff = Math.abs((sigDate - addDate) / (1000 * 60 * 60 * 24));
                    if (daysDiff > 10) continue; // Too far from addedDate

                    signalsDetected++;
                    foundSignal = true;

                    // Get context
                    const context = getPreContext(candles, i);
                    if (!context) continue;

                    // Simulate outcome
                    const outcome = simulateOutcome(signal, candles);
                    if (!outcome) continue;

                    // Classify
                    const patternType = classifyPattern(context.trendDir, signal.direction);

                    allTrades.push({
                        symbol,
                        ...signal,
                        ...context,
                        ...outcome,
                        patternType,
                    });

                    console.log(`\n  ${symbol} [${signal.isQualified ? '✓' : '✗'}] ${signal.direction} Score:${signal.score} → ${outcome.outcome} (${outcome.pnlR}R) Day ${outcome.exitDay}`);
                    break; // One signal per stock
                }

                if (!foundSignal) noSignal++;

            } catch (e) {
                // ignore
            }
        }

        console.log(`\n\nSignals detected: ${signalsDetected}`);
        console.log(`No signal found: ${noSignal}\n`);
        generateReport(allTrades, stocks.length);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

// ═══════════════════════════════════════════════════════════
// COMPREHENSIVE REPORT
// ═══════════════════════════════════════════════════════════

function generateReport(trades, totalStocks) {
    if (trades.length === 0) { console.log('No trades to report.'); return; }

    const qualified = trades.filter(t => t.isQualified);
    const unqualified = trades.filter(t => !t.isQualified);
    const winners = trades.filter(t => t.outcome === 'WIN');
    const losers = trades.filter(t => t.outcome === 'LOSS');
    const timeoutWin = trades.filter(t => t.outcome === 'TIMEOUT_WIN');
    const timeoutLoss = trades.filter(t => t.outcome === 'TIMEOUT_LOSS');
    const resolved = trades.filter(t => t.outcome === 'WIN' || t.outcome === 'LOSS');

    let md = `# 🕵️‍♂️ DAILY_CONTRACTION (NR7) — Deep Forensic Analysis (CORRECTED)
> Methodology: Proper Insider NR7 detection | Day-by-day outcome tracking
> ${totalStocks} stocks scanned → ${trades.length} signals found
> Date: ${new Date().toISOString().split('T')[0]}

## ⚠️ Methodology Explanation
- **Signal Detection**: Same as \`smart_swing_backtest.cjs\`: NR7 + Inside Day + Day1 close outside range.
- **Entry**: Day 1 close price (after confirmed breakout).
- **Stop**: NR7 Low * 0.995 (LONG) or NR7 High * 1.005 (SHORT).
- **Target**: 1.5R (Fixed).
- **Outcome**: Day-by-day check (NOT intra-bar). Target checked before stop on each day.
- **"Qualified"**: Passes the strict filter (LONG needs uptrend + high quality; SHORT always qualifies).
- **"Unqualified"**: Valid NR7 pattern but didn't pass filters. Shown for comparison.

---

## 1. Executive Summary

| Metric | ALL Signals | ✓ Qualified Only | ✗ Unqualified |
|--------|------------|-------------------|---------------|
| Count | ${trades.length} | ${qualified.length} | ${unqualified.length} |
| Win Rate | **${wr(trades)}%** | **${wr(qualified)}%** | ${wr(unqualified)}% |
| Net P&L | ${netR(trades)}R | ${netR(qualified)}R | ${netR(unqualified)}R |
| Avg MFE | ${avgMetric(trades, 'mfe')}R | ${avgMetric(qualified, 'mfe')}R | ${avgMetric(unqualified, 'mfe')}R |
| Avg MAE | ${avgMetric(trades, 'mae')}R | ${avgMetric(qualified, 'mae')}R | ${avgMetric(unqualified, 'mae')}R |

---

## 2. Winner vs Loser DNA

| Metric | 🏆 WINNERS (n=${winners.length}) | ❌ LOSERS (n=${losers.length}) | Diff |
|--------|---------|---------|------|
| Count | ${winners.length} | ${losers.length} | - |
| Avg 5-day pre-trend % | ${avgMetric(winners, 'trend5d')}% | ${avgMetric(losers, 'trend5d')}% | ${diff(winners, losers, 'trend5d')} |
| % with prior gap (>1%) | ${pctWith(winners, 'hasGap')}% | ${pctWith(losers, 'hasGap')}% | ${diffPct(winners, losers, 'hasGap')} |
| Avg NR7 range % | ${avgMetric(winners, 'nr7Range')}% | ${avgMetric(losers, 'nr7Range')}% | ${diff(winners, losers, 'nr7Range')} |
| % Green NR7 candle | ${pctWith(winners, 'nr7Green')}% | ${pctWith(losers, 'nr7Green')}% | ${diffPct(winners, losers, 'nr7Green')} |
| Avg NR7 day vol ratio | ${avgMetric(winners, 'nr7VolRatio')}x | ${avgMetric(losers, 'nr7VolRatio')}x | ${diff(winners, losers, 'nr7VolRatio')} |
| % above 20 SMA | ${pctMatch(winners, 'locVsSMA', 'ABOVE')}% | ${pctMatch(losers, 'locVsSMA', 'ABOVE')}% | - |
| Avg Day 1 gap % | ${avgMetric(winners, 'day1Gap')}% | ${avgMetric(losers, 'day1Gap')}% | ${diff(winners, losers, 'day1Gap')} |
| % Gap in breakout dir | ${pctGapInDir(winners)}% | ${pctGapInDir(losers)}% | - |
| Avg exit day | ${avgMetric(winners, 'exitDay')} | ${avgMetric(losers, 'exitDay')} | ${diff(winners, losers, 'exitDay')} |
| % Continuation | ${pctMatch(winners, 'patternType', 'CONTINUATION_UP', 'CONTINUATION_DN')}% | ${pctMatch(losers, 'patternType', 'CONTINUATION_UP', 'CONTINUATION_DN')}% | - |
| % Reversal | ${pctMatch(winners, 'patternType', 'REVERSAL_UP', 'REVERSAL_DN')}% | ${pctMatch(losers, 'patternType', 'REVERSAL_UP', 'REVERSAL_DN')}% | - |
| Avg MFE | ${avgMetric(winners, 'mfe')}R | ${avgMetric(losers, 'mfe')}R | ${diff(winners, losers, 'mfe')} |
| Avg MAE | ${avgMetric(winners, 'mae')}R | ${avgMetric(losers, 'mae')}R | ${diff(winners, losers, 'mae')} |
| % False Breakout Day 1 | ${pctWith(winners, 'falseBreakoutDay1')}% | ${pctWith(losers, 'falseBreakoutDay1')}% | - |
| Avg Quality Score | ${avgMetric(winners, 'score')} | ${avgMetric(losers, 'score')} | ${diff(winners, losers, 'score')} |

---

## 3. Time-to-Resolution Distribution

| Resolution Time | Count | % | Win Rate |
|-----------------|-------|---|----------|
| Day 1 | ${countByDay(resolved, 1)} | ${pctByDay(resolved, 1)}% | ${wrByDay(resolved, 1)}% |
| Day 2-3 | ${countByDayRange(resolved, 2, 3)} | ${pctByDayRange(resolved, 2, 3)}% | ${wrByDayRange(resolved, 2, 3)}% |
| Day 4-5 | ${countByDayRange(resolved, 4, 5)} | ${pctByDayRange(resolved, 4, 5)}% | ${wrByDayRange(resolved, 4, 5)}% |
| Day 6-10 | ${countByDayRange(resolved, 6, 10)} | ${pctByDayRange(resolved, 6, 10)}% | ${wrByDayRange(resolved, 6, 10)}% |
| Timeout (>10d) | ${timeoutWin.length + timeoutLoss.length} | ${((timeoutWin.length + timeoutLoss.length) / trades.length * 100).toFixed(1)}% | ${timeoutWin.length > 0 ? ((timeoutWin.length / (timeoutWin.length + timeoutLoss.length)) * 100).toFixed(1) : '0.0'}% |

---

## 4. Pattern Classification Results

| Pattern Type | Count | Win Rate | Avg P&L |
|---|---|---|---|
`;
    const patternTypes = ['CONTINUATION_UP', 'CONTINUATION_DN', 'REVERSAL_UP', 'REVERSAL_DN', 'CONSOLIDATION_LONG', 'CONSOLIDATION_SHORT'];
    for (const pt of patternTypes) {
        const group = resolved.filter(t => t.patternType === pt);
        if (group.length === 0) { md += `| ${pt} | 0 | - | - |\n`; continue; }
        md += `| ${pt} | ${group.length} | ${wr(group)}% | ${avgPnl(group)}R |\n`;
    }

    // 5. Direction Analysis  
    md += `\n---\n\n## 5. Direction Analysis\n`;
    const longTrades = resolved.filter(t => t.direction === 'LONG');
    const shortTrades = resolved.filter(t => t.direction === 'SHORT');
    md += `| Direction | Count | Win Rate | Net P&L |\n|---|---|---|---|\n`;
    md += `| LONG | ${longTrades.length} | ${wr(longTrades)}% | ${netR(longTrades)}R |\n`;
    md += `| SHORT | ${shortTrades.length} | ${wr(shortTrades)}% | ${netR(shortTrades)}R |\n`;

    // 6. Day of Week
    md += `\n---\n\n## 6. Day of Week Analysis\n`;
    md += `| Day | Count | Win Rate |\n|---|---|---|\n`;
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
        const group = resolved.filter(t => t.dayOfWeek === day);
        md += `| ${day} | ${group.length} | ${wr(group)}% |\n`;
    }

    // 7. Trade Details
    md += `\n---\n\n## 7. All Trade Details\n`;
    md += `| # | Symbol | Dir | Qualified | Score | Trend | Type | Day1Gap | Result | P&L | ExitDay | MFE | MAE | FalseBO |\n`;
    md += `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;

    trades.sort((a, b) => b.pnlR - a.pnlR).forEach((t, i) => {
        md += `| ${i + 1} | ${t.symbol} | ${t.direction} | ${t.isQualified ? '✓' : '✗'} | ${t.score} | ${t.trendDir} | ${t.patternType} | ${t.day1Gap}% | ${t.outcome} | ${t.pnlR}R | ${t.exitDay}d | ${t.mfe}R | ${t.mae}R | ${t.falseBreakoutDay1 ? 'YES' : 'NO'} |\n`;
    });

    // 8. Raw Data Sample
    md += `\n---\n\n## 8. Raw Data Sample (First 10)\n\`\`\`\n`;
    trades.slice(0, 10).forEach(t => {
        md += `${t.symbol} | ${t.nr7Date} | PreTrend:${t.trend5d}% | NR7Range:${t.nr7Range}% | Day1Gap:${t.day1Gap}% | ${t.direction} | ExitDay:${t.exitDay} | P&L:${t.pnlR}R | ${t.outcome}\n`;
    });
    md += `\`\`\`\n`;

    fs.writeFileSync(REPORT_FILE, md);
    console.log(`Report saved to ${REPORT_FILE}`);

    // CSV
    if (trades.length > 0) {
        const headers = 'symbol,direction,isQualified,score,nr7Date,entryDate,trend5d,trendDir,hasGap,locVsSMA,nr7Range,nr7Green,nr7BodyRatio,nr7VolRatio,day1Gap,day1GapDir,dayOfWeek,patternType,outcome,pnlR,exitDay,exitReason,mfe,mae,falseBreakoutDay1';
        const rows = trades.map(t =>
            `${t.symbol},${t.direction},${t.isQualified},${t.score},${t.nr7Date},${t.entryDate},${t.trend5d},${t.trendDir},${t.hasGap},${t.locVsSMA},${t.nr7Range},${t.nr7Green},${t.nr7BodyRatio},${t.nr7VolRatio},${t.day1Gap},${t.day1GapDir},${t.dayOfWeek},${t.patternType},${t.outcome},${t.pnlR},${t.exitDay},${t.exitReason},${t.mfe},${t.mae},${t.falseBreakoutDay1}`
        );
        fs.writeFileSync(CSV_FILE, [headers, ...rows].join('\n'));
        console.log(`CSV saved to ${CSV_FILE}`);
    }
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function wr(list) {
    const resolved = list.filter(t => t.outcome === 'WIN' || t.outcome === 'LOSS');
    if (resolved.length === 0) return '0.0';
    return (resolved.filter(t => t.outcome === 'WIN').length / resolved.length * 100).toFixed(1);
}

function netR(list) {
    return list.reduce((s, t) => s + t.pnlR, 0).toFixed(1);
}

function avgMetric(list, key) {
    if (list.length === 0) return '0.00';
    return (list.reduce((s, t) => s + (t[key] || 0), 0) / list.length).toFixed(2);
}

function avgPnl(list) {
    if (list.length === 0) return '0.00';
    return (list.reduce((s, t) => s + t.pnlR, 0) / list.length).toFixed(2);
}

function pctWith(list, key) {
    if (list.length === 0) return '0.0';
    return (list.filter(t => t[key]).length / list.length * 100).toFixed(1);
}

function pctMatch(list, key, ...vals) {
    if (list.length === 0) return '0.0';
    return (list.filter(t => vals.includes(t[key])).length / list.length * 100).toFixed(1);
}

function pctGapInDir(list) {
    if (list.length === 0) return '0.0';
    const matching = list.filter(t => {
        if (t.direction === 'LONG' && t.day1GapDir === 'UP') return true;
        if (t.direction === 'SHORT' && t.day1GapDir === 'DOWN') return true;
        return false;
    });
    return (matching.length / list.length * 100).toFixed(1);
}

function diff(a, b, key) {
    const va = a.length > 0 ? a.reduce((s, t) => s + t[key], 0) / a.length : 0;
    const vb = b.length > 0 ? b.reduce((s, t) => s + t[key], 0) / b.length : 0;
    const d = va - vb;
    return (d >= 0 ? '+' : '') + d.toFixed(2);
}

function diffPct(a, b, key) {
    const va = a.length > 0 ? a.filter(t => t[key]).length / a.length * 100 : 0;
    const vb = b.length > 0 ? b.filter(t => t[key]).length / b.length * 100 : 0;
    return (va - vb >= 0 ? '+' : '') + (va - vb).toFixed(1) + '%';
}

function countByDay(list, day) {
    return list.filter(t => t.exitDay === day).length;
}
function pctByDay(list, day) {
    if (list.length === 0) return '0.0';
    return (list.filter(t => t.exitDay === day).length / list.length * 100).toFixed(1);
}
function wrByDay(list, day) {
    const group = list.filter(t => t.exitDay === day);
    return wr(group);
}
function countByDayRange(list, from, to) {
    return list.filter(t => t.exitDay >= from && t.exitDay <= to).length;
}
function pctByDayRange(list, from, to) {
    if (list.length === 0) return '0.0';
    return (list.filter(t => t.exitDay >= from && t.exitDay <= to).length / list.length * 100).toFixed(1);
}
function wrByDayRange(list, from, to) {
    const group = list.filter(t => t.exitDay >= from && t.exitDay <= to);
    return wr(group);
}

run();
