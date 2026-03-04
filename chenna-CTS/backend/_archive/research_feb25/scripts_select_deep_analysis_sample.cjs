const prisma = require('../lib/prisma.cjs');
const fs = require('fs');
const path = require('path');

async function selectSample() {
    const categoryKey = 'SHORT_TERM_SWING_BO_DOWN';

    // Helper to get N stocks from a specific month
    async function getStocksFromMonth(year, month, limit) {
        // month is 0-indexed in JS, but 1-indexed in SQL/ISO usually. 
        // Let's use strict date ranges.
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0); // Last day of month

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

    // 1. Oct 2025 (Bearish/Volatile?)
    const octStocks = await getStocksFromMonth(2025, 9, 10); // Month 9 = Oct

    // 2. Nov 2025
    const novStocks = await getStocksFromMonth(2025, 10, 10); // Month 10 = Nov

    // 3. Jan 2026
    const janStocks = await getStocksFromMonth(2026, 0, 10); // Month 0 = Jan

    const allStocks = [...octStocks, ...novStocks, ...janStocks];

    console.log(`Selected ${allStocks.length} stocks:`);
    console.log(`- Oct 2025: ${octStocks.length}`);
    console.log(`- Nov 2025: ${novStocks.length}`);
    console.log(`- Jan 2026: ${janStocks.length}`);

    const outPath = path.join(__dirname, '../results/deep_analysis_targets.json');
    fs.writeFileSync(outPath, JSON.stringify(allStocks, null, 2));
    console.log(`Saved targets to ${outPath}`);
}

selectSample()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
