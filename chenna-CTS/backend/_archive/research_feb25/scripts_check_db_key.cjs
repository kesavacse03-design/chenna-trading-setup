const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const symbol = '360ONE';
    console.log(`Checking DB for ${symbol}...`);

    // Check Instrument Table
    const inst = await prisma.instrument.findFirst({
        where: { OR: [{ symbol }, { tradingSymbol: symbol }] }
    });
    console.log('Instrument:', inst);

    // Check Stock Table
    const stock = await prisma.stock.findFirst({
        where: { symbol }
    });
    console.log('Stock:', stock);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
