const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
    console.log('=== DEBUG: Checking 1-min data availability ===\n');

    // Check 1m cache records
    const oneM = await prisma.ohlcvCache.count({ where: { interval: '1m' } });
    console.log('1m cache records:', oneM);

    // Get sample of 1m symbols
    const sampleSymbols = await prisma.$queryRaw`
        SELECT DISTINCT symbol FROM ohlcv_cache WHERE interval = '1m' LIMIT 10
    `;
    console.log('\nSample 1m symbols:', sampleSymbols.map(s => s.symbol));

    // Check INTRADAY_BOOST category
    const cat = await prisma.category.findFirst({
        where: { key: 'INTRADAY_BOOST' },
        include: {
            stocks: {
                include: { stock: true },
                take: 10
            },
            _count: { select: { stocks: true } }
        }
    });

    console.log('\nCategory:', cat?.key);
    console.log('Total stocks in category:', cat?._count?.stocks);
    console.log('Sample category symbols:', cat?.stocks.slice(0, 5).map(sc => sc.stock?.symbol));

    // Check overlap
    const oneMinSymbols = new Set(sampleSymbols.map(s => s.symbol));
    const catSymbols = cat?.stocks.map(sc => sc.stock?.symbol).filter(Boolean) || [];
    const overlap = catSymbols.filter(s => oneMinSymbols.has(s));
    console.log('\nOverlap (sample):', overlap);

    // Get ALL 1m symbols to check overlap properly
    const all1mSymbols = await prisma.$queryRaw`
        SELECT DISTINCT symbol FROM ohlcv_cache WHERE interval = '1m'
    `;
    const all1mSet = new Set(all1mSymbols.map(s => s.symbol));
    console.log('\nTotal unique 1m symbols:', all1mSet.size);

    // Get all category stocks
    const fullCat = await prisma.category.findFirst({
        where: { key: 'INTRADAY_BOOST' },
        include: {
            stocks: {
                include: { stock: true }
            }
        }
    });

    const allCatSymbols = fullCat?.stocks.map(sc => sc.stock?.symbol).filter(Boolean) || [];
    const fullOverlap = allCatSymbols.filter(s => all1mSet.has(s));
    console.log('Category symbols with 1m data:', fullOverlap.length);
    console.log('Sample overlapping symbols:', fullOverlap.slice(0, 10));
}

debug()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
