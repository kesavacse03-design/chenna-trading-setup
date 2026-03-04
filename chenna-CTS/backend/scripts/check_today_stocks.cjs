const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTodayStocks() {
    const today = new Date('2026-03-04T00:00:00.000Z');

    // find dates
    const latestDates = await prisma.stockCategory.groupBy({
        by: ['addedDate', 'categoryId'],
        _count: {
            stockId: true
        },
        orderBy: {
            addedDate: 'desc'
        },
        take: 10
    });
    console.log("Latest stock_category batches:");
    console.log(latestDates);

    // get actual names
    const cats = await prisma.category.findMany({
        where: { id: { in: latestDates.map(d => d.categoryId) } }
    });

    latestDates.forEach(d => {
        const cat = cats.find(c => c.id === d.categoryId);
        console.log(`Date: ${d.addedDate?.toISOString().split('T')[0]}, Category: ${cat?.key}, Count: ${d._count.stockId}`);
    });

    await prisma.$disconnect();
}

checkTodayStocks().catch(console.error);
