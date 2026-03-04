const fs = require('fs');
const path = require('path');

const csvMasterPath = path.join(__dirname, 'factor_analysis_v2_master.csv');

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

function simulateTrade(row, stopType, rrRatio) {
    if (row.entry_active !== 'TRUE') return null;

    let riskPct = 0;
    if (stopType === 'SWING') riskPct = parseFloat(row.stop_swing_pct);
    else if (stopType === 'ATR') riskPct = parseFloat(row.stop_atr_pct);
    else if (stopType === 'FIXED') riskPct = parseFloat(row.stop_fixed_pct);

    if (isNaN(riskPct) || riskPct <= 0) return null;

    const targetPct = riskPct * rrRatio;
    const mfe = parseFloat(row.mfe_pct);
    const mae = parseFloat(row.mae_pct);

    // Conservative check: if both target and stop hit, assume stop hit first.
    let hitStop = mae <= -riskPct;
    let hitTarget = mfe >= targetPct;

    if (hitStop && hitTarget) hitTarget = false; // assume loss

    if (hitStop) return -1; // -1 R
    if (hitTarget) return rrRatio; // +R
    return 0; // Flat/Time exit
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

function analyzeCategory(targetCategory) {
    let reportStr = `# BRUTAL RE-EXAMINATION: ${targetCategory}\n\n`;
    console.log(reportStr);

    const { headers, data } = parseCSV(csvMasterPath);
    const catData = data.filter(d => d.category.includes(targetCategory));

    if (catData.length === 0) {
        console.log(`No data found for category: ${targetCategory}`);
        return;
    }

    reportStr += `Total Permutation Rows: ${catData.length} (Setups: ${catData.length / 3})\n\n`;
    console.log(`Total Permutation Rows: ${catData.length} (Setups: ${catData.length / 3})\n`);

    // ----------------------------------------------------------------
    // TABLE 3: ENTRY METHOD COMPARISON (using default Swing Stop, 1:2 R:R)
    // ----------------------------------------------------------------
    reportStr += `## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)\n\n`;
    reportStr += `| Entry Method | Sample | Win Rate | Expected Value |\n`;
    reportStr += `|---|---|---|---|\n`;
    console.log(`--- TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R) ---`);
    const entryMethods = ['CHASE', 'NEXT_OPEN', 'RETEST'];
    let bestEntryMethod = 'CHASE';
    let bestEntryEV = -999;

    for (const em of entryMethods) {
        const emData = catData.filter(d => d.entry_method === em && d.entry_active === 'TRUE');
        let wins = 0, losses = 0, flats = 0;

        for (const row of emData) {
            const res = simulateTrade(row, 'SWING', 2);
            if (res === null) continue;
            if (res > 0) wins++;
            else if (res < 0) losses++;
            else flats++;
        }
        const total = wins + losses + flats;
        if (total === 0) continue;

        const wr = (wins / total) * 100;
        const ev = ((wins / total) * 2) - ((losses / total) * 1);

        reportStr += `| ${em} | ${total} | ${wr.toFixed(1)}% | ${ev > 0 ? '+' : ''}${ev.toFixed(2)}R |\n`;
        console.log(`${em.padEnd(12)} | Sample: ${String(total).padEnd(4)} | WR: ${wr.toFixed(1)}% | Expected Value: ${ev > 0 ? '+' : ''}${ev.toFixed(2)}R`);

        if (ev > bestEntryEV && total > 20) {
            bestEntryEV = ev;
            bestEntryMethod = em;
        }
    }

    // ----------------------------------------------------------------
    // TABLE 2: OPTIMAL R:R (using best Entry Method, ATR vs Swing Stops)
    // ----------------------------------------------------------------
    reportStr += `\n## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: ${bestEntryMethod})\n\n`;
    console.log(`\n--- TABLE 2: OPTIMAL RISK/REWARD (Using Entry: ${bestEntryMethod}) ---`);
    const bestEmData = catData.filter(d => d.entry_method === bestEntryMethod && d.entry_active === 'TRUE');

    let bestRRCombo = { stop: 'SWING', rr: 2, ev: -999 };

    for (const stopType of ['SWING', 'ATR']) {
        reportStr += `### Stop Type: ${stopType}\n\n`;
        reportStr += `| R:R Ratio | Win Rate | Expected Value |\n`;
        reportStr += `|---|---|---|\n`;
        console.log(`\n  Stop Type: ${stopType}`);
        for (const rr of [1, 2, 3, 4]) {
            let wins = 0, losses = 0, flats = 0;
            for (const row of bestEmData) {
                const res = simulateTrade(row, stopType, rr);
                if (res === null) continue;
                if (res > 0) wins++;
                else if (res < 0) losses++;
                else flats++;
            }
            const total = wins + losses + flats;
            if (total === 0) continue;

            const wr = (wins / total) * 100;
            const ev = ((wins / total) * rr) - ((losses / total) * 1);

            reportStr += `| 1:${rr} | ${wr.toFixed(1)}% | ${ev > 0 ? '+' : ''}${ev.toFixed(2)}R |\n`;
            console.log(`  1:${rr} R:R     | WR: ${wr.toFixed(1)}% | EV: ${ev > 0 ? '+' : ''}${ev.toFixed(2)}R`);

            if (ev > bestRRCombo.ev) {
                bestRRCombo = { stop: stopType, rr: rr, ev: ev, baseWR: wr };
            }
        }
    }

    // ----------------------------------------------------------------
    // TABLE 4: OPTIMAL HOLDING PERIOD 
    // ----------------------------------------------------------------
    reportStr += `\n## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: ${bestEntryMethod})\n\n`;
    console.log(`\n--- TABLE 4: OPTIMAL HOLDING PERIOD (Entry: ${bestEntryMethod}) ---`);
    let holdStats = { 1: { sum: 0, c: 0 }, 3: { sum: 0, c: 0 }, 5: { sum: 0, c: 0 }, 10: { sum: 0, c: 0 } };

    for (const row of bestEmData) {
        if (row.hold1_pct !== '') { holdStats[1].sum += parseFloat(row.hold1_pct); holdStats[1].c++; }
        if (row.hold3_pct !== '') { holdStats[3].sum += parseFloat(row.hold3_pct); holdStats[3].c++; }
        if (row.hold5_pct !== '') { holdStats[5].sum += parseFloat(row.hold5_pct); holdStats[5].c++; }
        if (row.hold10_pct !== '') { holdStats[10].sum += parseFloat(row.hold10_pct); holdStats[10].c++; }
    }

    reportStr += `| Day | Avg M2M Return |\n`;
    reportStr += `|---|---|\n`;
    for (const d of [1, 3, 5, 10]) {
        if (holdStats[d].c > 0) {
            const avg = holdStats[d].sum / holdStats[d].c;
            reportStr += `| Day ${d} | ${avg > 0 ? '+' : ''}${avg.toFixed(2)}% |\n`;
            console.log(`  Day ${d} Avg M2M Return: ${avg > 0 ? '+' : ''}${avg.toFixed(2)}%`);
        }
    }

    // ----------------------------------------------------------------
    // TABLE 1: FACTOR RANKINGS (using optimal parameters)
    // ----------------------------------------------------------------
    reportStr += `\n## TABLE 1: FACTOR RANKINGS BY EDGE\n\n`;
    reportStr += `(Using **${bestEntryMethod}** Entry, **${bestRRCombo.stop}** Stop, **1:${bestRRCombo.rr}** R/R. Baseline EV: **${bestRRCombo.ev > 0 ? '+' : ''}${bestRRCombo.ev.toFixed(2)}R**)\n\n`;
    reportStr += `| Factor | Best Value | EV Edge | EV | Win Rate | Sample |\n`;
    reportStr += `|---|---|---|---|---|---|\n`;

    console.log(`\n--- TABLE 1: FACTOR RANKINGS BY EDGE ---`);
    console.log(`(Using ${bestEntryMethod} Entry, ${bestRRCombo.stop} Stop, 1:${bestRRCombo.rr} R/R. Baseline EV: ${bestRRCombo.ev > 0 ? '+' : ''}${bestRRCombo.ev.toFixed(2)}R)`);

    const factorCols = [
        'NR7', 'NR4', 'INSIDER', 'INSIDER_NR7', 'VCP_SCORE', 'ATR_CONTRACT',
        'BO_N_DAY', 'TOUCH_COUNT', 'LEVEL_AGE', 'RSI2', 'RSI2_CUM', 'STOCH_RSI',
        'MACD_HIST', 'MACD_HIST_SLOPE', 'VOL_BUILDUP', 'ACCUM', 'BO_VOL_RATIO',
        'D_EMA20', 'D_EMA50', 'D_EMA200', 'D_STACK', 'PS_GAP', 'W_EMA20'
    ];

    const factorRankings = [];

    for (const factor of factorCols) {
        const groups = {};

        for (const row of bestEmData) {
            let val = row[factor];
            if (val === '' || val === 'NULL') continue;

            const res = simulateTrade(row, bestRRCombo.stop, bestRRCombo.rr);
            if (res === null) continue;

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

            if (!groups[val]) groups[val] = { wins: 0, losses: 0, total: 0 };
            groups[val].total++;
            if (res > 0) groups[val].wins++;
            else if (res < 0) groups[val].losses++;
        }

        let maxEV = -999;
        let minEV = 999;
        let bestCond = null;

        for (const [key, stats] of Object.entries(groups)) {
            if (stats.total < 15) continue; // Noise filter
            const ev = ((stats.wins / stats.total) * bestRRCombo.rr) - ((stats.losses / stats.total) * 1);
            if (ev > maxEV) { maxEV = ev; bestCond = { val: key, ev: ev, wr: (stats.wins / stats.total) * 100, sample: stats.total }; }
            if (ev < minEV) { minEV = ev; }
        }

        if (bestCond) { // Removing the > 0.05 R threshold to see all factors
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

    for (const r of factorRankings) { // Removing .slice(0, 10)
        reportStr += `| ${r.factor} | ${r.bestValue} | +${r.edgeEV.toFixed(2)}R | ${r.ev > 0 ? '+' : ''}${r.ev.toFixed(2)}R | ${r.wr.toFixed(1)}% | ${r.sample} |\n`;
        console.log(`${r.factor.padEnd(16)} | Best = ${String(r.bestValue).padEnd(14)} | EV Edge: +${r.edgeEV.toFixed(2)}R | EV: +${r.ev.toFixed(2)}R | WR: ${r.wr.toFixed(1)}% (${r.sample})`);
    }

    // ----------------------------------------------------------------
    // TABLE 5: BEST COMBINATIONS (2-Factor)
    // ----------------------------------------------------------------
    reportStr += `\n## TABLE 5: BEST "GOLDEN" COMBINATIONS\n\n`;
    reportStr += `| Golden Combination Rules | Expected Value | Win Rate | Sample |\n`;
    reportStr += `|---|---|---|---|\n`;

    console.log(`\n--- TABLE 5: BEST "GOLDEN" COMBINATIONS ---`);
    const topFactors = factorRankings.slice(0, 8).map(r => ({ name: r.factor, bestVal: r.bestValue }));
    const combos = getCombinations(topFactors, 2);

    const comboResults = [];

    for (const combo of combos) {
        let wins = 0, losses = 0, total = 0;

        for (const row of bestEmData) {
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
                const res = simulateTrade(row, bestRRCombo.stop, bestRRCombo.rr);
                if (res !== null) {
                    total++;
                    if (res > 0) wins++;
                    else if (res < 0) losses++;
                }
            }
        }

        if (total >= 10) {
            const ev = ((wins / total) * bestRRCombo.rr) - ((losses / total) * 1);
            if (ev > bestRRCombo.ev + 0.1) {
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
    for (const res of comboResults.slice(0, 10)) {
        reportStr += `| ${res.name} | +${res.ev.toFixed(2)}R | ${res.wr.toFixed(1)}% | ${res.sample} |\n`;
        console.log(`[EV: +${res.ev.toFixed(2)}R] ${res.name.padEnd(45)} | WR: ${res.wr.toFixed(1)}% | Sample: ${res.sample}`);
    }

    const reportPath = path.join(__dirname, `report_${targetCategory}.md`);
    fs.writeFileSync(reportPath, reportStr, 'utf8');
    console.log(`\nReport successfully written to ${reportPath}`);
}

// Pass category from CLI args or default to Multi Resistance
const catTarget = process.argv[2] || 'MULTI_RESISTANCE_BO';
analyzeCategory(catTarget);
