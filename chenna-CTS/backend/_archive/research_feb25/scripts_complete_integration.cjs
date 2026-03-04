/**
 * COMPLETE INTEGRATION SCRIPT V2
 * Applies remaining enhancements with better pattern matching
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Completing Integration (V2)...\n');

const enginePath = path.join(__dirname, '../strategy/timeTravelEngine.cjs');
let code = fs.readFileSync(enginePath, 'utf8');

// Check what's already done
const hasDetectReversal = code.includes('detectReversal(currentCandle');
const hasQualityFilter = code.includes('SignalQualityFilter');

console.log('Current status:');
console.log(`  ${hasDetectReversal ? '✅' : '❌'} detectReversal method`);
console.log(`  ${hasQualityFilter ? '✅' : '❌'} SignalQualityFilter integration\n`);

if (!hasQualityFilter) {
    console.log('📝 Adding SignalQualityFilter integration...');

    // Find the trap detection section and add quality filter after it
    const trapPattern = /if \(trapScan\.recommendation === "AVOID"\) \{[\s\S]*?return \{[\s\S]*?trapsDetected: trapScan\.trapsDetected[\s\S]*?\};[\s\S]*?\}[\s\S]*?\/\/ STEP 5: Enter trade/;

    if (trapPattern.test(code)) {
        code = code.replace(
            trapPattern,
            match => {
                return match.replace(
                    '        // STEP 5: Enter trade',
                    `        // STEP 4B: Signal Quality Filter (Top 1% only)
        const SignalQualityFilter = require('./signalQualityFilter.cjs');
        const qualityScore = SignalQualityFilter.scoreSignal(indicators, availableCandles, { ...context, trapScan });
        
        if (qualityScore < 80) {
            return {
                symbol: stock.symbol,
                logic: logic.name,
                skipped: true,
                reason: \`Low quality score: \${qualityScore.toFixed(1)}/100\`,
                qualityScore: qualityScore
            };
        }

        // STEP 5: Enter trade (high-quality signal)`
                );
            }
        );
        console.log('  ✅ Quality filter added');
    }

    // Update return statement to include new fields
    const returnPattern = /return \{[\s\S]*?symbol: stock\.symbol,[\s\S]*?logic: logic\.name,[\s\S]*?entry,[\s\S]*?exit: outcome\.exit,[\s\S]*?pnl: outcome\.pnl,[\s\S]*?mae: outcome\.mae,[\s\S]*?mfe: outcome\.mfe,[\s\S]*?holdingDays: outcome\.holdingDays,[\s\S]*?exitReason: outcome\.exitReason,[\s\S]*?trapAvoidance: trapScan\.trapsDetected === 0 \? 1 : 0[\s\S]*?\};/;

    if (returnPattern.test(code) && !code.includes('qualityScore: qualityScore,')) {
        code = code.replace(
            'trapAvoidance: trapScan.trapsDetected === 0 ? 1 : 0\n        };',
            `exitReasonDetail: outcome.exitReasonDetail || '',
            sessionLog: outcome.sessionLog || [],
            qualityScore: qualityScore,
            trapAvoidance: trapScan.trapsDetected === 0 ? 1 : 0
        };`
        );
        console.log('  ✅ Return fields added');
    }
}

// Write the updated code
fs.writeFileSync(enginePath, code);
console.log('\n✅ Integration complete!\n');

// Final verification
const verify = fs.readFileSync(enginePath, 'utf8');
console.log('Final verification:');
console.log(`  ${verify.includes('detectReversal') ? '✅' : '❌'} detectReversal method`);
console.log(`  ${verify.includes('formatDateShort') ? '✅' : '❌'} formatDateShort method`);
console.log(`  ${verify.includes('SignalQualityFilter') ? '✅' : '❌'} SignalQualityFilter integration`);
console.log(`  ${verify.includes('qualityScore: qualityScore') ? '✅' : '❌'} qualityScore field`);
console.log(`  ${verify.includes('sessionLog: outcome.sessionLog') ? '✅' : '❌'} sessionLog field`);
console.log(`  ${verify.includes('maxSessions') ? '✅' : '❌'} maxSessions parameter`);

const allGood = verify.includes('SignalQualityFilter') && verify.includes('qualityScore: qualityScore');
console.log('\n' + '='.repeat(50));
console.log(allGood ? '🎉 ALL ENHANCEMENTS SUCCESSFULLY INTEGRATED!' : '⚠️ Some items may need manual review');
console.log('='.repeat(50));
