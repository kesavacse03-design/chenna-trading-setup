// Recovery script: Import stocks from localStorage backup JSON into database
// Usage: 
// 1. Copy the JSON array from localStorage (cts_stocks or backup key)
// 2. Save it to a file called "backup_data.json" in this scripts folder
// 3. Run: node scripts/recover_from_backup.cjs

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function recoverFromBackup() {
    const prisma = new PrismaClient();

    try {
        // Read backup file
        const backupPath = path.join(__dirname, 'backup_data.json');

        if (!fs.existsSync(backupPath)) {
            console.log('=== LocalStorage Recovery Tool ===');
            console.log('');
            console.log('To recover your stocks:');
            console.log('1. In browser DevTools (F12) → Application → Local Storage');
            console.log('2. Click on "cts_stocks" or any backup key');
            console.log('3. Copy the entire value (right-click → Copy value)');
            console.log('4. Create file: scripts/backup_data.json');
            console.log('5. Paste the copied value into that file');
            console.log('6. Run this script again');
            console.log('');
            console.log(`Expected file: ${backupPath}`);
            return;
        }

        const rawData = fs.readFileSync(backupPath, 'utf8');
        const stocks = JSON.parse(rawData);

        if (!Array.isArray(stocks)) {
            console.log('Error: Expected JSON array of stocks');
            return;
        }

        console.log(`\n=== Recovery Started ===`);
        console.log(`Found ${stocks.length} stocks in backup`);

        // Analyze what's in the backup
        const categoryCount = {};
        const dateCount = {};

        stocks.forEach(s => {
            const cat = s.categoryKey || s.category || s.categoryRaw || 'UNKNOWN';
            const date = (s.date || '').slice(0, 7); // YYYY-MM
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
            if (date) dateCount[date] = (dateCount[date] || 0) + 1;
        });

        console.log('\nStocks by category:');
        Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])
            .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`));

        console.log('\nStocks by month:');
        Object.entries(dateCount)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .forEach(([month, count]) => console.log(`  ${month}: ${count}`));

        // Check for January 2026 specifically
        const jan2026 = stocks.filter(s => (s.date || '').startsWith('2026-01'));
        console.log(`\n🔍 January 2026 stocks in backup: ${jan2026.length}`);

        if (jan2026.length > 0) {
            console.log('January 2026 symbols:', jan2026.map(s => s.stockName || s.symbol).slice(0, 20).join(', '));
        }

        // Ask for confirmation
        console.log('\n⚠️  To actually import this data to database, run:');
        console.log('    node scripts/recover_from_backup.cjs --import');

        // Check if --import flag is passed
        if (process.argv.includes('--import')) {
            console.log('\n=== Importing to Database ===');

            let imported = 0;
            let skipped = 0;
            let errors = 0;

            for (const s of stocks) {
                const symbol = (s.stockName || s.symbol || '').toUpperCase().trim();
                const categoryKey = s.categoryKey || s.category || s.categoryRaw || '';
                const date = s.date || null;

                if (!symbol || !categoryKey) {
                    skipped++;
                    continue;
                }

                try {
                    // Find or create stock
                    let stock = await prisma.stock.findFirst({ where: { symbol } });
                    if (!stock) {
                        stock = await prisma.stock.create({
                            data: {
                                symbol,
                                name: s.name || symbol,
                                exchange: s.exchange || 'NSE',
                                instrumentKey: s.instrument_token || null
                            }
                        });
                    }

                    // Find category
                    let category = await prisma.category.findFirst({ where: { key: categoryKey } });
                    if (!category) {
                        // Try normalized version
                        const normalized = categoryKey.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/__+/g, '_');
                        category = await prisma.category.findFirst({ where: { key: normalized } });
                    }

                    if (!category) {
                        console.log(`  ⚠️ Category not found: ${categoryKey} (stock: ${symbol})`);
                        skipped++;
                        continue;
                    }

                    // Parse date
                    let addedDate = null;
                    if (date) {
                        const parsed = new Date(date);
                        if (!isNaN(parsed.getTime())) {
                            addedDate = parsed;
                        }
                    }

                    // Check if already exists
                    const existing = await prisma.stockCategory.findFirst({
                        where: {
                            stockId: stock.id,
                            categoryId: category.id,
                            addedDate: addedDate
                        }
                    });

                    if (existing) {
                        skipped++;
                        continue;
                    }

                    // Create stock-category entry
                    await prisma.stockCategory.create({
                        data: {
                            stockId: stock.id,
                            categoryId: category.id,
                            addedDate: addedDate,
                            sector: s.sector || null
                        }
                    });

                    imported++;
                    if (imported % 50 === 0) {
                        console.log(`  Imported ${imported} stocks...`);
                    }

                } catch (err) {
                    errors++;
                    if (errors <= 5) {
                        console.log(`  ❌ Error importing ${symbol}: ${err.message}`);
                    }
                }
            }

            console.log('\n=== Import Complete ===');
            console.log(`✅ Imported: ${imported}`);
            console.log(`⏭️ Skipped (duplicates/missing category): ${skipped}`);
            console.log(`❌ Errors: ${errors}`);
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

recoverFromBackup();
