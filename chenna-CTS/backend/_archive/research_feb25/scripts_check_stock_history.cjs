const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log('Checking StockCategory history...');

        const boost = await prisma.category.findUnique({
            where: { key: 'INTRADAY_BOOST' },
            include: { stocks: true }
        });

        if (!boost) {
            console.log('INTRADAY_BOOST category not found.');
            return;
        }

        console.log(`INTRADAY_BOOST has ${boost.stocks.length} stock entries.`);

        // Group by addedDate
        const counts = {};
        boost.stocks.forEach(s => {
            const d = s.addedDate.toISOString().split('T')[0];
            counts[d] = (counts[d] || 0) + 1;
        });

        console.log('Entries by Date:', counts);

        const lom = await prisma.category.findUnique({
            where: { key: 'UPSIDE_LOM_INTRA' },
            include: { stocks: true }
        });

        if (lom) {
            console.log(`UPSIDE_LOM_INTRA has ${lom.stocks.length} stock entries.`);
            const lcounts = {};
            lom.stocks.forEach(s => {
                const d = s.addedDate.toISOString().split('T')[0];
                lcounts[d] = (lcounts[d] || 0) + 1;
            });
            console.log('LOM Entries by Date:', lcounts);
        }

        await prisma.$disconnect();
    } catch (e) {
        console.error(e);
        await prisma.$disconnect();
    }
}

check();
