/**
 * CSV Cache Cleaner
 * 
 * Removes fake data from CSV cache:
 * - Weekend entries (Saturday/Sunday)
 * - NSE Holiday entries
 * 
 * RUN THIS BEFORE ANY BACKTEST!
 */

const fs = require('fs').promises;
const path = require('path');
const { isValidTradingDay, NSE_HOLIDAYS } = require('../services/dataValidator.cjs');

async function cleanCSVCache() {
    const csvDir = path.join(__dirname, '../cache/historical');

    console.log('═'.repeat(60));
    console.log('CSV CACHE CLEANER');
    console.log('Removing fake holiday/weekend data from CSV files');
    console.log('═'.repeat(60));

    let files;
    try {
        files = await fs.readdir(csvDir);
        files = files.filter(f => f.endsWith('.csv'));
    } catch (e) {
        console.error('Error reading CSV directory:', e.message);
        return;
    }

    console.log(`\nFound ${files.length} CSV files to clean\n`);

    let totalRemoved = 0;
    let totalKept = 0;
    const removedByReason = {
        SATURDAY: 0,
        SUNDAY: 0,
        NSE_HOLIDAY: 0
    };
    const removedEntries = [];

    for (const file of files) {
        const csvPath = path.join(csvDir, file);
        const content = await fs.readFile(csvPath, 'utf8');
        const lines = content.trim().split('\n');

        if (lines.length < 2) continue;

        const header = lines[0];
        const cleanedLines = [header];
        let fileRemoved = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            const dateStr = line.split(',')[0];
            const validation = isValidTradingDay(dateStr);

            if (validation.valid) {
                cleanedLines.push(line);
                totalKept++;
            } else {
                fileRemoved++;
                totalRemoved++;
                removedByReason[validation.reason] = (removedByReason[validation.reason] || 0) + 1;

                // Log first few removals for visibility
                if (removedEntries.length < 20) {
                    removedEntries.push({
                        file: file.replace('.csv', ''),
                        date: dateStr,
                        reason: validation.reason
                    });
                }
            }
        }

        // Only rewrite if we removed entries
        if (fileRemoved > 0) {
            await fs.writeFile(csvPath, cleanedLines.join('\n'));
            console.log(`[${file}] Removed ${fileRemoved} invalid entries`);
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('CLEANING COMPLETE');
    console.log('═'.repeat(60));
    console.log(`\nTotal entries kept: ${totalKept}`);
    console.log(`Total entries removed: ${totalRemoved}`);
    console.log(`\nRemoved by reason:`);
    console.log(`  Weekend (Saturday): ${removedByReason.SATURDAY || 0}`);
    console.log(`  Weekend (Sunday): ${removedByReason.SUNDAY || 0}`);
    console.log(`  NSE Holidays: ${removedByReason.NSE_HOLIDAY || 0}`);

    if (removedEntries.length > 0) {
        console.log(`\nSample removed entries:`);
        removedEntries.slice(0, 10).forEach(e => {
            console.log(`  ${e.file.padEnd(15)} ${e.date} → ${e.reason}`);
        });
    }

    console.log('\n✅ CSV cache is now clean! Ready for accurate backtests.');
}

// Run if called directly
if (require.main === module) {
    cleanCSVCache()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { cleanCSVCache };
