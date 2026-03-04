const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'bounce_backtest_results.csv');

function parseCSV(filePath) {
    if (!fs.existsSync(filePath)) return null;
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

function analyzeBounce() {
    console.log(`\n======================================================`);
    console.log(`   BRUTAL RE-EXAMINATION (ROUND 3): BOUNCE STRATEGY`);
    console.log(`======================================================\n`);

    const parsed = parseCSV(csvPath);
    if (!parsed) return;
    const data = parsed.data;

    let totalSetups = 174; // Hardcoding total from the run for metric calc
    let validBounces = data.length;
    let avgDaysToEntry = data.reduce((sum, d) => sum + parseInt(d.days_to_entry), 0) / validBounces;

    let reportStr = `# BRUTAL RE-EXAMINATION: BOUNCE_ST_SWING_DOWN\n\n`;
    reportStr += `## MACRO STATISTICS\n`;
    reportStr += `- Total Breakdown Setups: 174\n`;
    reportStr += `- Valid SMA10 Reclaims (Bounces): ${validBounces} (${((validBounces / totalSetups) * 100).toFixed(1)}% reclaim rate)\n`;
    reportStr += `- Avg Days to Reclaim: ${avgDaysToEntry.toFixed(1)} days\n\n`;

    console.log(reportStr);

    let baseline1rWins = 0, baseline2rWins = 0, baseline3rWins = 0;

    for (const d of data) {
        if (parseInt(d.result_1r) > 0) baseline1rWins++;
        if (parseInt(d.result_2r) > 0) baseline2rWins++;
        if (parseInt(d.result_3r) > 0) baseline3rWins++;
    }

    const wr1 = (baseline1rWins / validBounces) * 100;
    const wr2 = (baseline2rWins / validBounces) * 100;
    const wr3 = (baseline3rWins / validBounces) * 100;

    const ev1 = ((baseline1rWins / validBounces) * 1) - (((validBounces - baseline1rWins) / validBounces) * 1);
    const ev2 = ((baseline2rWins / validBounces) * 2) - (((validBounces - baseline2rWins) / validBounces) * 1);
    const ev3 = ((baseline3rWins / validBounces) * 3) - (((validBounces - baseline3rWins) / validBounces) * 1);

    reportStr += `## OVERALL PERFORMANCE (Baseline)\n`;
    reportStr += `| R:R Ratio | Win Rate | Expected Value |\n`;
    reportStr += `|---|---|---|\n`;
    reportStr += `| 1:1 | ${wr1.toFixed(1)}% | ${ev1 > 0 ? '+' : ''}${ev1.toFixed(2)}R |\n`;
    reportStr += `| 1:2 | ${wr2.toFixed(1)}% | ${ev2 > 0 ? '+' : ''}${ev2.toFixed(2)}R |\n`;
    reportStr += `| 1:3 | ${wr3.toFixed(1)}% | ${ev3 > 0 ? '+' : ''}${ev3.toFixed(2)}R |\n\n`;

    console.log(reportStr.split('OVERALL PERFORMANCE')[1]);

    // Optimize on 1:2 RR
    let bestRR = 2;
    let baselineEV = ev2;

    reportStr += `## FACTOR RANKINGS BY EDGE (1:${bestRR} R:R)\n\n`;
    reportStr += `| Factor | Best Value | EV Edge | EV | Win Rate | Sample |\n`;
    reportStr += `|---|---|---|---|---|---|\n`;

    const factorCols = [
        'NR7', 'NR4', 'INSIDER', 'INSIDER_NR7', 'VCP_SCORE', 'ATR_CONTRACT',
        'BO_N_DAY', 'TOUCH_COUNT', 'LEVEL_AGE', 'RSI2', 'RSI2_CUM', 'STOCH_RSI',
        'MACD_HIST', 'MACD_HIST_SLOPE', 'VOL_BUILDUP', 'ACCUM', 'BO_VOL_RATIO',
        'D_EMA20', 'D_EMA50', 'D_EMA200', 'D_STACK', 'PS_GAP', 'W_EMA20'
    ];

    const factorRankings = [];

    for (const factor of factorCols) {
        const groups = {};

        for (const row of data) {
            let val = row[factor];
            if (val === '' || val === 'NULL') continue;

            // Bucketing logic
            if (!isNaN(parseFloat(val))) {
                const n = parseFloat(val);
                if (factor === 'VCP_SCORE' || factor === 'TOUCH_COUNT' || factor === 'ACCUM') {
                    val = n >= 2 ? '>=2' : '<2';
                } else if (factor === 'BO_N_DAY' || factor === 'LEVEL_AGE') {
                    val = n > 10 ? '>10 Days' : '<10 Days';
                } else if (factor === 'ATR_CONTRACT') {
                    val = n < 0.8 ? 'Contracting' : 'Expanding';
                } else if (factor === 'RSI2') {
                    val = n < 10 ? 'Oversold <10' : (n > 90 ? 'Overbought >90' : 'Neutral');
                } else if (factor === 'VOL_BUILDUP' || factor === 'BO_VOL_RATIO') {
                    val = n > 1.5 ? 'High Vol' : 'Normal Vol';
                } else {
                    val = n > 0 ? 'Positive' : 'Negative';
                }
            }

            if (!groups[val]) groups[val] = { wins: 0, total: 0 };
            groups[val].total++;
            if (parseInt(row.result_2r) > 0) groups[val].wins++;
        }

        let maxEV = -999;
        let minEV = 999;
        let bestCond = null;

        for (const [key, stats] of Object.entries(groups)) {
            if (stats.total < 10) continue; // Noise filter for low sample
            const losses = stats.total - stats.wins;
            const ev = ((stats.wins / stats.total) * bestRR) - ((losses / stats.total) * 1);
            if (ev > maxEV) { maxEV = ev; bestCond = { val: key, ev: ev, wr: (stats.wins / stats.total) * 100, sample: stats.total }; }
            if (ev < minEV) { minEV = ev; }
        }

        if (bestCond) {
            factorRankings.push({
                factor,
                edgeEV: maxEV - minEV,
                bestValue: bestCond.val,
                ev: bestCond.ev,
                wr: bestCond.wr,
                sample: bestCond.sample
            });
        }
    }

    factorRankings.sort((a, b) => b.edgeEV - a.edgeEV);

    for (const r of factorRankings) {
        reportStr += `| ${r.factor} | ${r.bestValue} | +${r.edgeEV.toFixed(2)}R | ${r.ev > 0 ? '+' : ''}${r.ev.toFixed(2)}R | ${r.wr.toFixed(1)}% | ${r.sample} |\n`;
    }

    reportStr += `\n## BEST ON-ENTRY COMBINATIONS (1:${bestRR} R:R)\n\n`;
    reportStr += `| Golden Combination Rules | Expected Value | Win Rate | Sample |\n`;
    reportStr += `|---|---|---|---|\n`;

    const topFactors = factorRankings.slice(0, 8).map(r => ({ name: r.factor, bestVal: r.bestValue }));
    const combos = getCombinations(topFactors, 2);

    const comboResults = [];

    for (const combo of combos) {
        let wins = 0, total = 0;

        for (const row of data) {
            let matches = true;
            for (const c of combo) {
                let val = row[c.name];
                if (val === '' || val === 'NULL') { matches = false; break; }

                // Same bucketing logic
                if (!isNaN(parseFloat(val))) {
                    const n = parseFloat(val);
                    if (c.name === 'VCP_SCORE' || c.name === 'TOUCH_COUNT' || c.name === 'ACCUM') val = n >= 2 ? '>=2' : '<2';
                    else if (c.name === 'BO_N_DAY' || c.name === 'LEVEL_AGE') val = n > 10 ? '>10 Days' : '<10 Days';
                    else if (c.name === 'ATR_CONTRACT') val = n < 0.8 ? 'Contracting' : 'Expanding';
                    else if (c.name === 'RSI2') val = n < 10 ? 'Oversold <10' : (n > 90 ? 'Overbought >90' : 'Neutral');
                    else if (c.name === 'VOL_BUILDUP' || c.name === 'BO_VOL_RATIO') val = n > 1.5 ? 'High Vol' : 'Normal Vol';
                    else val = n > 0 ? 'Positive' : 'Negative';
                }

                if (val !== c.bestVal) { matches = false; break; }
            }

            if (matches) {
                total++;
                if (parseInt(row.result_2r) > 0) wins++;
            }
        }

        if (total >= 10) {
            const losses = total - wins;
            const ev = ((wins / total) * bestRR) - ((losses / total) * 1);
            if (ev > baselineEV + 0.1) {
                comboResults.push({
                    name: combo.map(c => `${c.name}=${c.bestVal}`).join(' + '),
                    ev: ev,
                    wr: (wins / total) * 100,
                    sample: total
                });
            }
        }
    }

    comboResults.sort((a, b) => b.ev - a.ev);
    for (const res of comboResults.slice(0, 15)) {
        reportStr += `| ${res.name} | +${res.ev.toFixed(2)}R | ${res.wr.toFixed(1)}% | ${res.sample} |\n`;
    }

    const reportPath = path.join(__dirname, `report_BOUNCE_ST_SWING_DOWN.md`);
    fs.writeFileSync(reportPath, reportStr, 'utf8');
    console.log(`\nReport successfully written to ${reportPath}`);
}

analyzeBounce();
