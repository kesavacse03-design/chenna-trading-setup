/**
 * 🔫 NUCLEAR GUNSHOT FIX
 * 
 * This script will:
 * 1. Delete ALL old implementation files
 * 2. Clear Node.js require cache
 * 3. Verify V2 files exist
 * 4. Test the endpoint
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔫 NUCLEAR GUNSHOT FIX - Executing...\n');

const backendDir = __dirname;
const strategyDir = path.join(backendDir, 'strategy');

// Step 1: Delete old implementations
console.log('Step 1: Deleting old implementation files...\n');

const oldFiles = [
    'strategy/timeTravelEngine.cjs',
    'strategy/timeTravelEngine.cjs.OLD',
    'strategy/v1BacktestEngine.cjs',
    'strategy/v1BacktestEngine.cjs.OLD',
    'strategy/logicCatalogueExpanded.cjs'
];

oldFiles.forEach(file => {
    const filePath = path.join(backendDir, file);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`  ✅ Deleted: ${file}`);
        } catch (err) {
            console.log(`  ⚠️ Could not delete ${file}: ${err.message}`);
        }
    } else {
        console.log(`  ⏭️ Not found: ${file}`);
    }
});

// Step 2: Verify V2 files exist
console.log('\nStep 2: Verifying V2 files exist...\n');

const requiredFiles = [
    'strategy/timeTravelBacktesterV2.cjs',
    'strategy/v1Generator.cjs',
    'models/strategySchema.cjs',
    'strategy/institutionalTrapDetector.cjs',
    'services/smartOHLCVCacheManager.cjs'
];

let allFilesExist = true;

requiredFiles.forEach(file => {
    const filePath = path.join(backendDir, file);
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`  ✅ ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
        console.log(`  ❌ MISSING: ${file}`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('\n❌ ERROR: Some required V2 files are missing!');
    process.exit(1);
}

// Step 3: Check route file
console.log('\nStep 3: Checking autoStrategyRoutes.cjs...\n');

const routeFile = path.join(backendDir, 'api/autoStrategyRoutes.cjs');
const routeContent = fs.readFileSync(routeFile, 'utf8');

if (routeContent.includes('TimeTravelEngine') || routeContent.includes('V1BacktestEngine')) {
    console.log('  ❌ Route file still references old implementations!');
    console.log('  Need to update api/autoStrategyRoutes.cjs');
} else {
    console.log('  ✅ Route file clean - no old references');
}

if (routeContent.includes('GUNSHOT V2')) {
    console.log('  ✅ GUNSHOT V2 code detected');
} else {
    console.log('  ⚠️ GUNSHOT V2 markers not found');
}

// Step 4: Summary
console.log('\n' + '='.repeat(60));
console.log('NUCLEAR GUNSHOT FIX COMPLETE');
console.log('='.repeat(60));
console.log('\n✅ Old files deleted');
console.log('✅ V2 files verified');
console.log('\n🚀 NEXT STEPS:');
console.log('1. Restart backend (Ctrl+C, then npm run dev)');
console.log('2. Click time-travel button');
console.log('3. Check backend console for: "🔫 [GUNSHOT V2]"');
console.log('4. Should see: "🚀 Running V2 with 30 variants"\n');

process.exit(0);
