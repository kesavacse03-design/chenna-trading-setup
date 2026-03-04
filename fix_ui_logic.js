const fs = require('fs');
const path = 'd:\\chenna-trading-system-dashboard\\src\\components\\TimeTravelBacktestModal.tsx';

try {
    const data = fs.readFileSync(path, 'utf8');
    const lines = data.split('\n');

    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('    // Dynamic Strategy Rules Helper')) {
            startIdx = i;
            break;
        }
    }

    if (startIdx === -1) {
        console.error('Could not find start line');
        process.exit(1);
    }

    let endIdx = -1;
    // Look for the closing ); sequence before Date Range
    for (let i = startIdx; i < lines.length; i++) {
        if (lines[i].includes('                        );') &&
            i + 2 < lines.length &&
            lines[i + 2].includes('{/* Date Range */}')) {
            endIdx = i;
            break;
        }
    }

    // Fallback: relax match
    if (endIdx === -1) {
        for (let i = startIdx; i < lines.length; i++) {
            if (lines[i].trim() === ');' &&
                i + 2 < lines.length &&
                lines[i + 2].includes('Date Range')) {
                endIdx = i;
                break;
            }
        }
    }

    if (endIdx === -1) {
        // Fallback 2: Look for specific line content from view_file
        for (let i = startIdx; i < lines.length; i++) {
            if (lines[i].includes('                        );')) {
                // Check if it looks like the end of the block we saw
                if (lines[i - 1].includes('                        </div>') && lines[i - 2].includes('                            </div>')) {
                    endIdx = i;
                    break;
                }
            }
        }
    }

    if (endIdx === -1) {
        console.error('Could not find end line');
        process.exit(1);
    }

    console.log(`Replacing lines ${startIdx + 1} to ${endIdx + 1}`);

    const newContent = [
        "                        {/* Dynamic Strategy Rules (How Signals Are Generated) */}",
        "                        <div className={`bg-${activeRules.color}-900/20 border border-${activeRules.color}-500/40 rounded-lg p-4`}>",
        "                            <h3 className={`text-sm font-semibold text-${activeRules.color}-400 mb-3`}>",
        "                                {activeRules.title}",
        "                            </h3>",
        "                            <div className=\"text-xs text-slate-300 space-y-2\">",
        "                                {activeRules.rules.map((rule, idx) => (",
        "                                    <div key={idx} className=\"flex items-center gap-2\">",
        "                                        <span className=\"text-lg\">{rule.icon}</span>",
        "                                        <span>{rule.text}</span>",
        "                                    </div>",
        "                                ))}",
        "                            </div>",
        "                        </div>"
    ];

    const finalLines = [
        ...lines.slice(0, startIdx),
        ...newContent,
        ...lines.slice(endIdx + 1)
    ];

    fs.writeFileSync(path, finalLines.join('\n'), 'utf8');
    console.log('Successfully patched file');

} catch (err) {
    console.error(err);
    process.exit(1);
}
