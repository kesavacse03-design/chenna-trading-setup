const prisma = require('../lib/prisma.cjs');

async function findNifty() {
    // Top 5 nifty matches
    const stocks = await prisma.$queryRaw`
        SELECT symbol, instrument_key, name 
        FROM stocks 
        WHERE symbol LIKE '%NIFTY%' OR name LIKE '%NIFTY%'
        LIMIT 5
    `;

    console.log('FOUND:', stocks);
    await prisma.$disconnect();
}

findNifty().catch(console.error);
