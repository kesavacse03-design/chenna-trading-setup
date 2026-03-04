// Analyze backup file for January 2026 PRE_MARKET data
const fs = require('fs');

const backupPath = process.argv[2] || 'd:/chenna-trading-system-dashboard/cts_backup_recovery.json';

try {
    const raw = fs.readFileSync(backupPath, 'utf8');
    const data = JSON.parse(raw);

    console.log('\n=== LocalStorage Backup Analysis ===');
    console.log(`Keys found: ${Object.keys(data).length}`);
    console.log('\nKeys list:');
    Object.keys(data).forEach(k => {
        const val = data[k];
        const count = Array.isArray(val) ? val.length : (typeof val === 'object' ? Object.keys(val).length : 1);
        console.log(`  ${k}: ${count} items`);
    });

    // Search for January 2026 across ALL keys
    console.log('\n\n=== Searching for January 2026 Data ===');
    let foundJan2026 = false;

    for (const [key, value] of Object.entries(data)) {
        if (!Array.isArray(value)) continue;

        const jan2026Entries = value.filter(item => {
            const date = item.date || item.addedDate || '';
            return date.startsWith('2026-01');
        });

        if (jan2026Entries.length > 0) {
            foundJan2026 = true;
            console.log(`\n✅ Found ${jan2026Entries.length} January 2026 entries in "${key}"`);

            // Group by category
            const byCat = {};
            jan2026Entries.forEach(e => {
                const cat = e.categoryKey || e.category || 'UNKNOWN';
                byCat[cat] = (byCat[cat] || 0) + 1;
            });

            console.log('  By category:');
            Object.entries(byCat).forEach(([cat, count]) => {
                console.log(`    ${cat}: ${count}`);
            });

            // Show PRE_MARKET specifically
            const preMarket = jan2026Entries.filter(e =>
                (e.categoryKey || e.category || '').includes('PRE_MARKET')
            );

            if (preMarket.length > 0) {
                console.log(`\n  🎯 PRE_MARKET stocks (${preMarket.length}):`);
                preMarket.slice(0, 20).forEach(e => {
                    console.log(`    - ${e.stockName || e.symbol}: ${e.date}`);
                });
                if (preMarket.length > 20) {
                    console.log(`    ... and ${preMarket.length - 20} more`);
                }
            }
        }
    }

    if (!foundJan2026) {
        console.log('\n❌ NO January 2026 data found in any backup key');
    }

    // Also search for PRE_MARKET across all dates
    console.log('\n\n=== PRE_MARKET Data Summary ===');
    let allPreMarket = [];

    for (const [key, value] of Object.entries(data)) {
        if (!Array.isArray(value)) continue;

        const preMarket = value.filter(e =>
            (e.categoryKey || e.category || '').includes('PRE_MARKET')
        );

        preMarket.forEach(e => allPreMarket.push({ ...e, sourceKey: key }));
    }

    console.log(`Total PRE_MARKET entries across all backups: ${allPreMarket.length}`);

    // Group by date
    const byDate = {};
    allPreMarket.forEach(e => {
        const d = (e.date || '').slice(0, 10) || 'NO_DATE';
        byDate[d] = (byDate[d] || 0) + 1;
    });

    console.log('\nPRE_MARKET entries by date:');
    Object.entries(byDate)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 30)
        .forEach(([date, count]) => {
            const marker = date.startsWith('2026-01') ? ' ⬅️ JANUARY 2026' : '';
            console.log(`  ${date}: ${count} stocks${marker}`);
        });

} catch (err) {
    console.error('Error:', err.message);
}
