/**
 * CHENNA TRADING SYSTEM - FULL BACKUP
 * Creates a timestamped backup of database and critical files
 * Run: node scripts/backup_system.cjs
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function createBackup() {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const backupDir = path.join(__dirname, `../backups/backup_${timestamp}`);

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║     CHENNA TRADING SYSTEM - FULL BACKUP                 ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.log(`📁 Backup directory: ${backupDir}\n`);

    // Create backup directory
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    // 1. Export Categories
    console.log('📊 Exporting Categories...');
    const categories = await prisma.category.findMany();
    fs.writeFileSync(
        path.join(backupDir, 'categories.json'),
        JSON.stringify(categories, null, 2)
    );
    console.log(`   ✅ ${categories.length} categories exported`);

    // 2. Export Stocks
    console.log('📊 Exporting Stocks...');
    const stocks = await prisma.stock.findMany({
        include: { categories: true }
    });
    fs.writeFileSync(
        path.join(backupDir, 'stocks.json'),
        JSON.stringify(stocks, null, 2)
    );
    console.log(`   ✅ ${stocks.length} stocks exported`);

    // 3. Export Stock Categories (relationships)
    console.log('📊 Exporting Stock-Category relationships...');
    const stockCategories = await prisma.stockCategory.findMany();
    fs.writeFileSync(
        path.join(backupDir, 'stock_categories.json'),
        JSON.stringify(stockCategories, null, 2)
    );
    console.log(`   ✅ ${stockCategories.length} relationships exported`);

    // 4. Export Labs Runs
    console.log('🔬 Exporting Labs Runs...');
    const labsRuns = await prisma.labsRun.findMany();
    fs.writeFileSync(
        path.join(backupDir, 'labs_runs.json'),
        JSON.stringify(labsRuns, null, 2)
    );
    console.log(`   ✅ ${labsRuns.length} labs runs exported`);

    // 5. Export Strategy Versions
    console.log('📈 Exporting Strategy Versions...');
    const strategies = await prisma.strategyVersion.findMany();
    fs.writeFileSync(
        path.join(backupDir, 'strategy_versions.json'),
        JSON.stringify(strategies, null, 2)
    );
    console.log(`   ✅ ${strategies.length} strategies exported`);

    // 6. Export Signals
    console.log('🎯 Exporting Signals...');
    const signals = await prisma.signal.findMany();
    fs.writeFileSync(
        path.join(backupDir, 'signals.json'),
        JSON.stringify(signals, null, 2)
    );
    console.log(`   ✅ ${signals.length} signals exported`);

    // 7. Export Backtest Results
    console.log('🧪 Exporting Backtest Results...');
    const backtests = await prisma.backtestResult.findMany();
    fs.writeFileSync(
        path.join(backupDir, 'backtest_results.json'),
        JSON.stringify(backtests, null, 2)
    );
    console.log(`   ✅ ${backtests.length} backtest results exported`);

    // 8. Copy Prisma Schema
    console.log('📋 Backing up Prisma Schema...');
    const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
    if (fs.existsSync(schemaPath)) {
        fs.copyFileSync(schemaPath, path.join(backupDir, 'schema.prisma'));
        console.log('   ✅ schema.prisma backed up');
    }

    // 9. Create manifest
    const manifest = {
        createdAt: new Date().toISOString(),
        version: '1.0',
        stats: {
            categories: categories.length,
            stocks: stocks.length,
            stockCategories: stockCategories.length,
            labsRuns: labsRuns.length,
            strategies: strategies.length,
            signals: signals.length,
            backtests: backtests.length
        },
        files: fs.readdirSync(backupDir)
    };
    fs.writeFileSync(
        path.join(backupDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    await prisma.$disconnect();

    console.log('\n' + '─'.repeat(50));
    console.log('\n✅ BACKUP COMPLETE!\n');
    console.log(`📁 Location: ${backupDir}`);
    console.log(`📄 Files: ${manifest.files.length}`);
    console.log('\n📊 Summary:');
    console.log(`   Categories: ${categories.length}`);
    console.log(`   Stocks: ${stocks.length}`);
    console.log(`   Stock-Category links: ${stockCategories.length}`);
    console.log(`   Labs Runs: ${labsRuns.length}`);
    console.log(`   Strategies: ${strategies.length}`);
    console.log(`   Signals: ${signals.length}`);
    console.log(`   Backtests: ${backtests.length}`);
    console.log('\n💡 To restore, run: node scripts/restore_backup.cjs <backup_folder>\n');

    return backupDir;
}

createBackup().catch(e => {
    console.error('Backup failed:', e);
    process.exit(1);
});
