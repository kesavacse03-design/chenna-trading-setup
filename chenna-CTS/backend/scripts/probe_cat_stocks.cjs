const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Checking CategoryStock for INTRADAY_BOOST...");
    const stocks = await prisma.stockCategory.findMany({
        where: { categoryId: 'INTRADAY_BOOST' },
        take: 5
    });

    console.log(stocks);

    // Check if we have any LiveSnapshots at all
    const snapCount = await prisma.liveSnapshot.count();
    console.log(`Total live snapshots in DB: ${snapCount}`);

    const snapCategories = await prisma.liveSnapshot.groupBy({
        by: ['category'],
        _count: { category: true }
    });
    console.log("LiveSnapshot categories:", snapCategories);
}
main().finally(() => prisma.$disconnect());
