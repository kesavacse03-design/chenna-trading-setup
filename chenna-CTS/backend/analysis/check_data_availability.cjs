/**
 * Check data availability for PRE_MARKET analysis
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDataAvailability() {
    console.log('='.repeat(60));
    console.log('DATA AVAILABILITY CHECK FOR PRE_MARKET');
    console.log('='.repeat(60));

    // Check all intervals
    const intervals = ['1minute', '3minute', '5minute', '15minute', 'day'];

    for (const interval of intervals) {
        const count = await prisma.ohlcvCache.count({
            where: { interval }
        });
        console.log(`\n${interval}: ${count} cache entries`);

        if (count > 0) {
            // Get sample
            const sample = await prisma.ohlcvCache.findFirst({
                where: { interval },
                orderBy: { createdAt: 'desc' }
            });
            console.log(`  Latest: ${sample.symbol} (created: ${sample.createdAt})`);

            // Check data range
            let data = sample.data;
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            if (Array.isArray(data) && data.length > 0) {
                const first = new Date(data[0].timestamp || data[0][0]);
                const last = new Date(data[data.length - 1].timestamp || data[data.length - 1][0]);
                console.log(`  Data range: ${first.toISOString().split('T')[0]} to ${last.toISOString().split('T')[0]}`);
                console.log(`  Total candles: ${data.length}`);
            }
        }
    }

    // Check PRE_MARKET category stocks
    console.log('\n' + '='.repeat(60));
    console.log('PRE_MARKET CATEGORY STOCKS');
    console.log('='.repeat(60));

    const category = await prisma.category.findUnique({
        where: { key: 'PRE_MARKET' },
        include: {
            stocks: {
                include: { stock: true },
                take: 10
            }
        }
    });

    if (!category) {
        console.log('PRE_MARKET category not found!');
        return;
    }

    console.log(`\nTotal stocks in category: ${category.stocks.length}`);
    console.log('\nSample (first 10):');

    for (const sc of category.stocks.slice(0, 10)) {
        console.log(`  - ${sc.stock.symbol} (added: ${sc.addedDate})`);

        // Check if this stock has data
        const hasData = await prisma.ohlcvCache.findFirst({
            where: { symbol: sc.stock.symbol },
            select: { interval: true }
        });

        if (hasData) {
            console.log(`    Has ${hasData.interval} data`);
        } else {
            console.log(`    NO DATA CACHED`);
        }
    }

    // Check for daily candles that can be used for gap analysis
    console.log('\n' + '='.repeat(60));
    console.log('DAILY CANDLE DATA FOR PREMARKET STOCKS (for gap calc)');
    console.log('='.repeat(60));

    let stocksWithDaily = 0;
    let stocksWithIntraday = 0;

    for (const sc of category.stocks.slice(0, 50)) {
        const dailyCache = await prisma.ohlcvCache.findFirst({
            where: { symbol: sc.stock.symbol, interval: 'day' }
        });

        const intradayCache = await prisma.ohlcvCache.findFirst({
            where: {
                symbol: sc.stock.symbol,
                interval: { in: ['1minute', '5minute'] }
            }
        });

        if (dailyCache) stocksWithDaily++;
        if (intradayCache) stocksWithIntraday++;
    }

    console.log(`\nOf first 50 PRE_MARKET stocks:`);
    console.log(`  Have daily data: ${stocksWithDaily}`);
    console.log(`  Have intraday data (1m/5m): ${stocksWithIntraday}`);

    // Recommend approach
    console.log('\n' + '='.repeat(60));
    console.log('RECOMMENDATION');
    console.log('='.repeat(60));

    if (stocksWithIntraday === 0) {
        console.log('\n❌ No intraday data available for PRE_MARKET stocks.');
        console.log('   PRE_MARKET strategy requires 1-minute data for gap plays.');
        console.log('   Options:');
        console.log('   1. Fetch intraday data for PRE_MARKET stocks');
        console.log('   2. Use a different category with available data');
    } else {
        console.log(`\n✅ ${stocksWithIntraday} stocks have intraday data. Ready for analysis.`);
    }
}

checkDataAvailability()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
