const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const dates = await prisma.stockCategory.groupBy({
        by: ['addedDate'],
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: {
                gte: new Date('2026-02-15T00:00:00.000Z'),
                lte: new Date('2026-02-25T00:00:00.000Z')
            }
        },
        _count: {
            stockId: true
        }
    });

    console.log(dates);
}

main().catch(console.error).finally(() => prisma.$disconnect());
