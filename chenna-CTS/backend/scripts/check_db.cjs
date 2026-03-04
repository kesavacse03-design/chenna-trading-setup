const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const cats = await prisma.category.findMany();
    console.log("Categories found:", cats.map(c => c.key));

    const hpsCat = cats.find(c => c.key === 'HIGH_POWERED_STOCKS');
    const ibCat = cats.find(c => c.key === 'INTRADAY_BOOST');

    if (hpsCat) {
        const hpsCount = await prisma.stockCategory.count({ where: { categoryId: hpsCat.id } });
        console.log(`HIGH_POWERED_STOCKS StockCategory count: ${hpsCount}`);
    }

    if (ibCat) {
        const ibCount = await prisma.stockCategory.count({ where: { categoryId: ibCat.id } });
        console.log(`INTRADAY_BOOST StockCategory count: ${ibCount}`);
    }

    const lsHPS = await prisma.liveSnapshot.count({ where: { category: 'HIGH_POWERED_STOCKS' } });
    const lsIB = await prisma.liveSnapshot.count({ where: { category: 'INTRADAY_BOOST' } });
    console.log(`LiveSnapshot HPS: ${lsHPS}, IB: ${lsIB}`);

    const tsHPS = await prisma.tradingSignal.count({ where: { categoryKey: 'HIGH_POWERED_STOCKS' } });
    console.log(`TradingSignal HPS: ${tsHPS}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
