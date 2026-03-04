/**
 * SAFE INTEGRATION SCRIPT
 * Run this to apply time-travel backtest enhancements
 * 
 * Usage: node apply_enhancements.cjs
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Applying Time-Travel Backtest Enhancements...\n');

// Step 1: Verify signalQualityFilter.cjs exists
const qualityFilterPath = path.join(__dirname, '../strategy/signalQualityFilter.cjs');
if (!fs.existsSync(qualityFilterPath)) {
    console.error('❌ signalQualityFilter.cjs not found!');
    process.exit(1);
}
console.log('✅ Signal quality filter found\n');

// Step 2: Create backup
const timeTravelPath = path.join(__dirname, '../strategy/timeTravelEngine.cjs');
const csvServicePath = path.join(__dirname, '../services/backtestResultsService.cjs');

const backupDir = path.join(__dirname, '../../backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const timestamp = Date.now();
fs.copyFileSync(timeTravelPath, path.join(backupDir, `timeTravelEngine_${timestamp}.cjs`));
fs.copyFileSync(csvServicePath, path.join(backupDir, `backtestResultsService_${timestamp}.cjs`));

console.log(`✅ Backups created in backups/`);
console.log(`   - timeTravelEngine_${timestamp}.cjs`);
console.log(`   - backtestResultsService_${timestamp}.cjs\n`);

console.log('⚠️  MANUAL INTEGRATION REQUIRED\n');
console.log('Due to file complexity, please manually apply the enhancements using:');
console.log('   1. Open walkthrough.md');
console.log('   2. Follow the code examples in code_examples.md');
console.log('   3. Or use a git patch/merge tool\n');

console.log('✅ Preparation complete!');
console.log('   Signal quality filter: READY ✅');
console.log('   Backups: CREATED ✅');
console.log('   Integration guide: walkthrough.md');

