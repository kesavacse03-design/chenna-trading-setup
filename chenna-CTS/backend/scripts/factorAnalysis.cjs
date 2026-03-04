const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'factor_analysis_master.csv');
const outPath = path.join(__dirname, 'factor_rankings.csv');

function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    const headers = content[0].split(',');
    const data = [];
    for (let i = 1; i < content.length; i++) {
        const vals = content[i].split(',');
        if (vals.length !== headers.length) continue;
        const row = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = vals[j];
        }
        data.push(row);
    }
    return { headers, data };
}

function analyzeFactors() {
    console.log("=== Analyzing Individual Factors ===");
    const { headers, data } = parseCSV(csvPath);

    // Identify factor columns (exclude meta and outcome columns)
    const excludeCols = [
        'symbol', 'date', 'category', 'setup_type',
        't1_hit', 't2_hit', 'mfe_pct', 'mae_pct', 'final_result'
    ];

    const factorCols = headers.filter(h => !excludeCols.includes(h));
    const rankings = [];

    for (const factor of factorCols) {
        // Find distinct values
        const groups = {};
        let isNumeric = true;

        // Check if factor is numeric (using a sample)
        for (const row of data) {
            if (row[factor] !== '' && row[factor] !== 'NULL') {
                if (isNaN(parseFloat(row[factor]))) {
                    isNumeric = false;
                    break;
                }
            }
        }

        // Grouping Data
        for (const row of data) {
            let val = row[factor];
            if (val === '' || val === 'NULL') continue;

            if (isNumeric) {
                // Bracket numerics into 5 deciles for grouping
                const numVal = parseFloat(val);
                if (factor === 'V_RATIO') {
                    val = numVal < 1 ? '<1' : (numVal < 2 ? '1-2' : '>2');
                } else if (factor === 'D_RSI' || factor === 'W_RSI') {
                    val = numVal < 30 ? '<30' : (numVal < 50 ? '30-50' : (numVal < 70 ? '50-70' : '>70'));
                } else if (factor === 'PS_GAP') {
                    val = numVal < -1 ? '<-1%' : (numVal < 1 ? '-1% to 1%' : '>1%');
                } else {
                    // Generic bucketing logic (e.g. positive/negative/neutral) 
                    val = numVal > 1 ? '>1' : (numVal < -1 ? '<-1' : '-1 to 1');
                }
            } else {
                if (val === 'false') val = 'FALSE';
                if (val === 'true') val = 'TRUE';
            }

            if (!groups[val]) {
                groups[val] = { total: 0, wins: 0, outcomes: [] };
            }
            groups[val].total++;
            if (row['t1_hit'] === '1' || row['final_result'] === 'WIN_T1' || row['final_result'] === 'WIN_T2') {
                groups[val].wins++;
            }
        }

        const groupStats = [];
        let minWR = 100;
        let maxWR = 0;
        let baselineTotal = 0;
        let baselineWins = 0;

        for (const [key, stats] of Object.entries(groups)) {
            // Ignore small sample sizes in individual factor analysis
            if (stats.total < 30) continue;

            const wr = (stats.wins / stats.total) * 100;
            if (wr < minWR) minWR = wr;
            if (wr > maxWR) maxWR = wr;

            baselineTotal += stats.total;
            baselineWins += stats.wins;

            groupStats.push({
                value: key,
                total: stats.total,
                wr: wr.toFixed(1)
            });
        }

        if (groupStats.length >= 2) {
            // Calculate edge as (Best Group WR) - (Worst Group WR)
            const edge = maxWR - minWR;
            const baselineWR = (baselineWins / baselineTotal) * 100;

            // Find the best performing value
            groupStats.sort((a, b) => parseFloat(b.wr) - parseFloat(a.wr));
            const bestCondition = groupStats[0];

            rankings.push({
                factor,
                edge: parseFloat(edge.toFixed(1)),
                bestValue: bestCondition.value,
                bestWR: parseFloat(bestCondition.wr),
                sampleSize: bestCondition.total,
                baselineWR: baselineWR.toFixed(1)
            });
        }
    }

    // Sort by largest edge
    rankings.sort((a, b) => b.edge - a.edge);

    console.log("=== TOP 10 FACTORS WITH BIGGEST EDGE ===");
    console.table(rankings.slice(0, 15));

    // Write to CSV
    const outHeaders = ['Factor', 'Edge_Pct', 'Best_Condition', 'Best_Condition_WR', 'Best_Condition_Sample', 'Baseline_WR'];
    let csvData = outHeaders.join(',') + '\n';

    for (const r of rankings) {
        csvData += `${r.factor},${r.edge},${r.bestValue},${r.bestWR},${r.sampleSize},${r.baselineWR}\n`;
    }
    fs.writeFileSync(outPath, csvData, 'utf8');
    console.log(`\nWrote factor rankings to factor_rankings.csv`);
}

analyzeFactors();
