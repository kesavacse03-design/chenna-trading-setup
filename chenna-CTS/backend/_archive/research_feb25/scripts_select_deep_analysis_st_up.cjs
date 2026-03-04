const prisma = require('../lib/prisma.cjs');
const fs = require('fs');
const path = require('path');

async function selectSample() {
    const categoryKey = 'SHORT_TERM_SWING_BO_UP';

    // Helper: Select N random stocks from a date range
    async function getStocksFromRange(startDate, endDate, limit) {
        return await prisma.$queryRaw`
            SELECT s.symbol, s.instrument_key, sc.added_date::text
            FROM stock_categories sc
            JOIN stocks s ON sc.stock_id = s.id
            JOIN categories c ON sc.category_id = c.id
            WHERE c.key = ${categoryKey}
              AND sc.added_date >= ${startDate}
              AND sc.added_date <= ${endDate}
            ORDER BY RANDOM()
            LIMIT ${limit}
        `;
    }

    // 1. Sep/Oct 2025
    const start1 = new Date(2025, 8, 1); // Sep 1
    const end1 = new Date(2025, 9, 31);   // Oct 31
    const group1 = await getStocksFromRange(start1, end1, 10);

    // 2. Nov/Dec 2025
    const start2 = new Date(2025, 10, 1); // Nov 1
    const end2 = new Date(2025, 11, 31);  // Dec 31
    const group2 = await getStocksFromRange(start2, end2, 10);

    // 3. Jan 2026
    const start3 = new Date(2026, 0, 1);  // Jan 1
    const end3 = new Date(2026, 0, 31);   // Jan 31
    const group3 = await getStocksFromRange(start3, end3, 10);

    const allStocks = [...group1, ...group2, ...group3];

    console.log(`Selected ${allStocks.length} stocks for ST_SWING_BO_UP:`);
    console.log(`- Sep/Oct 2025: ${group1.length}`);
    console.log(`- Nov/Dec 2025: ${group2.length}`);
    console.log(`- Jan 2026: ${group3.length}`);

    const outPath = path.join(__dirname, '../results/deep_analysis_st_up_targets.json');
    fs.writeFileSync(outPath, JSON.stringify(allStocks, null, 2));
    console.log(`Saved targets to ${outPath}`);
}

selectSample()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
