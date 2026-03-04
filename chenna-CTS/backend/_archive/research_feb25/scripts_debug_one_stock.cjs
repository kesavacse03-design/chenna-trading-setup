const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');

async function run() {
    try {
        console.log('Querying one stock...');
        const stocks = await prisma.$queryRaw`
            SELECT s.symbol, s.instrument_key, sc.added_date 
            FROM stock_categories sc
            JOIN stocks s ON sc.stock_id = s.id
            JOIN categories c ON sc.category_id = c.id
            WHERE c.key = 'SHORT_TERM_SWING_BO_UP'
            ORDER BY sc.added_date DESC
            OFFSET 100
            LIMIT 1
        `;

        if (stocks.length === 0) {
            console.log('No stocks found!');
            return;
        }

        const stock = stocks[0];
        console.log('Stock:', stock);

        const signalDate = new Date(stock.added_date);
        const startDate = new Date(signalDate);
        startDate.setDate(startDate.getDate() - 20);
        const endDate = new Date(signalDate);
        endDate.setDate(endDate.getDate() + 10);

        const today = new Date();
        if (endDate > today) endDate.setTime(today.getTime());

        console.log(`Fetching from ${startDate.toISOString()} to ${endDate.toISOString()}...`);

        const candles = await priceService.fetchPrice(
            stock.symbol,
            stock.instrument_key,
            startDate,
            endDate,
            '1day'
        );

        if (!candles) {
            console.log('Candles is null');
        } else {
            console.log(`Candles: ${candles.length}`);
            if (candles.length > 0) {
                console.log('First candle:', candles[0]);
                console.log('Last candle:', candles[candles.length - 1]);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
