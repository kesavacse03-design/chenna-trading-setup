/**
 * RAW OUTCOME ANALYSIS — LOM (Level of Momentum)
 * 
 * Purpose: Determine if UPSIDE/DOWNSIDE LOM is Intraday or Swing.
 * Method: Analyze Day 0 Move vs Day 1-5 Continuation.
 */

const path = require('path');
const fs = require('fs');

// Config
const DATA_FILE = path.join(__dirname, '..', 'results', 'lom_data.json');
const REPORT_FILE = path.join(__dirname, '..', 'results', 'lom_raw_analysis.md');

const round2 = (v) => Math.round(v * 100) / 100;

async function main() {
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  RAW OUTCOME ANALYSIS - LOM STRATEGIES');
    console.log('══════════════════════════════════════════════════════════════════════');

    if (!fs.existsSync(DATA_FILE)) {
        console.error(`Data file not found: ${DATA_FILE}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const categories = Object.keys(data);

    let md = '# RAW OUTCOME ANALYSIS: LOM STRATEGIES (Intraday vs Swing)\n\n';

    for (const category of categories) {
        console.log(`Analyzing ${category}...`);

        const stocks = data[category];
        const symbols = Object.keys(stocks);
        const metrics = [];

        for (const symbol of symbols) {
            const stock = stocks[symbol];
            const daily = (stock.daily || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // Find Signal Index
            const signalDateStr = new Date(stock.addedDate).toISOString().split('T')[0];
            const signalIdx = daily.findIndex(c => c.timestamp.startsWith(signalDateStr));

            if (signalIdx === -1) continue;

            const day0 = daily[signalIdx];
            const day0Open = day0.open;
            const day0Close = day0.close;
            const day0Move = round2((day0Close - day0Open) / day0Open * 100);

            // Day 1 (Next Day)
            if (signalIdx + 1 >= daily.length) continue;
            const day1 = daily[signalIdx + 1];
            const day1Move = round2((day1.close - day0.close) / day0.close * 100); // From Day 0 Close
            const day1Gap = round2((day1.open - day0.close) / day0.close * 100);

            // Day 1 Open to Day 5 Close (Swing Potential)
            const day1Open = day1.open;
            const futureEndIdx = Math.min(daily.length, signalIdx + 6); // Day 1 to Day 5
            const future = daily.slice(signalIdx + 1, futureEndIdx);

            let maxUp = 0, maxDown = 0;
            if (future.length > 0) {
                const maxHigh = Math.max(...future.map(c => c.high));
                const minLow = Math.min(...future.map(c => c.low));
                maxUp = round2((maxHigh - day1Open) / day1Open * 100);
                maxDown = round2((minLow - day1Open) / day1Open * 100);
            }

            metrics.push({
                symbol,
                day0Move,
                day1Gap,
                day1Move,
                maxUp,
                maxDown
            });
        }

        // Aggregate
        if (metrics.length === 0) continue;

        const avgDay0 = round2(metrics.reduce((s, m) => s + m.day0Move, 0) / metrics.length);
        const avgDay1Gap = round2(metrics.reduce((s, m) => s + m.day1Gap, 0) / metrics.length);
        const avgDay1Move = round2(metrics.reduce((s, m) => s + m.day1Move, 0) / metrics.length);
        const avgMaxUp = round2(metrics.reduce((s, m) => s + m.maxUp, 0) / metrics.length);
        const avgMaxDown = round2(metrics.reduce((s, m) => s + m.maxDown, 0) / metrics.length);

        md += `## ${category}\n`;
        md += `**Sample:** ${metrics.length} stocks\n\n`;

        md += `### Intraday Strength (Day 0)\n`;
        md += `- **Avg Day 0 Move:** ${avgDay0}% (Open to Close)\n`;
        md += `  - This confirms if the signal captures a big move on the day itself.\n\n`;

        md += `### Swing Follow-Through (Day 1 - 5)\n`;
        md += `- **Avg Gap Up/Down (Day 1):** ${avgDay1Gap}%\n`;
        md += `- **Avg Day 1 Move:** ${avgDay1Move}% (From Prev Close)\n`;
        md += `- **Max Up (5 Days):** ${avgMaxUp}%\n`;
        md += `- **Max Down (5 Days):** ${avgMaxDown}%\n\n`;

        let verdict = 'UNCLEAR';
        if (Math.abs(avgDay0) > 2.0 && Math.abs(avgDay1Move) < 1.0) verdict = 'INTRADAY ONLY ⚡';
        else if (Math.abs(avgMaxUp) > 4.0 || Math.abs(avgMaxDown) < -4.0) verdict = 'SWING CANDIDATE 🌊';

        md += `### 🧠 PRELIMINARY VERDICT: **${verdict}**\n\n`;

        md += `| Symbol | Day 0 Move | Day 1 Gap | Day 1 Move | Max Up 5d | Max Down 5d |\n`;
        md += `|---|---|---|---|---|---|\n`;
        metrics.slice(0, 10).forEach(m => {
            md += `| ${m.symbol} | ${m.day0Move}% | ${m.day1Gap}% | ${m.day1Move}% | ${m.maxUp}% | ${m.maxDown}% |\n`;
        });
        md += '\n---\n\n';
    }

    fs.writeFileSync(REPORT_FILE, md);
    console.log(`Saved Report: ${REPORT_FILE}`);
}

main().catch(console.error);
