const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const category = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
    if (!category) {
        console.log("Category not found.");
        return;
    }
    const count = await prisma.stockCategory.count({ where: { categoryId: category.id } });
    console.log(`count: ${count}`);

    const stocks = await prisma.stockCategory.findMany({
        where: { categoryId: category.id },
        take: 5,
        include: { stock: true }
    });

    for (const s of stocks) {
        console.log(`| ${s.stock.symbol} | ${s.stock.instrumentKey} | valid: ${!!s.stock.instrumentKey}`);
    }
}

check().catch(console.error).finally(() => prisma.$disconnect());
