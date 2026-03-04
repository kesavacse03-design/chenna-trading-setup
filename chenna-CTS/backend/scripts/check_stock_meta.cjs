const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStockMetadata() {
    console.log("Checking INTRADAY_BOOST stocks for March 2...");

    // Find category
    const cat = await prisma.category.findUnique({
        where: { key: 'INTRADAY_BOOST' }
    });

    // Get stocks
    const stocks = await prisma.stockCategory.findMany({
        where: {
            categoryId: cat.id,
            addedDate: new Date('2026-03-02T00:00:00.000Z')
        },
        include: { stock: true },
        take: 5
    });

    console.log(`Found ${stocks.length} stocks:`);
    stocks.forEach(s => {
        console.log(`- ${s.stock.symbol} | Meta: ${JSON.stringify(s.meta)} | Sector: ${s.sector}`);
    });

    await prisma.$disconnect();
}

checkStockMetadata().catch(console.error);
