/**
 * Deep investigation of stock counts - all possible sources
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function deepCheck() {
    console.log('═'.repeat(70));
    console.log('DEEP STOCK COUNT INVESTIGATION');
    console.log('═'.repeat(70));

    // 1. Get PRE_MARKET category
    const cat = await p.category.findFirst({ where: { key: 'PRE_MARKET' } });
    if (!cat) { console.log('No PRE_MARKET category!'); return; }
    console.log(`\nPRE_MARKET category ID: ${cat.id}`);

    // 2. Count via different methods
    console.log('\n1. STOCK COUNTS VIA DIFFERENT METHODS:');
    console.log('-'.repeat(50));

    // Method A: Prisma count
    const countA = await p.stockCategory.count({ where: { categoryId: cat.id } });
    console.log(`   Prisma stockCategory.count: ${countA}`);

    // Method B: Raw SQL count
    const countB = await p.$queryRaw`SELECT COUNT(*) as count FROM stock_categories WHERE category_id = ${cat.id}`;
    console.log(`   Raw SQL COUNT(*): ${countB[0].count}`);

    // Method C: Count unique symbols
    const uniqueSymbols = await p.$queryRaw`
        SELECT COUNT(DISTINCT s.symbol) as count 
        FROM stock_categories sc 
        JOIN stocks s ON sc.stock_id = s.id 
        WHERE sc.category_id = ${cat.id}
    `;
    console.log(`   Unique symbols: ${uniqueSymbols[0].count}`);

    // Method D: Count with date grouping
    const byDate = await p.$queryRaw`
        SELECT added_date::date as date, COUNT(*) as count 
        FROM stock_categories 
        WHERE category_id = ${cat.id} 
        GROUP BY added_date::date 
        ORDER BY added_date::date DESC
    `;
    console.log('\n2. ENTRIES BY DATE:');
    console.log('-'.repeat(50));
    let total = 0;
    for (const row of byDate) {
        const dateStr = row.date ? row.date.toISOString().split('T')[0] : 'NULL';
        console.log(`   ${dateStr}: ${row.count} entries`);
        total += Number(row.count);
    }
    console.log(`   TOTAL: ${total}`);

    // 3. Check if same stock can appear multiple times with different dates
    console.log('\n3. STOCKS WITH MULTIPLE DATE ENTRIES:');
    console.log('-'.repeat(50));
    const multiDates = await p.$queryRaw`
        SELECT s.symbol, COUNT(*) as appearances, 
               array_agg(sc.added_date::date ORDER BY sc.added_date) as dates
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        WHERE sc.category_id = ${cat.id}
        GROUP BY s.symbol
        HAVING COUNT(*) > 1
        LIMIT 10
    `;
    if (multiDates.length > 0) {
        console.log(`   Found ${multiDates.length}+ stocks with multiple dates:`);
        for (const row of multiDates) {
            console.log(`   ${row.symbol}: ${row.appearances}x on ${row.dates.map(d => d.toISOString().split('T')[0]).join(', ')}`);
        }
    } else {
        console.log('   No stocks with multiple date entries');
    }

    // 4. Sample some actual entries
    console.log('\n4. SAMPLE ENTRIES (latest 20):');
    console.log('-'.repeat(50));
    const sample = await p.$queryRaw`
        SELECT s.symbol, sc.added_date::date as date
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        WHERE sc.category_id = ${cat.id}
        ORDER BY sc.added_date DESC
        LIMIT 20
    `;
    for (const row of sample) {
        const dateStr = row.date ? row.date.toISOString().split('T')[0] : 'N/A';
        console.log(`   ${row.symbol.padEnd(15)} | ${dateStr}`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('END OF INVESTIGATION');
    console.log('═'.repeat(70));

    await p.$disconnect();
}

deepCheck().catch(console.error);
