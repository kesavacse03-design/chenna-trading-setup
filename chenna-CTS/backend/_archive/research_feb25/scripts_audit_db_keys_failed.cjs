const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const symbols = ['PERSISTENT', 'KAYNES', 'CUMMINSIND', '360ONE'];
    console.log('--- Inspecting Instrument Keys ---');

    for (const symbol of symbols) {
        const stock = await prisma.stock.findFirst({
            where: { symbol }
        });

        if (stock) {
            console.log(`${symbol}: ${stock.instrumentKey}`);
        } else {
            console.log(`${symbol}: Not Found in DB`);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
