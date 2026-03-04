const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  PHASE 5 STEP 1: DATABASE INVENTORY CHECK');
    console.log('══════════════════════════════════════════════════════════════════════\n');

    try {
        // Use ::int cast to avoid BigInt serialization issues in JSON/Console
        const results = await prisma.$queryRaw`
            SELECT 
              c.key as category,
              COUNT(*)::int as total_records,
              COUNT(DISTINCT s.symbol)::int as unique_stocks,
              MIN(sc.added_date) as earliest_date,
              MAX(sc.added_date) as latest_date
            FROM stock_categories sc
            JOIN categories c ON sc.category_id = c.id
            JOIN stocks s ON sc.stock_id = s.id
            GROUP BY c.key
            ORDER BY total_records DESC
        `;

        console.log(`Found ${results.length} categories with data.\n`);

        let md = '# Database Category Inventory\n\n';
        md += '| Category | Total Records | Unique Stocks | Earliest Date | Latest Date |\n';
        md += '|---|---|---|---|---|\n';

        // Console output format
        console.log('  Category                  | Total | Unique | Date Range');
        console.log('  ' + '─'.repeat(70));

        for (const row of results) {
            const earliest = row.earliest_date ? new Date(row.earliest_date).toISOString().split('T')[0] : 'N/A';
            const latest = row.latest_date ? new Date(row.latest_date).toISOString().split('T')[0] : 'N/A';

            md += `| ${row.category} | ${row.total_records} | ${row.unique_stocks} | ${earliest} | ${latest} |\n`;

            console.log(`  ${row.category.padEnd(25)} | ${String(row.total_records).padStart(5)} | ${String(row.unique_stocks).padStart(6)} | ${earliest} to ${latest}`);
        }

        const outDir = path.join(__dirname, '..', 'results');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const outPath = path.join(outDir, 'category_inventory.md');
        fs.writeFileSync(outPath, md);
        console.log(`\n  📄 Inventory report saved to: ${outPath}`);

    } catch (e) {
        console.error('❌ Error running inventory check:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
