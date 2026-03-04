const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDataStatus() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   DATA STATUS CHECK FOR OPTIMIZATION            ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // Check LONGTERM SWING BO UP stocks
    const category = 'LONGTERM SWING BO UP';

    const stocks = await prisma.stock.findMany({
        where: { category },
        include: {
            _count: {
                select: { candles: true }
            }
        }
    });

    console.log(`Category: ${category}`);
    console.log(`Total stocks: ${stocks.length}\n`);

    let stocksWithData = 0;
    let totalCandles = 0;

    stocks.slice(0, 10).forEach(stock => {
        const candleCount = stock._count.candles;
        if (candleCount > 0) stocksWithData++;
        totalCandles += candleCount;
        console.log(`  ${stock.symbol.padEnd(20)} - ${candleCount} candles`);
    });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Stocks with candle data: ${stocksWithData}/${stocks.length}`);
    console.log(`Total candles: ${totalCandles}`);
    console.log(`Average candles per stock: ${(totalCandles / stocks.length).toFixed(0)}`);

    // Check date range
    if (totalCandles > 0) {
        const oldestCandle = await prisma.candle.findFirst({
            orderBy: { date: 'asc' },
            where: {
                stock: { category }
            }
        });

        const newestCandle = await prisma.candle.findFirst({
            orderBy: { date: 'desc' },
            where: {
                stock: { category }
            }
        });

        console.log(`\nDate range: ${oldestCandle?.date} to ${newestCandle?.date}`);
    }

    await prisma.$disconnect();
}

checkDataStatus().catch(console.error);
