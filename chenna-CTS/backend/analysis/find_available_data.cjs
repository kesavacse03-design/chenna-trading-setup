/**
 * Find categories with available data for analysis
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findAvailableData() {
    console.log('='.repeat(60));
    console.log('FINDING CATEGORIES WITH AVAILABLE DATA');
    console.log('='.repeat(60));

    // Get all categories
    const categories = await prisma.category.findMany({
        include: {
            _count: { select: { stocks: true } }
        }
    });

    console.log(`\nTotal categories: ${categories.length}`);

    // Get all cached symbols with daily data
    const dailyCaches = await prisma.ohlcvCache.findMany({
        where: { interval: 'day' },
        select: { symbol: true }
    });
    const symbolsWithDailyData = new Set(dailyCaches.map(c => c.symbol));
    console.log(`\nSymbols with daily data: ${symbolsWithDailyData.size}`);

    // Check each category
    console.log('\n' + '-'.repeat(60));
    console.log('CATEGORY DATA COVERAGE:');
    console.log('-'.repeat(60));

    const categoryReport = [];

    for (const cat of categories) {
        const stocksInCategory = await prisma.categoryStock.findMany({
            where: { categoryId: cat.id },
            include: { stock: true }
        });

        let withData = 0;
        for (const cs of stocksInCategory) {
            if (symbolsWithDailyData.has(cs.stock.symbol)) withData++;
        }

        const coverage = stocksInCategory.length > 0
            ? ((withData / stocksInCategory.length) * 100).toFixed(0)
            : 0;

        categoryReport.push({
            key: cat.key,
            name: cat.name,
            totalStocks: stocksInCategory.length,
            withData,
            coverage: coverage + '%'
        });

        console.log(`${cat.key}: ${withData}/${stocksInCategory.length} have data (${coverage}%)`);
    }

    // Find categories with good coverage (>50%)
    console.log('\n' + '='.repeat(60));
    console.log('CATEGORIES READY FOR ANALYSIS (>50% coverage):');
    console.log('='.repeat(60));

    const ready = categoryReport.filter(c => parseInt(c.coverage) >= 50 && c.withData >= 5);
    for (const c of ready.sort((a, b) => b.withData - a.withData)) {
        console.log(`  ✅ ${c.key}: ${c.withData} stocks with data`);
    }

    // Check date range of daily data
    console.log('\n' + '='.repeat(60));
    console.log('DAILY DATA DATE RANGE (sample):');
    console.log('='.repeat(60));

    const sample = await prisma.ohlcvCache.findFirst({
        where: { interval: 'day' },
        orderBy: { createdAt: 'desc' }
    });

    if (sample && sample.data) {
        let data = typeof sample.data === 'string' ? JSON.parse(sample.data) : sample.data;
        if (data.length > 0) {
            data.sort((a, b) => new Date(a.timestamp || a[0]) - new Date(b.timestamp || b[0]));
            const first = new Date(data[0].timestamp || data[0][0]);
            const last = new Date(data[data.length - 1].timestamp || data[data.length - 1][0]);
            console.log(`\nSample: ${sample.symbol}`);
            console.log(`Date range: ${first.toISOString().split('T')[0]} to ${last.toISOString().split('T')[0]}`);
            console.log(`Total candles: ${data.length}`);
        }
    }

    // Recommendation
    console.log('\n' + '='.repeat(60));
    console.log('RECOMMENDATION');
    console.log('='.repeat(60));

    if (ready.length > 0) {
        const best = ready[0];
        console.log(`\n✅ Use category: ${best.key}`);
        console.log(`   Has ${best.withData} stocks with daily data`);
        console.log('   Daily-based strategies work: MULTI_RESISTANCE_BO, DAILY_CONTRACTION, etc.');
    } else {
        console.log('\n❌ No categories have sufficient data coverage for analysis.');
    }

    console.log('\n⚠️  For PRE_MARKET (gap up short), need intraday data.');
    console.log('   Intraday data not available - fetch it or analyze daily strategies first.');
}

findAvailableData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
