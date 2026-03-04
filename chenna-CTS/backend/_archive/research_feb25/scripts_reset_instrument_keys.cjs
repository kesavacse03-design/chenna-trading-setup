const prisma = require('../lib/prisma.cjs');

async function resetKeys() {
    console.log('Resetting all instrument keys to NULL...');

    // Update all stocks to have null instrumentKey
    const result = await prisma.stock.updateMany({
        data: {
            instrumentKey: null
        }
    });

    console.log(`Reset ${result.count} stocks.`);
}

resetKeys()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
