const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log("Checking DB Categories...");

    // Check mapping category SHORT_TERM_SWING_BO_UP
    const upCategory = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!upCategory) {
        console.log("SHORT_TERM_SWING_BO_UP category not found!");
        return;
    }

    // Check mapping category SHORT_TERM_SWING_BO_DOWN
    const downCategory = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });

    // Fetch mapped stocks
    const upStocks = await prisma.stockCategory.findMany({
        where: { categoryId: upCategory.id },
        include: { stock: true }
    });

    const downStocks = await prisma.stockCategory.findMany({
        where: { categoryId: downCategory.id },
        include: { stock: true }
    });

    const upSyms = upStocks.map(s => s.stock.symbol);
    const downSymsSet = new Set(downStocks.map(s => s.stock.symbol));

    const overlap = upSyms.filter(s => downSymsSet.has(s));

    console.log(`ST_SWING_BO_UP Total Stocks: ${upSyms.length}`);
    console.log(`ST_SWING_BO_DOWN Total Stocks: ${downSymsSet.size}`);
    console.log(`Overlap (Cached via BO_DOWN): ${overlap.length}`);
    console.log(`New stocks needed for BO_UP cache: ${upSyms.length - overlap.length}`);

    // Check validity of instrument keys
    const invalidCount = upStocks.filter(s => !s.stock.instrumentKey).length;
    console.log(`Invalid Instrument Keys in BO_UP: ${invalidCount}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
