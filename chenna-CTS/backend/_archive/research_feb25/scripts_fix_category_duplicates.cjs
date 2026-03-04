/**
 * Fix Duplicate Category Entries
 * 
 * PRE_MARKET category has 440 entries but only 49 unique stocks.
 * Each stock is duplicated ~9 times.
 * 
 * This script removes duplicates, keeping only one entry per stock.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDuplicates() {
    console.log('='.repeat(60));
    console.log('FIXING DUPLICATE CATEGORY ENTRIES');
    console.log('='.repeat(60));

    // Get all categories
    const categories = await prisma.category.findMany();

    for (const category of categories) {
        console.log(`\nCategory: ${category.key}`);

        // Get all stocks in this category
        const categoryStocks = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: true }
        });

        console.log(`  Total entries: ${categoryStocks.length}`);

        // Find duplicates
        const seen = new Map(); // symbol -> first entry id
        const toDelete = [];

        for (const cs of categoryStocks) {
            const symbol = cs.stock.symbol;
            if (seen.has(symbol)) {
                // Duplicate - mark for deletion
                toDelete.push(cs.id);
            } else {
                // First occurrence - keep it
                seen.set(symbol, cs.id);
            }
        }

        console.log(`  Unique stocks: ${seen.size}`);
        console.log(`  Duplicates to remove: ${toDelete.length}`);

        if (toDelete.length > 0) {
            // Delete duplicates
            const result = await prisma.stockCategory.deleteMany({
                where: { id: { in: toDelete } }
            });
            console.log(`  ✅ Deleted ${result.count} duplicate entries`);
        } else {
            console.log(`  ✅ No duplicates found`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION');
    console.log('='.repeat(60));

    // Verify PRE_MARKET
    const preMarket = await prisma.category.findUnique({
        where: { key: 'PRE_MARKET' },
        include: { stocks: true }
    });

    if (preMarket) {
        console.log(`\nPRE_MARKET after fix: ${preMarket.stocks.length} entries`);
    }

    console.log('\n✅ Duplicate fix complete!');
}

fixDuplicates()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
