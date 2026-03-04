const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const c = await prisma.category.findUnique({ where: { key: 'INTRADAY_BOOST' }, include: { stocks: true } });
    console.log(Object.keys(c.stocks[0]));
}
run().finally(() => prisma.$disconnect());
