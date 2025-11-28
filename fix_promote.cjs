const fs = require('fs');

// Read the file
const content = fs.readFileSync('src/components/StrategyWorkbenchSimple.tsx', 'utf8');

// Find the start and end of the handlePromoteV1 function
const startMarker = '    // Handle Promote V1';
const startIdx = content.indexOf(startMarker);

if (startIdx === -1) {
    console.log('❌ Could not find function start marker');
    process.exit(1);
}

// Find the end of the function (the closing }; after showToast)
const searchFrom = startIdx;
const endMarker = "        showToast('✅ V1 Strategy promoted to editor!', 'success');\r\n    };";
const endIdx = content.indexOf(endMarker, searchFrom);

if (endIdx === -1) {
    console.log('❌ Could not find function end marker');
    process.exit(1);
}

const endPosition = endIdx + endMarker.length;

// Define the new function
const newFunction = `    // Handle Promote V1
    const handlePromoteV1 = async () => {
        if (!v1Strategy) return;

        try {
            showToast('Promoting V1 strategy...', 'info');
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            const response = await fetch(\`\${apiBase}/api/categories/\${categoryKey}/promote-strategy\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strategyId: v1Strategy.id })
            });

            if (!response.ok) {
                throw new Error('Failed to promote strategy');
            }

            const result = await response.json();

            if (result.ok) {
                const rulesText = [
                    \`📈 ENTRY: \${v1Strategy.rules.entry.logic}\`,
                    \`\`,
                    \`🎯 EXIT: Target +\${v1Strategy.rules.exit.target}%, Stop -\${v1Strategy.rules.exit.stop}%\`,
                    \`⚡ RISK: \${v1Strategy.params?.positionSizing?.riskPerTrade || 1.5}% per trade\`,
                    \`📊 ACCURACY: \${v1Strategy.metrics.accuracy}\`,
                    \`🛡️ TRAPS: \${v1Strategy.rules.traps?.enabled ? 'ENABLED' : 'DISABLED'}\`
                ].join('\\n');

                setEditorLogic({
                    description: v1Strategy.description,
                    rules: rulesText.split('\\n')
                });

                showToast('✅ V1 Strategy promoted and saved to database!', 'success');
            } else {
                showToast('❌ Failed to promote strategy', 'error');
            }
        } catch (error) {
            console.error('Error promoting strategy:', error);
            showToast('❌ Error promoting strategy', 'error');
        }
    };`;

// Replace
const newContent = content.substring(0, startIdx) + newFunction + content.substring(endPosition);

// Write back
fs.writeFileSync('src/components/StrategyWorkbenchSimple.tsx', newContent, 'utf8');

console.log('✅ Function replaced successfully!');
console.log(`   Replaced ${endPosition - startIdx} characters with ${newFunction.length} characters`);
