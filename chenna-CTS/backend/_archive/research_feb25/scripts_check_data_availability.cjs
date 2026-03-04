/**
 * Check Data Availability for Validation
 * 
 * Objectives:
 * 1. Count total records in SHORT_TERM_SWING_BO_DOWN.
 * 2. Find date range (Min AddedDate to Max AddedDate).
 * 3. Count unique symbols.
 * 4. Check other potential categories (UP/LONG TERM) for comparison.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log('=== DATA AVAILABILITY CHECK ===\n');

    const categories = [
        'SHORT_TERM_SWING_BO_DOWN',
        'SHORT_TERM_SWING_BO_UP',
        'LONG_TERM_SWING_BO_DOWN',
        'LONG_TERM_SWING_BO_UP'
    ];

    for (const catKey of categories) {
        const category = await prisma.category.findUnique({
            where: { key: catKey },
            include: { stocks: { select: { addedDate: true, stock: { select: { symbol: true } } } } }
        });

        if (!category) {
            console.log(`[${catKey}] Not found.`);
            continue;
        }

        const count = category.stocks.length;
        if (count === 0) {
            console.log(`[${catKey}] 0 records.`);
            continue;
        }

        const sorted = category.stocks.sort((a, b) => new Date(a.addedDate) - new Date(b.addedDate));
        const minDate = sorted[0].addedDate.toISOString().split('T')[0];
        const maxDate = sorted[count - 1].addedDate.toISOString().split('T')[0];

        const updates = new Set(category.stocks.map(s => s.addedDate.toISOString().split('T')[0]));
        const uniqueSyms = new Set(category.stocks.map(s => s.stock.symbol));

        console.log(`[${catKey}]`);
        console.log(`  Total Records: ${count}`);
        console.log(`  Date Range:    ${minDate} to ${maxDate}`);
        console.log(`  Unique Dates:  ${updates.size}`);
        console.log(`  Unique Stocks: ${uniqueSyms.size}`);
        console.log('');
    }

    await prisma.$disconnect();
}

run().catch(console.error);
