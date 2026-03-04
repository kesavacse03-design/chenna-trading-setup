const fs = require('fs');
const path = require('path');

const csvMasterPath = path.join(__dirname, 'factor_analysis_master.csv');
const csvRankingsPath = path.join(__dirname, 'factor_rankings.csv');
const outPath = path.join(__dirname, 'best_combinations.csv');

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

function getCombinations(arr, size) {
    const result = [];
    function combine(start, path) {
        if (path.length === size) {
            result.push([...path]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            path.push(arr[i]);
            combine(i + 1, path);
            path.pop();
        }
    }
    combine(0, []);
    return result;
}

// Map exact factor values that were proven to be the "best" in Phase 3
function getConditionFn(factor, bestValue) {
    return (row) => {
        let val = row[factor];
        if (val === '' || val === 'NULL') return false;

        // Same bucketing logic as Phase 3
        if (!isNaN(parseFloat(val)) && factor !== 'V_RATIO' && factor !== 'D_RSI' && factor !== 'W_RSI' && factor !== 'PS_GAP') {
            const numVal = parseFloat(val);
            val = numVal > 1 ? '>1' : (numVal < -1 ? '<-1' : '-1 to 1');
        } else if (factor === 'V_RATIO') {
            const numVal = parseFloat(val);
            val = numVal < 1 ? '<1' : (numVal < 2 ? '1-2' : '>2');
        } else if (factor === 'D_RSI' || factor === 'W_RSI') {
            const numVal = parseFloat(val);
            val = numVal < 30 ? '<30' : (numVal < 50 ? '30-50' : (numVal < 70 ? '50-70' : '>70'));
        } else if (factor === 'PS_GAP') {
            const numVal = parseFloat(val);
            val = numVal < -1 ? '<-1%' : (numVal < 1 ? '-1% to 1%' : '>1%');
        }

        if (val === 'false') val = 'FALSE';
        if (val === 'true') val = 'TRUE';

        return val === bestValue;
    };
}

function runCombinationAnalysis() {
    console.log("=== Running Combination Analysis ===");

    const masterData = parseCSV(csvMasterPath).data;
    const rankings = parseCSV(csvRankingsPath).data;

    // Get top 10 factors
    const topFactors = rankings.slice(0, 10).map(r => ({
        name: r.Factor,
        bestVal: r.Best_Condition
    }));

    console.log(`Using Top ${topFactors.length} Factors for combinations.`);

    const combos2 = getCombinations(topFactors, 2);
    const combos3 = getCombinations(topFactors, 3);
    const allCombos = [...combos2, ...combos3];

    console.log(`Testing ${allCombos.length} total combinations (2-factor and 3-factor)...`);

    const results = [];

    // Separate by setup type so we don't mix LONG BOs with SHORT LOMs
    const longData = masterData.filter(d => d.setup_type === 'LONG');

    for (const combo of allCombos) {
        const conditions = combo.map(c => getConditionFn(c.name, c.bestVal));

        let total = 0;
        let wins = 0;

        for (const row of longData) {
            let passed = true;
            for (const cond of conditions) {
                if (!cond(row)) {
                    passed = false;
                    break;
                }
            }

            if (passed) {
                total++;
                if (row['t1_hit'] === '1' || row['final_result'] === 'WIN_T1' || row['final_result'] === 'WIN_T2') {
                    wins++;
                }
            }
        }

        if (total >= 20) {
            const wr = (wins / total) * 100;
            if (wr >= 35.0) { // Baseline was 26.9%, so 35% is a significant edge for 1:1 tests
                results.push({
                    factors: combo.map(c => `${c.name}=${c.bestVal}`).join(' + '),
                    total,
                    wins,
                    wr: parseFloat(wr.toFixed(1))
                });
            }
        }
    }

    results.sort((a, b) => b.wr - a.wr);

    console.log(`\n=== TOP COMBINATIONS FOUND (>35% WR, Sample > 20) ===`);
    console.table(results.slice(0, 20));

    const csvHeaders = ['Rules', 'Sample_Size', 'Wins', 'Win_Rate'];
    let csvStr = csvHeaders.join(',') + '\n';

    for (const r of results) {
        csvStr += `"${r.factors}",${r.total},${r.wins},${r.wr}\n`;
    }

    fs.writeFileSync(outPath, csvStr, 'utf8');
    console.log(`Saved top combinations to ${outPath}`);
}

runCombinationAnalysis();
