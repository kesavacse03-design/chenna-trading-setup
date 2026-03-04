const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const categories = await prisma.category.findMany({
        where: {
            key: { contains: 'LONG' }
        },
        include: {
            _count: {
                select: { stocks: true }
            }
        }
    });

    console.log('--- Categories in DB ---');
    categories.forEach(c => {
        console.log(`Key: ${c.key} | Name: ${c.name} | Stocks: ${c._count.stocks}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
