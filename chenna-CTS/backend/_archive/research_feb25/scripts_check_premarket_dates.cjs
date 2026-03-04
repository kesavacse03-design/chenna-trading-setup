// Check all PRE_MARKET entries by date in database
const { PrismaClient } = require('@prisma/client');

async function checkPreMarketDates() {
    const prisma = new PrismaClient();

    try {
        // Find PRE_MARKET category
        const cat = await prisma.category.findFirst({
            where: { key: 'PRE_MARKET' }
        });

        if (!cat) {
            console.log('PRE_MARKET category not found');
            return;
        }

        console.log('PRE_MARKET category ID:', cat.id);

        // Get all entries
        const entries = await prisma.stockCategory.findMany({
            where: { categoryId: cat.id },
            include: { stock: true },
            orderBy: { addedDate: 'desc' }
        });

        console.log('\n=== PRE_MARKET Database Analysis ===');
        console.log('Total entries:', entries.length);

        // Group by month
        const byMonth = {};
        entries.forEach(e => {
            const d = e.addedDate ? e.addedDate.toISOString().slice(0, 7) : 'NULL';
            byMonth[d] = (byMonth[d] || 0) + 1;
        });

        console.log('\nEntries by month:');
        Object.entries(byMonth)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .forEach(([month, count]) => {
                console.log(`  ${month}: ${count} stocks`);
            });

        // Group by exact date
        const byDate = {};
        entries.forEach(e => {
            const d = e.addedDate ? e.addedDate.toISOString().slice(0, 10) : 'NULL';
            byDate[d] = (byDate[d] || 0) + 1;
        });

        console.log('\nEntries by exact date:');
        Object.entries(byDate)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .forEach(([date, count]) => {
                console.log(`  ${date}: ${count} stocks`);
            });

        // Show sample stocks from each date
        console.log('\nSample stocks per date:');
        const dateGroups = {};
        entries.forEach(e => {
            const d = e.addedDate ? e.addedDate.toISOString().slice(0, 10) : 'NULL';
            if (!dateGroups[d]) dateGroups[d] = [];
            if (dateGroups[d].length < 5) {
                dateGroups[d].push(e.stock.symbol);
            }
        });

        Object.entries(dateGroups)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .forEach(([date, symbols]) => {
                console.log(`  ${date}: ${symbols.join(', ')}${symbols.length === 5 ? '...' : ''}`);
            });

        // Check for January 2026 specifically
        const jan2026 = entries.filter(e => {
            if (!e.addedDate) return false;
            const d = e.addedDate.toISOString();
            return d.startsWith('2026-01');
        });

        console.log('\n=== January 2026 Check ===');
        console.log('Stocks from January 2026:', jan2026.length);
        if (jan2026.length > 0) {
            console.log('Symbols:', jan2026.map(e => e.stock.symbol).join(', '));
        } else {
            console.log('⚠️ NO STOCKS FROM JANUARY 2026 IN DATABASE');
        }

    } finally {
        await prisma.$disconnect();
    }
}

checkPreMarketDates().catch(console.error);
