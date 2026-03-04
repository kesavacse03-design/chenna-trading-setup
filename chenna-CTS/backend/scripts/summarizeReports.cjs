const fs = require('fs');
const path = require('path');

const reports = [
    'report_MULTI_SUPPORT_BO.md',
    'report_UPSIDE_LOM_INTRA.md',
    'report_DOWNSIDE_LOM_INTRA.md',
    'report_UPSIDE_LOM_SWING.md',
    'report_DOWNSIDE_LOM_SWING.md',
    'report_SHORT_TERM_SWING_BO_UP.md',
    'report_LONG_TERM_SWING_BO_UP.md',
    'report_LONG_TERM_SWING_BO_DOWN.md'
];

let outStr = `# ROUND 3: 90-Day Category Findings Summary\n\n`;
outStr += `*Based on 90-day multi-permutation factor analysis.*\n\n`;

for (const report of reports) {
    const p = path.join(__dirname, report);
    if (!fs.existsSync(p)) continue;

    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');

    const catName = report.replace('report_', '').replace('.md', '');
    outStr += `## ${catName}\n`;

    // Sample size
    const sampleLine = lines.find(l => l.includes('Setups:'));
    let sample = 'Unknown';
    if (sampleLine) {
        const match = sampleLine.match(/Setups: (\d+)/);
        if (match) sample = match[1];
    }

    // Optimal Hold
    const holdTitleIdx = lines.findIndex(l => l.includes('OPTIMAL HOLDING PERIOD'));
    let bestHold = '';
    if (holdTitleIdx > -1) {
        let maxM2m = -999;
        for (let i = holdTitleIdx + 4; i < holdTitleIdx + 10; i++) {
            if (!lines[i] || !lines[i].includes('|')) break;
            const parts = lines[i].split('|');
            if (parts.length > 2) {
                const day = parts[1].trim();
                const v = parseFloat(parts[2].replace('%', '').trim());
                if (v > maxM2m) { maxM2m = v; bestHold = `${day} (+${maxM2m}%)`; }
            }
        }
    }

    // Best Factor (Table 1)
    const factorTitleIdx = lines.findIndex(l => l.includes('FACTOR RANKINGS BY EDGE'));
    let bestFactor = '';
    let optRR = '1:1'; // Default baseline shown in factor table header usually

    if (factorTitleIdx > -1) {
        // usually line + 2 has the header
        for (let i = factorTitleIdx + 4; i < lines.length; i++) {
            if (lines[i].trim() && lines[i].includes('|') && !lines[i].includes('---')) {
                bestFactor = lines[i];
                break;
            }
        }
    }

    // Optimal R:R (Table 2)
    const rrTitleIdx = lines.findIndex(l => l.includes('OPTIONAL RISK/REWARD') || l.includes('OPTIMAL RISK/REWARD'));
    let bestRRLine = '';
    if (rrTitleIdx > -1) {
        let maxEv = -999;
        for (let i = rrTitleIdx + 1; i < factorTitleIdx; i++) {
            if (!lines[i] || !lines[i].includes('|')) continue;
            const parts = lines[i].split('|');
            if (parts.length > 3 && parts[1].includes(':')) {
                const evStr = parts[3].replace('R', '').trim();
                const ev = parseFloat(evStr);
                if (ev > maxEv && !isNaN(ev)) { maxEv = ev; bestRRLine = lines[i]; optRR = parts[1].trim(); }
            }
        }
    }

    // Best Combo (Table 5)
    const comboTitleIdx = lines.findIndex(l => l.includes('BEST "GOLDEN" COMBINATIONS') || l.includes('BEST ON-ENTRY COMBINATIONS'));
    let bestCombo = '';
    if (comboTitleIdx > -1) {
        for (let i = comboTitleIdx + 4; i < lines.length; i++) {
            if (lines[i].trim() && lines[i].includes('|') && !lines[i].includes('---')) {
                bestCombo = lines[i];
                break;
            }
        }
    }

    outStr += `- **Sample Size:** ${sample} setups ${parseInt(sample) < 30 ? '⚠️ INSUFFICIENT' : ''}\n`;
    outStr += `- **Optimal Holding Period:** ${bestHold || 'N/A'}\n`;
    outStr += `- **Optimal R:R:** ${optRR} -> ${bestRRLine ? bestRRLine.split('|')[3].trim() : 'N/A'}\n`;
    outStr += `- **Best Single Factor:**\n  ${bestFactor}\n`;
    outStr += `- **Best Golden Combo:**\n  ${bestCombo}\n\n`;
}

const outArtifact = path.join(__dirname, '../../../C:/Users/chenn/.gemini/antigravity/brain/36d9a923-aa8a-4144-94da-dfb7aa92dcb0/round3_findings.md');
fs.writeFileSync('round3_findings.md', outStr, 'utf8');
console.log('Artifact created at round3_findings.md');
