const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyMigration() {
    console.log('🔍 Verifying Migration Results...');

    // Check DOWNSIDE LOM SWING
    const categoryKey = 'DOWNSIDE_LOM_SWING';

    const category = await prisma.category.findUnique({
        where: { key: categoryKey },
        include: {
            stocks: {
                include: {
                    stock: true
                }
            }
        }
    });

    if (!category) {
        console.error(`❌ Category ${categoryKey} not found!`);
    } else {
        console.log(`✅ Category: ${category.name} (${category.key})`);
        console.log(`📊 Stock Count: ${category.stocks.length}`);

        console.log('📜 Stocks:');
        category.stocks.forEach(item => {
            console.log(` - ${item.stock.symbol} (${item.stock.name})`);
        });
    }

    // Check total stocks
    const totalStocks = await prisma.stock.count();
    console.log(`\n📈 Total Stocks in DB: ${totalStocks}`);

    // Check total links
    const totalLinks = await prisma.stockCategory.count();
    console.log(`🔗 Total Stock-Category Links: ${totalLinks}`);

    await prisma.$disconnect();
}

verifyMigration().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
