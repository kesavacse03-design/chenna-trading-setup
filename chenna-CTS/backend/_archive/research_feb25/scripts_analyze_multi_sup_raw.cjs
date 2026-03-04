/**
 * RAW OUTCOME ANALYSIS — MULTI_SUPPORT_BO
 * 
 * Purpose: Measure raw price movement after signal to determine directional edge.
 * Category: MULTI_SUPPORT_BO (Breakdown)
 */

const path = require('path');
const fs = require('fs');

// Config
const DATA_FILE = path.join(__dirname, '..', 'results', 'multi_sup_data.json');
const REPORT_FILE = path.join(__dirname, '..', 'results', 'multi_sup_bo_raw_analysis.md');
const CSV_FILE = path.join(__dirname, '..', 'results', 'multi_sup_bo_raw_metrics.csv');

const round2 = (v) => Math.round(v * 100) / 100;

async function main() {
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  RAW OUTCOME ANALYSIS - MULTI_SUPPORT_BO');
    console.log('══════════════════════════════════════════════════════════════════════');

    if (!fs.existsSync(DATA_FILE)) {
        console.error(`Data file not found: ${DATA_FILE}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const symbols = Object.keys(data);
    console.log(`Loaded data for ${symbols.length} stocks.`);

    const metrics = [];

    for (const symbol of symbols) {
        const stock = data[symbol];

        // 1. Sort Data ASCENDING (Oldest -> Newest)
        const daily = (stock.daily || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // 2. Find Signal Index
        const signalDateStr = new Date(stock.addedDate).toISOString().split('T')[0];
        const signalIdx = daily.findIndex(c => c.timestamp.startsWith(signalDateStr));

        if (signalIdx === -1) {
            console.log(`Skipping ${symbol}: Signal date not found.`);
            continue;
        }

        // 3. Define Entry (Next Day Open)
        if (signalIdx >= daily.length - 1) {
            console.log(`Skipping ${symbol}: No future data.`);
            continue;
        }

        const entryCandle = daily[signalIdx + 1];
        const entryPrice = entryCandle.open;
        const entryDate = entryCandle.timestamp.split('T')[0];

        // 4. Calculate Pre-Trend (20 days before Signal)
        const lookbackIdx = Math.max(0, signalIdx - 20);
        const refCandle = daily[lookbackIdx]; // 20 days ago (or start)
        const signalClose = daily[signalIdx].close;
        const preTrendPct = round2((signalClose - refCandle.close) / refCandle.close * 100);

        // 5. Measure Future Outcomes
        const windows = [5, 10, 20];
        const res = { symbol, entryDate, entryPrice, preTrendPct };

        for (const w of windows) {
            // Slice future candles Day 1 to Day W
            const start = signalIdx + 1;
            const end = Math.min(daily.length, start + w);
            const future = daily.slice(start, end);

            if (future.length === 0) {
                res[`maxUp${w}d`] = null;
                res[`maxDown${w}d`] = null;
                continue;
            }

            const maxHigh = Math.max(...future.map(c => c.high));
            const minLow = Math.min(...future.map(c => c.low));

            res[`maxUp${w}d`] = round2((maxHigh - entryPrice) / entryPrice * 100);
            res[`maxDown${w}d`] = round2((minLow - entryPrice) / entryPrice * 100);
        }

        metrics.push(res);
    }

    console.log(`Analyzed ${metrics.length} stocks.`);

    // 6. Generate Report
    generateReport(metrics);
    generateCSV(metrics);
}

function generateReport(metrics) {
    let md = '# RAW OUTCOME ANALYSIS: MULTI_SUPPORT_BO\n\n';
    md += `**Sample:** ${metrics.length} stocks\n`;
    md += `**Method:** No filters. Entry = Day+1 Open. Measured Max Up/Down from Entry.\n\n`;

    // A. Aggregate by Window
    md += '## 1. Aggregate Outcomes by Timeframe\n\n';
    md += '| Window | Avg Max UP | Avg Max DOWN | Ratio (Up/|Down|) | Edge |\n';
    md += '|---|---|---|---|---|\n';

    for (const w of [5, 10, 20]) {
        const valid = metrics.filter(m => m[`maxUp${w}d`] !== null);
        if (valid.length === 0) continue;

        const avgUp = round2(valid.reduce((s, m) => s + m[`maxUp${w}d`], 0) / valid.length);
        const avgDown = round2(valid.reduce((s, m) => s + m[`maxDown${w}d`], 0) / valid.length);
        const ratio = round2(avgUp / Math.abs(avgDown));

        // Interpreting Ratio for Breakdown (Short Strategy?)
        // If Ratio < 1.0 (Down > Up), it favors SHORT.
        // If Ratio > 1.0 (Up > Down), it favors LONG (Mean Reversion).

        let edge = 'NEUTRAL';
        if (ratio > 1.25) edge = 'LONG 🟢 (Reversal)';
        else if (ratio < 0.8) edge = 'SHORT 🔴 (Breakdown)';

        md += `| **${w} Days** | +${avgUp}% | ${avgDown}% | **${ratio}x** | ${edge} |\n`;
    }
    md += '\n';

    // B. Segmentation by Pre-Trend (Drop Strength)
    md += '## 2. Segmentation by Pre-Trend (20d)\n\n';

    // Categories: Deep Drop (<-10%), Moderate Drop (-10% to -2%), Flat/Base (>-2%).
    const segments = [
        { label: 'Deep Drop (<-10%)', filter: m => m.preTrendPct < -10 },
        { label: 'Moderate Drop (-10% to -2%)', filter: m => m.preTrendPct >= -10 && m.preTrendPct <= -2 },
        { label: 'Flat/Base (>-2%)', filter: m => m.preTrendPct > -2 }
    ];

    for (const seg of segments) {
        md += `### ${seg.label}\n`;
        const group = metrics.filter(seg.filter);
        if (group.length === 0) {
            md += 'No stocks in this segment.\n\n';
            continue;
        }

        md += `**Count:** ${group.length}\n\n`;
        md += '| Window | Avg Max UP | Avg Max DOWN | Ratio | Edge |\n';
        md += '|---|---|---|---|---|\n';

        for (const w of [5, 10, 20]) {
            const valid = group.filter(m => m[`maxUp${w}d`] !== null);
            if (valid.length === 0) continue;

            const avgUp = round2(valid.reduce((s, m) => s + m[`maxUp${w}d`], 0) / valid.length);
            const avgDown = round2(valid.reduce((s, m) => s + m[`maxDown${w}d`], 0) / valid.length);
            const ratio = round2(avgUp / Math.abs(avgDown));

            let edge = 'NEUTRAL';
            if (ratio > 1.25) edge = 'LONG 🟢';
            else if (ratio < 0.8) edge = 'SHORT 🔴';

            md += `| ${w} Days | +${avgUp}% | ${avgDown}% | ${ratio}x | ${edge} |\n`;
        }
        md += '\n';
    }

    // C. Individual Data
    md += '## 3. Individual Data\n\n';
    md += '| Symbol | Pre-20d | MaxUp 5d | MaxDown 5d | MaxUp 10d | MaxDown 10d | MaxUp 20d | MaxDown 20d |\n';
    md += '|---|---|---|---|---|---|---|---|\n';

    for (const m of metrics) {
        md += `| ${m.symbol} | ${m.preTrendPct}% | ${m.maxUp5d}% | ${m.maxDown5d}% | ${m.maxUp10d}% | ${m.maxDown10d}% | ${m.maxUp20d}% | ${m.maxDown20d}% |\n`;
    }

    fs.writeFileSync(REPORT_FILE, md);
    console.log(`Saved Report: ${REPORT_FILE}`);
}

function generateCSV(metrics) {
    const header = 'Symbol,EntryDate,PreTrend20d,MaxUp5d,MaxDown5d,MaxUp10d,MaxDown10d,MaxUp20d,MaxDown20d';
    const rows = metrics.map(m =>
        `${m.symbol},${m.entryDate},${m.preTrendPct},${m.maxUp5d},${m.maxDown5d},${m.maxUp10d},${m.maxDown10d},${m.maxUp20d},${m.maxDown20d}`
    ).join('\n');

    fs.writeFileSync(CSV_FILE, header + '\n' + rows);
    console.log(`Saved CSV: ${CSV_FILE}`);
}

main().catch(console.error);
