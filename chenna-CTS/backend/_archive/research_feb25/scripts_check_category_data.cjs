const prisma = require('../lib/prisma.cjs');
const fs = require('fs');
const path = require('path');

async function run() {
    const lines = [];
    const log = (s) => { lines.push(s); console.log(s); };

    const cats = await prisma.$queryRaw`
        SELECT c.key, 
               COUNT(sc.id)::int as count, 
               MIN(sc.added_date) as min_date, 
               MAX(sc.added_date) as max_date, 
               COUNT(DISTINCT sc.stock_id)::int as unique_stocks 
        FROM categories c 
        LEFT JOIN stock_categories sc ON c.id = sc.category_id 
        GROUP BY c.key 
        ORDER BY count DESC
    `;

    log('==========================================================================================');
    log('CATEGORY DATA AVAILABILITY');
    log('==========================================================================================');
    log('Category                        Records  Stocks  Date Range');
    log('------------------------------------------------------------------------------------------');

    for (const c of cats) {
        const minD = c.min_date ? c.min_date.toISOString().split('T')[0] : 'N/A';
        const maxD = c.max_date ? c.max_date.toISOString().split('T')[0] : 'N/A';
        log(
            c.key.padEnd(32) +
            String(c.count).padStart(7) +
            String(c.unique_stocks).padStart(8) +
            `  ${minD} to ${maxD}`
        );
    }

    log('==========================================================================================');

    const cacheCount = await prisma.ohlcvCache.count();
    log(`\nOHLCV Cache entries: ${cacheCount}`);

    // Write to file
    const outFile = path.join(__dirname, '../results/category_data_availability.txt');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, lines.join('\n'));
    console.log(`\nWritten to: ${outFile}`);

    await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
