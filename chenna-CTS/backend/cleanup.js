const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const deleted = await prisma.category.deleteMany({
            where: { key: 'TEST_CATEGORY_API' }
        });
        console.log(`Deleted ${deleted.count} categories with key TEST_CATEGORY_API`);

        const categories = await prisma.category.findMany({
            include: { _count: { select: { stocks: true } } }
        });

        console.log('Current Categories:');
        categories.forEach(c => {
            console.log(`${c.key}: ${c._count.stocks} stocks`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
