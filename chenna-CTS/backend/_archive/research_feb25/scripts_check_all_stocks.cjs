const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function checkAllStocks() {
    const cat = await p.category.findFirst({ where: { key: 'PRE_MARKET' } });
    if (!cat) { console.log('No PRE_MARKET'); return; }

    // Get all with date distribution
    const all = await p.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true },
        orderBy: { addedDate: 'desc' }
    });

    console.log('Total PRE_MARKET entries in StockCategory:', all.length);

    // Group by date
    const dateGroups = {};
    for (const s of all) {
        const dateKey = s.addedDate ? s.addedDate.toISOString().split('T')[0] : 'NULL';
        if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
        dateGroups[dateKey].push(s.stock?.symbol);
    }

    console.log('\nDate distribution:');
    for (const [date, stocks] of Object.entries(dateGroups)) {
        console.log(`${date}: ${stocks.length} stocks`);
        console.log(`  First 5: ${stocks.slice(0, 5).join(', ')}`);
    }

    // Check if there's a stock_categories_view or something different
    const rawCount = await p.$queryRaw`SELECT COUNT(*) as count FROM stock_categories WHERE category_id = ${cat.id}`;
    console.log('\nRaw SQL count:', rawCount);

    await p.$disconnect();
}

checkAllStocks().catch(console.error);
