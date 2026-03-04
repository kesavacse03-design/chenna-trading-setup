/**
 * CHENNA TRADING SYSTEM - RESTORE FROM BACKUP
 * Restores database from a backup folder
 * Run: node scripts/restore_backup.cjs <backup_folder_name>
 * Example: node scripts/restore_backup.cjs backup_20251230
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function restoreBackup(backupFolderName) {
    if (!backupFolderName) {
        console.log('\n❌ Usage: node scripts/restore_backup.cjs <backup_folder_name>');
        console.log('   Example: node scripts/restore_backup.cjs backup_20251230\n');

        // List available backups
        const backupsDir = path.join(__dirname, '../backups');
        if (fs.existsSync(backupsDir)) {
            const backups = fs.readdirSync(backupsDir).filter(f => f.startsWith('backup_'));
            if (backups.length > 0) {
                console.log('📁 Available backups:');
                backups.forEach(b => console.log(`   - ${b}`));
            }
        }
        process.exit(1);
    }

    const backupDir = path.join(__dirname, '../backups', backupFolderName);

    if (!fs.existsSync(backupDir)) {
        console.log(`\n❌ Backup folder not found: ${backupDir}\n`);
        process.exit(1);
    }

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║     CHENNA TRADING SYSTEM - RESTORE FROM BACKUP        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.log(`📁 Restoring from: ${backupDir}\n`);

    // Read manifest
    const manifestPath = path.join(backupDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        console.log(`📋 Backup created: ${manifest.createdAt}`);
        console.log(`📊 Stats: ${JSON.stringify(manifest.stats)}\n`);
    }

    // Confirm before restore
    console.log('⚠️  WARNING: This will REPLACE current data with backup data!');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await new Promise(r => setTimeout(r, 5000));

    // 1. Restore Categories
    console.log('📊 Restoring Categories...');
    const categoriesPath = path.join(backupDir, 'categories.json');
    if (fs.existsSync(categoriesPath)) {
        const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
        for (const cat of categories) {
            await prisma.category.upsert({
                where: { key: cat.key },
                update: { name: cat.name, description: cat.description },
                create: { key: cat.key, name: cat.name, description: cat.description }
            });
        }
        console.log(`   ✅ ${categories.length} categories restored`);
    }

    // 2. Restore Stocks
    console.log('📊 Restoring Stocks...');
    const stocksPath = path.join(backupDir, 'stocks.json');
    if (fs.existsSync(stocksPath)) {
        const stocks = JSON.parse(fs.readFileSync(stocksPath, 'utf8'));
        for (const stock of stocks) {
            await prisma.stock.upsert({
                where: { symbol: stock.symbol },
                update: { name: stock.name, instrumentKey: stock.instrumentKey },
                create: { symbol: stock.symbol, name: stock.name, instrumentKey: stock.instrumentKey }
            });
        }
        console.log(`   ✅ ${stocks.length} stocks restored`);
    }

    // 3. Restore Strategy Versions
    console.log('📈 Restoring Strategy Versions...');
    const strategiesPath = path.join(backupDir, 'strategy_versions.json');
    if (fs.existsSync(strategiesPath)) {
        const strategies = JSON.parse(fs.readFileSync(strategiesPath, 'utf8'));
        // Clear existing and restore
        await prisma.strategyVersion.deleteMany({});
        for (const strat of strategies) {
            await prisma.strategyVersion.create({
                data: {
                    categoryKey: strat.categoryKey,
                    version: strat.version,
                    description: strat.description,
                    rules: strat.rules,
                    params: strat.params,
                    isActive: strat.isActive,
                    isShadow: strat.isShadow
                }
            });
        }
        console.log(`   ✅ ${strategies.length} strategies restored`);
    }

    // 4. Restore Labs Runs
    console.log('🔬 Restoring Labs Runs...');
    const labsPath = path.join(backupDir, 'labs_runs.json');
    if (fs.existsSync(labsPath)) {
        const labsRuns = JSON.parse(fs.readFileSync(labsPath, 'utf8'));
        // Clear existing and restore
        await prisma.labsRun.deleteMany({});
        for (const run of labsRuns) {
            await prisma.labsRun.create({
                data: {
                    categoryKey: run.categoryKey,
                    ttVersion: run.ttVersion,
                    accuracy: run.accuracy,
                    tradesTested: run.tradesTested,
                    entryConditions: run.entryConditions,
                    exitConditions: run.exitConditions,
                    metrics: run.metrics,
                    logicResults: run.logicResults
                }
            });
        }
        console.log(`   ✅ ${labsRuns.length} labs runs restored`);
    }

    // 5. Restore Signals
    console.log('🎯 Restoring Signals...');
    const signalsPath = path.join(backupDir, 'signals.json');
    if (fs.existsSync(signalsPath)) {
        const signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
        await prisma.signal.deleteMany({});
        for (const sig of signals) {
            await prisma.signal.create({
                data: {
                    signalId: sig.signalId,
                    categoryKey: sig.categoryKey,
                    symbol: sig.symbol,
                    direction: sig.direction,
                    entryPrice: sig.entryPrice,
                    targetPrice: sig.targetPrice,
                    stopLoss: sig.stopLoss,
                    aiConfidence: sig.aiConfidence,
                    trackingDays: sig.trackingDays,
                    trackingStatus: sig.trackingStatus,
                    strategyVersion: sig.strategyVersion
                }
            });
        }
        console.log(`   ✅ ${signals.length} signals restored`);
    }

    await prisma.$disconnect();

    console.log('\n' + '─'.repeat(50));
    console.log('\n✅ RESTORE COMPLETE!\n');
    console.log('💡 Restart the backend to apply changes: npm run dev\n');
}

const backupFolder = process.argv[2];
restoreBackup(backupFolder).catch(e => {
    console.error('Restore failed:', e);
    process.exit(1);
});
