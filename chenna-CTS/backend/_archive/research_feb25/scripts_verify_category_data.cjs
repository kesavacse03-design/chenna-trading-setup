const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');

async function verify() {
    const categoryKey = 'SHORT_TERM_SWING_BO_DOWN';
    console.log(`Verifying category: ${categoryKey}`);

    const category = await prisma.category.findUnique({
        where: { key: categoryKey },
        include: { stocks: { include: { stock: true } } }
    });

    if (!category) {
        console.log('Category not found!');
        return;
    }

    console.log(`Stocks in category: ${category.stocks.length}`);

    if (category.stocks.length === 0) {
        console.log('No stocks in category.');
        return;
    }

    // Check first 3 stocks
    for (let i = 0; i < Math.min(3, category.stocks.length); i++) {
        const s = category.stocks[i].stock;
        console.log(`\nStock: ${s.symbol}, InstrumentKey: ${s.instrumentKey}`);

        if (!s.instrumentKey) {
            console.log('Missing instrument key!');
            continue;
        }

        try {
            const data = await priceService.fetchPrice(s.symbol, s.instrumentKey, '2024-01-01', '2024-01-10');
            console.log(`Fetched data points: ${data ? data.length : 0}`);
            if (data && data.length > 0) {
                console.log(`First candle: ${JSON.stringify(data[0])}`);
            }
        } catch (e) {
            console.log(`Error fetching price: ${e.message}`);
        }
    }
}

verify()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
