import re

# Read the file
with open('src/components/StrategyWorkbenchSimple.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the old function pattern (lines 80-99)
old_function = r'''    // Handle Promote V1
    const handlePromoteV1 = \(\) => \{
        if \(!v1Strategy\) return;

        const rulesText = \[
            `📈 ENTRY: \$\{v1Strategy\.rules\.entry\.logic\}`,
            ``,
            `🎯 EXIT: Target \+\$\{v1Strategy\.rules\.exit\.target\}%, Stop -\$\{v1Strategy\.rules\.exit\.stop\}%`,
            `⚡ RISK: \$\{v1Strategy\.params\?\.positionSizing\?\.riskPerTrade \|\| 1\.5\}% per trade`,
            `📊 ACCURACY: \$\{v1Strategy\.metrics\.accuracy\}`,
            `🛡️ TRAPS: \$\{v1Strategy\.rules\.traps\?\.enabled \? 'ENABLED' : 'DISABLED'\}`
        \]\.join\('\\n'\);

        setEditorLogic\(\{
            description: v1Strategy\.description,
            rules: rulesText\.split\('\\n'\)
        \}\);

        showToast\('✅ V1 Strategy promoted to editor!', 'success'\);
    \};'''

# Define the new function
new_function = '''    // Handle Promote V1
    const handlePromoteV1 = async () => {
        if (!v1Strategy) return;

        try {
            showToast('Promoting V1 strategy...', 'info');
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            const response = await fetch(`${apiBase}/api/categories/${categoryKey}/promote-strategy`, {
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
                    `📈 ENTRY: ${v1Strategy.rules.entry.logic}`,
                    ``,
                    `🎯 EXIT: Target +${v1Strategy.rules.exit.target}%, Stop -${v1Strategy.rules.exit.stop}%`,
                    `⚡ RISK: ${v1Strategy.params?.positionSizing?.riskPerTrade || 1.5}% per trade`,
                    `📊 ACCURACY: ${v1Strategy.metrics.accuracy}`,
                    `🛡️ TRAPS: ${v1Strategy.rules.traps?.enabled ? 'ENABLED' : 'DISABLED'}`
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
    };'''

# Replace
new_content = re.sub(old_function, new_function, content, flags=re.MULTILINE)

# Write back
with open('src/components/StrategyWorkbenchSimple.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✅ Function replaced successfully!")
