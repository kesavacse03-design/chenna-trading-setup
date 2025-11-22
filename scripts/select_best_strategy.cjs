const fs = require('fs');
const path = require('path');

const SUMMARY_FILE = path.join(__dirname, '../tmp/backtest_summary.csv');
const OUTPUT_FILE = path.join(__dirname, '../tmp/best_strategy.json');
const REPORT_FILE = path.join(__dirname, '../tmp/selection_report.md');

function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',');

    const results = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const row = {};

        // Parse CSV line with quoted fields
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                if (inQuotes && line[j + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    j++;
                } else {
                    // Toggle quotes
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current); // Last value

        headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
        });
        results.push(row);
    }

    return results;
}

function main() {
    if (!fs.existsSync(SUMMARY_FILE)) {
        console.error('Summary file not found:', SUMMARY_FILE);
        process.exit(1);
    }

    const results = parseCSV(SUMMARY_FILE);
    console.log(`Loaded ${results.length} backtest results.`);

    // Convert metrics to numbers and filter out invalid results
    const validResults = results.map(r => ({
        ...r,
        netPnl: parseFloat(r.netPnl) || 0,
        winRate: parseFloat(r.winRate) || 0,
        totalTrades: parseInt(r.totalTrades) || 0,
        maxDrawdown: parseFloat(r.maxDrawdown) || 0,
        expectancy: parseFloat(r.expectancy) || 0
    })).filter(r => r.totalTrades > 0); // Only consider strategies that generated trades

    console.log(`Valid results with trades: ${validResults.length}`);

    if (validResults.length === 0) {
        console.error('No valid results found. All strategies produced 0 trades.');
        process.exit(1);
    }

    // Sort by multiple criteria:
    // 1. Win rate (higher is better)
    // 2. Net PnL (higher is better)
    // 3. Max drawdown (lower is better)
    validResults.sort((a, b) => {
        // Primary: Win rate
        if (Math.abs(a.winRate - b.winRate) > 0.01) {
            return b.winRate - a.winRate;
        }
        // Secondary: Net PnL
        if (Math.abs(a.netPnl - b.netPnl) > 100) {
            return b.netPnl - a.netPnl;
        }
        // Tertiary: Max drawdown (lower is better)
        return a.maxDrawdown - b.maxDrawdown;
    });

    const best = validResults[0];
    console.log('\n=== Best Strategy ===');
    console.log('Run ID:', best.runId);
    console.log('Candidate Index:', best.candidateIdx);
    console.log('Net PnL:', best.netPnl);
    console.log('Win Rate:', best.winRate.toFixed(2) + '%');
    console.log('Total Trades:', best.totalTrades);
    console.log('Max Drawdown:', best.maxDrawdown);
    console.log('Expectancy:', best.expectancy);

    // Parse the config (it's a JSON string with escaped quotes)
    let config = {};
    try {
        const configStr = best.config.replace(/^"|"$/g, '').replace(/""/g, '"');
        config = JSON.parse(configStr);
    } catch (e) {
        console.error('Failed to parse config:', e.message);
    }

    // Save the best strategy
    const bestStrategy = {
        categoryKey: 'DOWNSIDE_LOM_SWING',
        runId: best.runId,
        candidateIdx: parseInt(best.candidateIdx),
        metrics: {
            netPnl: best.netPnl,
            winRate: best.winRate,
            totalTrades: best.totalTrades,
            maxDrawdown: best.maxDrawdown,
            expectancy: best.expectancy
        },
        config: config,
        selectedAt: new Date().toISOString()
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(bestStrategy, null, 2), 'utf8');
    console.log('\nBest strategy saved to:', OUTPUT_FILE);

    // Generate a markdown report
    const report = `# Strategy Selection Report

**Category:** DOWNSIDE LOM SWING  
**Generated:** ${new Date().toISOString()}

## Selected Strategy

- **Run ID:** ${best.runId}
- **Candidate Index:** ${best.candidateIdx}
- **Net PnL:** ${best.netPnl.toFixed(2)}
- **Win Rate:** ${best.winRate.toFixed(2)}%
- **Total Trades:** ${best.totalTrades}
- **Max Drawdown:** ${best.maxDrawdown.toFixed(2)}
- **Expectancy:** ${best.expectancy.toFixed(4)}

## Configuration

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

## Top 10 Strategies

| Rank | Run ID | Win Rate | Net PnL | Trades | Max DD |
|------|--------|----------|---------|--------|--------|
${validResults.slice(0, 10).map((r, idx) =>
        `| ${idx + 1} | ${r.runId} | ${r.winRate.toFixed(2)}% | ${r.netPnl.toFixed(2)} | ${r.totalTrades} | ${r.maxDrawdown.toFixed(2)} |`
    ).join('\n')}

## Summary Statistics

- **Total Candidates Tested:** ${results.length}
- **Candidates with Trades:** ${validResults.length}
- **Candidates with No Trades:** ${results.length - validResults.length}
`;

    fs.writeFileSync(REPORT_FILE, report, 'utf8');
    console.log('Selection report saved to:', REPORT_FILE);
}

main();
