const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOldCats() {
    console.log("Checking oldest INTRADAY_BOOST stocks...");
    const sc = await prisma.stockCategory.findFirst({
        where: {
            category: { key: 'INTRADAY_BOOST' }
        },
        orderBy: { addedDate: 'asc' }
    });
    console.log('Oldest INTRADAY_BOOST in DB:', sc);
    await prisma.$disconnect();
}
checkOldCats().catch(console.error);
