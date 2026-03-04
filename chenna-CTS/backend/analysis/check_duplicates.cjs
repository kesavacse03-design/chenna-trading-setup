/**
 * Check for duplicate stocks in PRE_MARKET category
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
    const category = await prisma.category.findUnique({
        where: { key: 'PRE_MARKET' },
        include: {
            stocks: {
                include: { stock: true }
            }
        }
    });

    if (!category) {
        console.log('PRE_MARKET category not found');
        return;
    }

    const symbols = category.stocks.map(s => s.stock.symbol);
    const unique = [...new Set(symbols)];

    console.log('Total entries:', symbols.length);
    console.log('Unique symbols:', unique.length);

    // Find duplicates
    const counts = {};
    symbols.forEach(s => counts[s] = (counts[s] || 0) + 1);

    const duplicates = Object.entries(counts)
        .filter(([k, v]) => v > 1)
        .sort((a, b) => b[1] - a[1]);

    if (duplicates.length > 0) {
        console.log('\nDUPLICATE STOCKS:');
        duplicates.forEach(([sym, count]) => {
            console.log(`  ${sym}: ${count} times`);
        });
    } else {
        console.log('\nNo duplicate stocks found');
    }
}

checkDuplicates()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
