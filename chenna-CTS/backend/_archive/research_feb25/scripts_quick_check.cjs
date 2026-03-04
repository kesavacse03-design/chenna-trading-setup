// Quick check: How many stocks are in each category?
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function quickCheck() {
    const cats = await prisma.category.findMany({
        include: { _count: { select: { stocks: true } } },
        orderBy: { name: 'asc' }
    });

    console.log('\n=== STOCK COUNT BY CATEGORY ===\n');
    let total = 0;
    for (const c of cats) {
        console.log(`${c.name.padEnd(35)} ${c._count.stocks} stocks`);
        total += c._count.stocks;
    }
    console.log(`\nTOTAL STOCK-CATEGORY LINKS: ${total}`);

    // Count unique stocks
    const uniqueStocks = await prisma.stock.count();
    console.log(`UNIQUE STOCKS IN DATABASE: ${uniqueStocks}\n`);

    await prisma.$disconnect();
}

quickCheck();
