const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listCategories() {
    const categories = await prisma.category.findMany({
        include: {
            _count: { select: { stocks: true } }
        }
    });
    console.log('\n=== Current Categories ===\n');
    categories.forEach(cat => {
        console.log(`  ${cat.id}: ${cat.name || cat.id} (${cat._count.stocks} stocks)`);
    });
    console.log(`\nTotal: ${categories.length} categories`);
    await prisma.$disconnect();
}

listCategories();
