const fs = require('fs');
const path = require('path');
const SUMMARY_FILE = path.join(__dirname, '../tmp/backtest_summary.csv');
const OUTPUT_DIR = path.join(__dirname, '../backend/strategy/output');
const CATEGORY = 'DOWNSIDE LOM SWING';

if (!fs.existsSync(SUMMARY_FILE)) {
    console.error('Summary file not found');
    process.exit(1);
}

const content = fs.readFileSync(SUMMARY_FILE, 'utf8');
const lines = content.trim().split('\n');
const headers = lines[0].split(',');
const records = lines.slice(1).map(line => {
    // Handle quoted JSON config
    const parts = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && line[i + 1] === '"') {
            current += '"';
            i++;
        } else if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current);

    const record = {};
    headers.forEach((h, i) => {
        record[h] = parts[i];
    });
    return record;
});

// Sort by netPnl descending
records.sort((a, b) => Number(b.netPnl) - Number(a.netPnl));

const best = records[0];
console.log('Best strategy:', best);

const strategy = {
    runId: best.runId,
    candidateIdx: Number(best.candidateIdx),
    config: JSON.parse(best.config),
    metrics: {
        netPnl: Number(best.netPnl),
        winRate: Number(best.winRate),
        totalTrades: Number(best.totalTrades),
        maxDrawdown: Number(best.maxDrawdown),
        expectancy: Number(best.expectancy)
    },
    categoryKey: CATEGORY,
    selectedAt: new Date().toISOString()
};

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const outputFile = path.join(OUTPUT_DIR, `strategy-${CATEGORY}-v1.json`);
fs.writeFileSync(outputFile, JSON.stringify(strategy, null, 2));
console.log(`Saved to ${outputFile}`);
