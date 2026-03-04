/**
 * DAILY_CONTRACTION (NR7) Data Exploration Script
 * 
 * Verifies NR7 signals, calculates quality scores, and simulates
 * Toby Crabel breakout trades on historical data.
 * 
 * Entry Rules (from TradeCode):
 * - Day 0: NR7 candle forms (addedDate)
 * - Day 1+: Wait for CLOSE above NR7 High (LONG) or CLOSE below NR7 Low (SHORT)
 * - First direction that triggers wins
 * - Stop at opposite extreme of NR7 range
 */

const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const CATEGORY_KEY = 'DAILY_CONTRACTION';
const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const REPORT_FILE = path.join(ARTIFACT_DIR, 'daily_contraction_exploration.md');
const CSV_FILE = path.join(ARTIFACT_DIR, 'daily_contraction_data.csv');

// Also save locally as backup
const LOCAL_REPORT = path.join(__dirname, '..', 'results', 'daily_contraction_exploration.md');
const LOCAL_CSV = path.join(__dirname, '..', 'results', 'daily_contraction_data.csv');

async function runExploration() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  DAILY_CONTRACTION (NR7) EXPLORATION`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        // ========== STEP 1: Fetch Category Stocks ==========
        const category = await prisma.category.findUnique({
            where: { key: CATEGORY_KEY }
        });

        if (!category) {
            console.log(`Category '${CATEGORY_KEY}' not found.`);
            return;
        }

        const entries = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            select: {
                addedDate: true,
                createdAt: true,
                stock: {
                    select: {
                        symbol: true,
                        instrumentKey: true
                    }
                }
            },
            orderBy: { addedDate: 'desc' }
        });

        console.log(`[DB] Found ${entries.length} stock entries in ${CATEGORY_KEY}\n`);

        if (entries.length === 0) return;

        // Date distribution
        const byMonth = {};
        entries.forEach(e => {
            const d = new Date(e.addedDate || e.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            byMonth[key] = (byMonth[key] || 0) + 1;
        });
        console.log('Distribution by Month:');
        Object.keys(byMonth).sort().forEach(m => console.log(`  ${m}: ${byMonth[m]} stocks`));
        console.log();

        // ========== STEP 2: Process Each Stock ==========
        const results = [];
        let skipped = { noData: 0, notEnoughHistory: 0, signalNotFound: 0, tooManyCandles: 0 };
        let processed = 0;

        for (const entry of entries) {
            const stock = entry.stock;
            const signalDate = new Date(entry.addedDate || entry.createdAt);
            const dateStr = signalDate.toISOString().split('T')[0];

            process.stdout.write(`[${++processed}/${entries.length}] ${stock.symbol} (${dateStr})... `);

            // Fetch daily data: 20 days before to 15 days after signal
            const fromDate = new Date(signalDate);
            fromDate.setDate(fromDate.getDate() - 25);
            const toDate = new Date(signalDate);
            toDate.setDate(toDate.getDate() + 15);

            let candles;
            try {
                candles = await priceService.fetchPrice(
                    stock.symbol,
                    stock.instrumentKey,
                    fromDate.toISOString().split('T')[0],
                    toDate.toISOString().split('T')[0],
                    'day'
                );
            } catch (err) {
                console.log(`ERR: ${err.message}`);
                skipped.noData++;
                continue;
            }

            if (!candles || candles.length < 10) {
                console.log(`skip (${candles ? candles.length : 0} candles)`);
                skipped.noData++;
                continue;
            }

            // CACHE INTEGRITY CHECK: Daily candles should be ~30-40 for a 40-day window
            if (candles.length > 60) {
                console.log(`WARN: ${candles.length} candles for 40 days - likely 1min data! Skipping.`);
                skipped.tooManyCandles++;
                continue;
            }

            // Find signal day candle
            const signalDayIdx = candles.findIndex(c =>
                c && c.timestamp && c.timestamp.startsWith(dateStr)
            );

            if (signalDayIdx === -1) {
                // Try day before (TradeCode may add after market close, so addedDate = next business day)
                const prevDate = new Date(signalDate);
                prevDate.setDate(prevDate.getDate() - 1);
                const prevStr = prevDate.toISOString().split('T')[0];
                const altIdx = candles.findIndex(c => c && c.timestamp && c.timestamp.startsWith(prevStr));

                if (altIdx === -1) {
                    console.log(`skip (date not found)`);
                    skipped.signalNotFound++;
                    continue;
                }
                // Use previous day as signal day
            }

            // Use the best match
            let idx = signalDayIdx !== -1 ? signalDayIdx : candles.findIndex(c =>
                c && c.timestamp && c.timestamp.startsWith(
                    new Date(new Date(signalDate).setDate(signalDate.getDate() - 1)).toISOString().split('T')[0]
                )
            );

            if (idx < 7) {
                console.log(`skip (only ${idx} days before signal)`);
                skipped.notEnoughHistory++;
                continue;
            }

            // ========== STEP 3: Verify NR7 ==========
            const signalCandle = candles[idx];
            const prevCandle = candles[idx - 1];
            const currentRange = signalCandle.high - signalCandle.low;

            let isNR7 = true;
            for (let i = 1; i < 7; i++) {
                const c = candles[idx - i];
                if (!c) { isNR7 = false; break; }
                const r = c.high - c.low;
                if (r <= currentRange) {
                    isNR7 = false;
                    break;
                }
            }

            // ========== STEP 4: Check Insider Status ==========
            const isInsider = (signalCandle.high < prevCandle.high) &&
                (signalCandle.low > prevCandle.low);

            // ========== STEP 5: Quality Scoring (-1 to +4) ==========
            const rangePercent = (currentRange / signalCandle.close) * 100;

            // Factor 1: Insider NR7 (+1)
            let qualityScore = 0;
            if (isInsider) qualityScore += 1;

            // Factor 2: Range Tightness
            if (rangePercent < 2) qualityScore += 1;        // Very tight
            else if (rangePercent > 4) qualityScore -= 1;   // Too wide

            // Factor 3: Volume Contraction
            let volAvg5 = 0;
            for (let i = 1; i <= 5; i++) {
                if (candles[idx - i]) volAvg5 += candles[idx - i].volume || 0;
            }
            volAvg5 /= 5;
            const volumeContracting = volAvg5 > 0 && signalCandle.volume < volAvg5;
            if (volumeContracting) qualityScore += 1;

            // Factor 4: At Key Level (near 20-day high or low)
            let high20 = -Infinity, low20 = Infinity;
            for (let i = 0; i < 20 && (idx - i) >= 0; i++) {
                const c = candles[idx - i];
                if (c) {
                    if (c.high > high20) high20 = c.high;
                    if (c.low < low20) low20 = c.low;
                }
            }
            const range20 = high20 - low20;
            const nearHigh = range20 > 0 && (high20 - signalCandle.high) / range20 < 0.1;
            const nearLow = range20 > 0 && (signalCandle.low - low20) / range20 < 0.1;
            if (nearHigh || nearLow) qualityScore += 1;

            // Quality Level
            let qualityLevel;
            if (qualityScore >= 3) qualityLevel = 'HIGH';
            else if (qualityScore >= 1) qualityLevel = 'MEDIUM';
            else qualityLevel = 'LOW';

            // ========== STEP 6: Simulate Trade (Toby Crabel) ==========
            const nr7High = signalCandle.high;
            const nr7Low = signalCandle.low;

            let direction = null;
            let entryPrice = null;
            let stopLoss = null;
            let risk = 0;
            let triggerDay = null;
            let exitReason = 'NO_TRIGGER';
            let pnlR = 0;
            let maxMfe = 0;
            let daysHeld = 0;

            // Look for entry trigger: Day 1 to Day 5 after NR7
            for (let d = 1; d <= 5; d++) {
                if (idx + d >= candles.length) break;
                const day = candles[idx + d];

                // CLOSE above NR7 High = LONG trigger
                if (day.close > nr7High && !direction) {
                    direction = 'LONG';
                    entryPrice = day.close; // Enter at close
                    stopLoss = nr7Low;
                    risk = entryPrice - stopLoss;
                    triggerDay = d;
                    break;
                }
                // CLOSE below NR7 Low = SHORT trigger
                if (day.close < nr7Low && !direction) {
                    direction = 'SHORT';
                    entryPrice = day.close;
                    stopLoss = nr7High;
                    risk = stopLoss - entryPrice;
                    triggerDay = d;
                    break;
                }
            }

            // Simulate outcome if triggered
            if (direction && triggerDay && risk > 0) {
                const target15 = direction === 'LONG'
                    ? entryPrice + risk * 1.5
                    : entryPrice - risk * 1.5;
                const target20 = direction === 'LONG'
                    ? entryPrice + risk * 2.0
                    : entryPrice - risk * 2.0;

                exitReason = 'TIMEOUT_10';

                for (let d = triggerDay + 1; d <= triggerDay + 10; d++) {
                    if (idx + d >= candles.length) break;
                    const day = candles[idx + d];
                    daysHeld++;

                    if (direction === 'LONG') {
                        const mfe = ((day.high - entryPrice) / entryPrice) * 100;
                        if (mfe > maxMfe) maxMfe = mfe;

                        // Check stop first (conservative)
                        if (day.low <= stopLoss) {
                            exitReason = 'STOP';
                            pnlR = -1.0;
                            break;
                        }
                        // Check 1.5R target
                        if (day.high >= target15) {
                            exitReason = 'TARGET_1.5R';
                            pnlR = 1.5;
                            break;
                        }
                    } else { // SHORT
                        const mfe = ((entryPrice - day.low) / entryPrice) * 100;
                        if (mfe > maxMfe) maxMfe = mfe;

                        if (day.high >= stopLoss) {
                            exitReason = 'STOP';
                            pnlR = -1.0;
                            break;
                        }
                        if (day.low <= target15) {
                            exitReason = 'TARGET_1.5R';
                            pnlR = 1.5;
                            break;
                        }
                    }
                }

                // If timed out, calculate actual P&L at last candle
                if (exitReason === 'TIMEOUT_10') {
                    const lastIdx = Math.min(idx + triggerDay + 10, candles.length - 1);
                    const lastCandle = candles[lastIdx];
                    if (direction === 'LONG') {
                        pnlR = risk > 0 ? (lastCandle.close - entryPrice) / risk : 0;
                    } else {
                        pnlR = risk > 0 ? (entryPrice - lastCandle.close) / risk : 0;
                    }
                }
            }

            const outcome = pnlR > 0 ? 'WIN' : pnlR < 0 ? 'LOSS' : 'FLAT';

            console.log(`NR7:${isNR7 ? 'Y' : 'N'} Ins:${isInsider ? 'Y' : 'N'} Q:${qualityLevel}(${qualityScore}) Dir:${direction || '-'} ${exitReason} ${pnlR.toFixed(1)}R`);

            results.push({
                symbol: stock.symbol,
                date: dateStr,
                isNR7,
                isInsider,
                rangePercent: +rangePercent.toFixed(2),
                volumeContracting,
                nearKeyLevel: nearHigh || nearLow,
                qualityScore,
                qualityLevel,
                direction: direction || 'NONE',
                triggerDay: triggerDay || 0,
                exitReason,
                pnlR: +pnlR.toFixed(2),
                daysHeld,
                maxMfe: +maxMfe.toFixed(2),
                outcome
            });
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`  EXPLORATION COMPLETE`);
        console.log(`  Processed: ${results.length} | Skipped: ${JSON.stringify(skipped)}`);
        console.log(`${'='.repeat(60)}\n`);

        // ========== STEP 7: Generate Reports ==========
        if (results.length > 0) {
            generateReports(results, entries.length, skipped);
        }

    } catch (error) {
        console.error('Fatal Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

function generateReports(results, totalEntries, skipped) {
    // ===== CSV =====
    const csvHeader = 'Symbol,Date,IsNR7,IsInsider,Range%,VolContracting,NearKeyLevel,QualityScore,QualityLevel,Direction,TriggerDay,ExitReason,PnL_R,DaysHeld,MaxMFE%,Outcome\n';
    const csvRows = results.map(r =>
        `${r.symbol},${r.date},${r.isNR7},${r.isInsider},${r.rangePercent},${r.volumeContracting},${r.nearKeyLevel},${r.qualityScore},${r.qualityLevel},${r.direction},${r.triggerDay},${r.exitReason},${r.pnlR},${r.daysHeld},${r.maxMfe},${r.outcome}`
    ).join('\n');

    // ===== Stats =====
    const total = results.length;
    const trueNR7 = results.filter(r => r.isNR7);
    const insiderNR7 = results.filter(r => r.isInsider);
    const triggered = results.filter(r => r.direction !== 'NONE');
    const longs = triggered.filter(r => r.direction === 'LONG');
    const shorts = triggered.filter(r => r.direction === 'SHORT');
    const wins = triggered.filter(r => r.pnlR > 0);
    const losses = triggered.filter(r => r.pnlR < 0);
    const winRate = triggered.length > 0 ? (wins.length / triggered.length * 100).toFixed(1) : '0';
    const totalPnlR = triggered.reduce((s, r) => s + r.pnlR, 0);
    const avgPnlR = triggered.length > 0 ? (totalPnlR / triggered.length).toFixed(2) : '0';

    // Quality breakdown
    const highQ = triggered.filter(r => r.qualityLevel === 'HIGH');
    const medQ = triggered.filter(r => r.qualityLevel === 'MEDIUM');
    const lowQ = triggered.filter(r => r.qualityLevel === 'LOW');
    const highQWR = highQ.length > 0 ? (highQ.filter(r => r.pnlR > 0).length / highQ.length * 100).toFixed(1) : 'N/A';
    const medQWR = medQ.length > 0 ? (medQ.filter(r => r.pnlR > 0).length / medQ.length * 100).toFixed(1) : 'N/A';
    const lowQWR = lowQ.length > 0 ? (lowQ.filter(r => r.pnlR > 0).length / lowQ.length * 100).toFixed(1) : 'N/A';

    // NR7 vs non-NR7
    const nr7Triggered = trueNR7.filter(r => r.direction !== 'NONE');
    const nr7WR = nr7Triggered.length > 0 ? (nr7Triggered.filter(r => r.pnlR > 0).length / nr7Triggered.length * 100).toFixed(1) : 'N/A';
    const nonNR7 = results.filter(r => !r.isNR7 && r.direction !== 'NONE');
    const nonNR7WR = nonNR7.length > 0 ? (nonNR7.filter(r => r.pnlR > 0).length / nonNR7.length * 100).toFixed(1) : 'N/A';

    // Insider vs non-Insider
    const insiderTriggered = insiderNR7.filter(r => r.direction !== 'NONE');
    const insiderWR = insiderTriggered.length > 0 ? (insiderTriggered.filter(r => r.pnlR > 0).length / insiderTriggered.length * 100).toFixed(1) : 'N/A';

    // Direction stats
    const longWR = longs.length > 0 ? (longs.filter(r => r.pnlR > 0).length / longs.length * 100).toFixed(1) : 'N/A';
    const shortWR = shorts.length > 0 ? (shorts.filter(r => r.pnlR > 0).length / shorts.length * 100).toFixed(1) : 'N/A';

    // Average range%
    const avgRange = (results.reduce((s, r) => s + r.rangePercent, 0) / total).toFixed(2);

    // Exit reason breakdown
    const exitBreakdown = {};
    triggered.forEach(r => { exitBreakdown[r.exitReason] = (exitBreakdown[r.exitReason] || 0) + 1; });

    // Average days to trigger
    const avgTriggerDay = triggered.length > 0 ? (triggered.reduce((s, r) => s + r.triggerDay, 0) / triggered.length).toFixed(1) : 'N/A';

    // Top 5 winners and losers
    const sortedByPnl = [...triggered].sort((a, b) => b.pnlR - a.pnlR);
    const topWinners = sortedByPnl.slice(0, 5);
    const topLosers = sortedByPnl.slice(-5).reverse();

    // ===== Markdown Report =====
    const md = `# DAILY_CONTRACTION (NR7) Exploration Report
> Generated: ${new Date().toISOString().split('T')[0]}

## 1. Category Statistics

| Metric | Value |
|--------|-------|
| Total Entries in DB | ${totalEntries} |
| Successfully Analyzed | ${total} |
| Skipped (no data) | ${skipped.noData} |
| Skipped (not enough history) | ${skipped.notEnoughHistory} |
| Skipped (signal date not found) | ${skipped.signalNotFound} |
| Skipped (cache integrity fail) | ${skipped.tooManyCandles} |

## 2. NR7 Verification

| Metric | Count | % of Analyzed |
|--------|-------|---------------|
| Verified TRUE NR7 | ${trueNR7.length} | ${(trueNR7.length / total * 100).toFixed(1)}% |
| Insider NR7 | ${insiderNR7.length} | ${(insiderNR7.length / total * 100).toFixed(1)}% |
| Average NR7 Range% | ${avgRange}% | - |

## 3. Breakout Direction Stats

| Metric | Count | % |
|--------|-------|---|
| Broke UP (LONG trigger) | ${longs.length} | ${triggered.length > 0 ? (longs.length / triggered.length * 100).toFixed(1) : 0}% |
| Broke DOWN (SHORT trigger) | ${shorts.length} | ${triggered.length > 0 ? (shorts.length / triggered.length * 100).toFixed(1) : 0}% |
| No breakout in 5 days | ${total - triggered.length} | ${((total - triggered.length) / total * 100).toFixed(1)}% |
| Avg days to trigger | ${avgTriggerDay} | - |

## 4. Baseline Performance (1.5R Target, 10-Day Timeout)

| Metric | Value |
|--------|-------|
| Total Trades Triggered | ${triggered.length} |
| Wins | ${wins.length} |
| Losses | ${losses.length} |
| **Win Rate** | **${winRate}%** |
| Total P&L (R-multiples) | ${totalPnlR.toFixed(1)}R |
| Avg P&L per Trade | ${avgPnlR}R |

### Exit Reason Breakdown
| Reason | Count | % |
|--------|-------|---|
${Object.entries(exitBreakdown).map(([k, v]) => `| ${k} | ${v} | ${(v / triggered.length * 100).toFixed(1)}% |`).join('\n')}

## 5. Quality Filter Analysis

| Quality Level | Trades | Win Rate | Avg P&L |
|---------------|--------|----------|---------|
| HIGH (3-4 pts) | ${highQ.length} | ${highQWR}% | ${highQ.length > 0 ? (highQ.reduce((s, r) => s + r.pnlR, 0) / highQ.length).toFixed(2) : 'N/A'}R |
| MEDIUM (1-2 pts) | ${medQ.length} | ${medQWR}% | ${medQ.length > 0 ? (medQ.reduce((s, r) => s + r.pnlR, 0) / medQ.length).toFixed(2) : 'N/A'}R |
| LOW (0 or below) | ${lowQ.length} | ${lowQWR}% | ${lowQ.length > 0 ? (lowQ.reduce((s, r) => s + r.pnlR, 0) / lowQ.length).toFixed(2) : 'N/A'}R |

## 6. Comparison Breakdown

### NR7 Status
| Group | Trades | Win Rate |
|-------|--------|----------|
| Verified NR7 | ${nr7Triggered.length} | ${nr7WR}% |
| Not True NR7 | ${nonNR7.length} | ${nonNR7WR}% |

### Insider Status
| Group | Trades | Win Rate |
|-------|--------|----------|
| Insider NR7 | ${insiderTriggered.length} | ${insiderWR}% |
| Regular | ${triggered.length - insiderTriggered.length} | ${triggered.length - insiderTriggered.length > 0 ? ((triggered.filter(r => !r.isInsider && r.pnlR > 0).length) / (triggered.length - insiderTriggered.length) * 100).toFixed(1) : 'N/A'}% |

### Direction
| Direction | Trades | Win Rate |
|-----------|--------|----------|
| LONG | ${longs.length} | ${longWR}% |
| SHORT | ${shorts.length} | ${shortWR}% |

## 7. Top 5 Winners
| Symbol | Date | Quality | Direction | P&L | MFE% |
|--------|------|---------|-----------|-----|------|
${topWinners.map(r => `| ${r.symbol} | ${r.date} | ${r.qualityLevel}(${r.qualityScore}) | ${r.direction} | ${r.pnlR}R | ${r.maxMfe}% |`).join('\n')}

## 8. Top 5 Losers
| Symbol | Date | Quality | Direction | P&L | Exit |
|--------|------|---------|-----------|-----|------|
${topLosers.map(r => `| ${r.symbol} | ${r.date} | ${r.qualityLevel}(${r.qualityScore}) | ${r.direction} | ${r.pnlR}R | ${r.exitReason} |`).join('\n')}

## 9. Key Takeaways
- **NR7 Accuracy**: ${(trueNR7.length / total * 100).toFixed(0)}% of TradeCode signals are TRUE NR7s
- **Insider Edge**: Insider NR7 WR = ${insiderWR}% vs Regular WR = ${triggered.length - insiderTriggered.length > 0 ? ((triggered.filter(r => !r.isInsider && r.pnlR > 0).length) / (triggered.length - insiderTriggered.length) * 100).toFixed(1) : 'N/A'}%
- **Direction Preference**: ${longs.length > shorts.length ? 'LONG' : 'SHORT'} breakouts more common (${Math.max(longs.length, shorts.length)} vs ${Math.min(longs.length, shorts.length)})
- **Quality Filter Impact**: HIGH quality WR = ${highQWR}% vs LOW quality WR = ${lowQWR}%
`;

    // Write files
    const writeFile = (filePath, content) => {
        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, content);
            console.log(`  Saved: ${filePath}`);
        } catch (e) {
            console.error(`  FAILED to save ${filePath}: ${e.message}`);
        }
    };

    writeFile(CSV_FILE, csvHeader + csvRows);
    writeFile(REPORT_FILE, md);
    writeFile(LOCAL_CSV, csvHeader + csvRows);
    writeFile(LOCAL_REPORT, md);

    // Print summary to console
    console.log(`\n${'='.repeat(60)}`);
    console.log('  SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log(`  Total analyzed:     ${total}`);
    console.log(`  True NR7:           ${trueNR7.length} (${(trueNR7.length / total * 100).toFixed(1)}%)`);
    console.log(`  Insider NR7:        ${insiderNR7.length} (${(insiderNR7.length / total * 100).toFixed(1)}%)`);
    console.log(`  Triggered trades:   ${triggered.length}`);
    console.log(`  Win Rate:           ${winRate}%`);
    console.log(`  Total P&L:          ${totalPnlR.toFixed(1)}R`);
    console.log(`  LONG WR:            ${longWR}%`);
    console.log(`  SHORT WR:           ${shortWR}%`);
    console.log(`  HIGH Quality WR:    ${highQWR}%`);
    console.log(`  MEDIUM Quality WR:  ${medQWR}%`);
    console.log(`  LOW Quality WR:     ${lowQWR}%`);
    console.log(`${'='.repeat(60)}\n`);
}

runExploration();
