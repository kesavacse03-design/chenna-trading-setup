#!/usr/bin/env node
/**
 * Safe script to add AIInsightsPanel to App.tsx
 * This makes exactly 2 precise edits without breaking anything
 */

const fs = require('fs');
const path = require('path');

const APP_FILE = path.join(__dirname, 'src', 'App.tsx');

try {
    // Read the file
    const content = fs.readFileSync(APP_FILE, 'utf8');
    const lines = content.split('\n');

    // Check if already added
    if (content.includes('AIInsightsPanel')) {
        console.log('✅ AIInsightsPanel already added to App.tsx');
        process.exit(0);
    }

    // Edit 1: Add import after line with "import IntelligencePanel"
    let importAdded = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("import IntelligencePanel from './components/StrategyReportsPanel'")) {
            lines.splice(i + 1, 0, "import AIInsightsPanel from './components/AIInsightsPanel';");
            importAdded = true;
            console.log(`✅ Added import at line ${i + 2}`);
            break;
        }
    }

    if (!importAdded) {
        console.error('❌ Could not find import location');
        process.exit(1);
    }

    // Edit 2: Add component in right sidebar (after opening div of lg:col-span-1)
    let componentAdded = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('<div className="lg:col-span-1 space-y-6">')) {
            // Next line should be PortfolioStats, add AIInsightsPanel before it
            if (lines[i + 1] && lines[i + 1].includes('<PortfolioStats')) {
                lines.splice(i + 1, 0, '            <AIInsightsPanel />');
                componentAdded = true;
                console.log(`✅ Added component at line ${i + 2}`);
                break;
            }
        }
    }

    if (!componentAdded) {
        console.error('❌ Could not find component location');
        process.exit(1);
    }

    // Write back the file
    fs.writeFileSync(APP_FILE, lines.join('\n'), 'utf8');
    console.log('\n✅ Successfully added AIInsightsPanel to App.tsx!');
    console.log('\nYou should now see:');
    console.log('  • Market Sentiment (Bullish/Bearish/Neutral)');
    console.log('  • FII/DII flows, VIX, PCR, Global Cues');
    console.log('  • OpenAI token usage & cost tracking');
    console.log('\nRefresh your browser to see the changes.');

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
