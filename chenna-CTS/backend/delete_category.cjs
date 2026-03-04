const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteCategory(key) {
    console.log(`Checking category ${key}...`);

    const cat = await prisma.category.findUnique({
        where: { key: key },
        include: { _count: { select: { stocks: true } } }
    });

    if (!cat) {
        console.log(`Category ${key} not found.`);
        return;
    }

    console.log(`Category ${key} has ${cat._count.stocks} stocks.`);

    if (cat._count.stocks === 0) {
        console.log(`Deleting category ${key}...`);
        await prisma.category.delete({ where: { id: cat.id } });
        console.log(`Category deleted successfully.`);
    } else {
        console.log(`Cannot delete non-empty category!`);
    }
}

deleteCategory('LONG_TERM_BO_UP')
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
