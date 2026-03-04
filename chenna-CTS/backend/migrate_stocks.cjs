const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateStocks(sourceKey, targetKey) {
    console.log(`Starting migration from ${sourceKey} to ${targetKey}...`);

    // 1. Get Source Category and Stocks
    const sourceCat = await prisma.category.findUnique({
        where: { key: sourceKey },
        include: { stocks: { include: { stock: true } } }
    });

    if (!sourceCat) {
        console.error(`Source category ${sourceKey} not found!`);
        return;
    }

    // 2. Get Target Category
    const targetCat = await prisma.category.findUnique({
        where: { key: targetKey },
        include: { stocks: true }
    });

    if (!targetCat) {
        console.error(`Target category ${targetKey} not found!`);
        return;
    }

    console.log(`Source: ${sourceCat.stocks.length} stocks`);
    console.log(`Target: ${targetCat.stocks.length} stocks`);

    const existingTargetStockIds = new Set(targetCat.stocks.map(s => s.stockId));
    let movedCount = 0;

    // 3. Migrate
    for (const sourceStock of sourceCat.stocks) {
        if (!existingTargetStockIds.has(sourceStock.stockId)) {
            // Add to target
            await prisma.stockCategory.create({
                data: {
                    categoryId: targetCat.id,
                    stockId: sourceStock.stockId,
                    addedDate: sourceStock.addedDate || new Date() // Use addedDate from schema
                }
            });
            existingTargetStockIds.add(sourceStock.stockId);
            movedCount++;
            process.stdout.write('.');
        }
    }

    console.log(`\nMigration complete! Moved ${movedCount} new stocks to ${targetKey}.`);

    // 4. Verify Final Count
    const finalTargetCount = await prisma.stockCategory.count({ where: { categoryId: targetCat.id } });
    console.log(`New Target Total: ${finalTargetCount}`);

    // 5. Cleanup Source?
    console.log(`Clearing source category ${sourceKey}...`);
    await prisma.stockCategory.deleteMany({ where: { categoryId: sourceCat.id } });
    console.log(`Source category emptied.`);

    // Optional: Delete the category itself? User might want to see it gone.
    // await prisma.category.delete({ where: { id: sourceCat.id } });
    // console.log(`Source category deleted.`);
}

const SOURCE = 'LONG_TERM_BO_UP';
const TARGET = 'LONG_TERM_SWING_BO_UP';

migrateStocks(SOURCE, TARGET)
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
