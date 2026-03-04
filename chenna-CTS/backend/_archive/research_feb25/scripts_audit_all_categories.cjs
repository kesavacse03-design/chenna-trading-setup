/**
 * Category Data Audit - DATABASE ONLY
 * Check what's actually in the database for all categories
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditCategories() {
    console.log('═'.repeat(70));
    console.log('CATEGORY DATA AUDIT - DATABASE ONLY');
    console.log('═'.repeat(70));
    console.log('Date:', new Date().toISOString().split('T')[0]);
    console.log('');

    // Get all categories from database
    const allCategories = await prisma.category.findMany({
        orderBy: { key: 'asc' }
    });

    console.log(`Found ${allCategories.length} categories in database\n`);

    const results = [];

    for (const category of allCategories) {
        const stocks = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: { select: { symbol: true } } },
            orderBy: { addedDate: 'asc' }
        });

        // Get unique dates with counts
        const dateCounts = {};
        let nullDates = 0;

        for (const s of stocks) {
            const d = s.addedDate ? s.addedDate.toISOString().split('T')[0] : 'NULL';
            if (d === 'NULL') nullDates++;
            dateCounts[d] = (dateCounts[d] || 0) + 1;
        }

        const uniqueDates = Object.keys(dateCounts).filter(d => d !== 'NULL').sort();

        const result = {
            key: category.key,
            name: category.name,
            totalStocks: stocks.length,
            uniqueDates: uniqueDates.length,
            nullDates: nullDates,
            dateRange: uniqueDates.length > 0
                ? `${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`
                : 'N/A',
            dateCounts: dateCounts
        };

        results.push(result);

        // Print category info
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`📁 ${category.key}`);
        console.log(`   Name: ${category.name || 'N/A'}`);
        console.log(`   Total stocks: ${stocks.length}`);
        console.log(`   Unique dates: ${uniqueDates.length}`);
        if (nullDates > 0) console.log(`   ⚠️  NULL dates: ${nullDates}`);
        console.log(`   Date range: ${result.dateRange}`);

        // Show date distribution (top 10)
        if (Object.keys(dateCounts).length > 0) {
            console.log(`   Date distribution:`);
            const sortedDates = Object.entries(dateCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            sortedDates.forEach(([date, count]) => {
                console.log(`     ${date}: ${count} stocks`);
            });
        }
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));

    const totalStocks = results.reduce((sum, r) => sum + r.totalStocks, 0);
    const totalNullDates = results.reduce((sum, r) => sum + r.nullDates, 0);

    console.log(`\nTotal categories: ${results.length}`);
    console.log(`Total stock entries: ${totalStocks}`);
    console.log(`Entries with NULL dates: ${totalNullDates}`);

    console.log('\nCategories by stock count:');
    results
        .sort((a, b) => b.totalStocks - a.totalStocks)
        .forEach(r => {
            const status = r.nullDates > 0 ? '⚠️' : '✅';
            console.log(`  ${status} ${r.key.padEnd(25)} ${r.totalStocks} stocks (${r.uniqueDates} dates)`);
        });

    await prisma.$disconnect();
    return results;
}

auditCategories().catch(console.error);
