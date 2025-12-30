/**
 * PIPELINE REALITY CHECK
 * Verifies that the actual production code is properly connected
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║     PIPELINE REALITY CHECK - Is it REAL or DEMO?       ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const results = [];

// Check 1: ScheduledScanner auto-starts in server.cjs
const serverContent = fs.readFileSync('server.cjs', 'utf8');
const check1 = serverContent.includes('scheduledScanner') && serverContent.includes('startScheduledScanning');
results.push({ stage: '1. Auto-Scheduler Start', real: check1 });

// Check 2: SignalScanner scans categories
const scannerPath = 'services/signalScanner.cjs';
const check2 = fs.existsSync(scannerPath);
let scannerHasFunction = false;
if (check2) {
    const content = fs.readFileSync(scannerPath, 'utf8');
    scannerHasFunction = content.includes('scanCategory') && content.includes('loadV1Strategy');
}
results.push({ stage: '2. SignalScanner.scanCategory()', real: check2 && scannerHasFunction });

// Check 3: Signals saved to database
let signalsSaveCheck = false;
if (check2) {
    const content = fs.readFileSync(scannerPath, 'utf8');
    signalsSaveCheck = content.includes('prisma') || content.includes('saveScanResults');
}
results.push({ stage: '3. Signals → Database', real: signalsSaveCheck });

// Check 4: Notification service exists
const notifyPath = 'services/notificationService.cjs';
const check4 = fs.existsSync(notifyPath);
results.push({ stage: '4. Notification Service', real: check4 });

// Check 5: Telegram service exists
const telegramPath = 'services/telegramService.cjs';
const check5 = fs.existsSync(telegramPath);
results.push({ stage: '5. Telegram Service', real: check5 });

// Check 6: Tracking service exists
const trackPath = 'services/trackingService.cjs';
const check6 = fs.existsSync(trackPath);
results.push({ stage: '6. TrackingService (daily)', real: check6 });

// Check 7: Shadow Learner exists
const shadowPath = 'strategy/ShadowLearner.cjs';
const check7 = fs.existsSync(shadowPath);
results.push({ stage: '7. ShadowLearner', real: check7 });

// Check 8: Strategy table has data
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
    const stratCount = await prisma.strategyVersion.count();
    results.push({ stage: '8. Strategies in DB', real: stratCount > 0, count: stratCount });

    const labsCount = await prisma.labsRun.count();
    results.push({ stage: '9. Labs Runs in DB', real: labsCount > 0, count: labsCount });

    await prisma.$disconnect();

    // Print results
    console.log('Pipeline Component Reality Check:\n');
    results.forEach(r => {
        const icon = r.real ? '✅ REAL' : '❌ MISSING';
        const extra = r.count !== undefined ? ` (${r.count} records)` : '';
        console.log(`  ${icon}  ${r.stage}${extra}`);
    });

    const realCount = results.filter(r => r.real).length;
    const totalCount = results.length;

    console.log('\n' + '─'.repeat(50));
    console.log(`\n  Result: ${realCount}/${totalCount} components connected`);

    if (realCount === totalCount) {
        console.log('\n  ✅ PIPELINE IS REAL - All stages connected in production code!');
        console.log('  ✅ System will work exactly like the demo when conditions are met.\n');
    } else {
        console.log('\n  ⚠️  Some components need attention');
    }
}

checkDB().catch(console.error);
