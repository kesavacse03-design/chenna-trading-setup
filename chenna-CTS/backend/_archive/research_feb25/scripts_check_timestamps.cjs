const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTimestamps() {
    console.log('Checking StockCategory timestamps...');
    const stocks = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } },
        include: { stock: true },
        take: 5
    });

    if (stocks.length === 0) {
        console.log('No stocks found in INTRADAY_BOOST.');
    } else {
        stocks.forEach(s => {
            console.log(`Symbol: ${s.stock.symbol}`);
            console.log(`  AddedDate: ${s.addedDate ? s.addedDate.toISOString() : 'null'} (Type: ${typeof s.addedDate})`);
            console.log(`  CreatedAt: ${s.createdAt ? s.createdAt.toISOString() : 'null'} (Type: ${typeof s.createdAt})`);
        });
    }

    await prisma.$disconnect();
}

checkTimestamps();
