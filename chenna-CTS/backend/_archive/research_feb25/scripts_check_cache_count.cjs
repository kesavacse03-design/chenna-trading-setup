const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function count() {
    const c = await prisma.ohlcvCache.count();
    console.log(`ohlcvCache count: ${c}`);
    await prisma.$disconnect();
}
count();
