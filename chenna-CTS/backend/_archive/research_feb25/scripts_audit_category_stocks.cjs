const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- AUDIT: INTRADAY_BOOST STOCKS ---');

    // Fetch the category and its stocks
    const category = await prisma.category.findFirst({
        where: { key: 'INTRADAY_BOOST' },
        include: {
            stocks: {
                include: { stock: true }
            }
        }
    });

    if (!category) {
        console.log('Category INTRADAY_BOOST not found in DB.');
        return;
    }

    console.log(`Total stocks in category: ${category.stocks.length}`);

    // Group by addedDate (using createdAt from the relation table)
    const counts = {};
    const stocksByDate = {}; // date -> [symbols]

    for (const item of category.stocks) {
        // item is the relation table record (CategoryStock or similar)
        // It has createdAt
        const dateStr = new Date(item.createdAt).toISOString().split('T')[0];

        counts[dateStr] = (counts[dateStr] || 0) + 1;

        if (!stocksByDate[dateStr]) stocksByDate[dateStr] = [];
        stocksByDate[dateStr].push(item.stock.symbol);
    }

    // Print distribution
    const sortedDates = Object.keys(counts).sort().reverse();

    console.log('\nStocks count by Added Date:');
    if (sortedDates.length === 0) {
        console.log('  (No stocks found)');
    }

    for (const date of sortedDates) {
        console.log(`  ${date}: ${counts[date]} stocks`);
    }

    // Check Today (2026-02-05)
    // Adjust logic to check for "today" in system time if needed, but here we just look for the string.
    const todayTarget = '2026-02-05';
    const todaySymbols = stocksByDate[todayTarget] || [];

    console.log(`\nStocks Added 'TODAY' (${todayTarget}): ${todaySymbols.length}`);
    if (todaySymbols.length > 0) {
        console.log('Sample:', todaySymbols.slice(0, 10).join(', '));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
