/**
 * Check OhlcvCache Data (the actual price data source for backtesting)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOhlcvCache() {
    console.log('═'.repeat(70));
    console.log('OHLCV CACHE DATA REPORT');
    console.log('═'.repeat(70));

    // 1. Total cache entries
    const totalEntries = await prisma.ohlcvCache.count();
    console.log(`\n1. TOTAL CACHE ENTRIES: ${totalEntries}`);

    // 2. Sample entries showing date ranges
    console.log('\n2. SAMPLE CACHE ENTRIES (most recent):');
    console.log('-'.repeat(60));

    const sampleEntries = await prisma.ohlcvCache.findMany({
        select: {
            symbol: true,
            interval: true,
            fromDate: true,
            toDate: true,
            source: true
        },
        orderBy: { toDate: 'desc' },
        take: 20
    });

    console.log('Symbol           | Interval | From       | To         | Source');
    console.log('-'.repeat(60));
    for (const e of sampleEntries) {
        const from = e.fromDate.toISOString().split('T')[0];
        const to = e.toDate.toISOString().split('T')[0];
        console.log(`${e.symbol.substring(0, 16).padEnd(16)} | ${e.interval.padEnd(8)} | ${from} | ${to} | ${e.source}`);
    }

    // 3. Check data for specific symbols from backtest CSV
    console.log('\n3. DATA FOR SPECIFIC SYMBOLS (from backtest CSV):');
    console.log('-'.repeat(60));

    const symbols = ['TATASTEEL', 'ETERNAL', 'ONGC', 'IREDA', 'WIPRO', 'ITC', 'POWERGRI', 'JIOPIN', 'HOPIN'];

    for (const sym of symbols) {
        const entries = await prisma.ohlcvCache.findMany({
            where: { symbol: { contains: sym } },
            select: { symbol: true, fromDate: true, toDate: true, interval: true },
            take: 2
        });

        if (entries.length > 0) {
            for (const e of entries) {
                const from = e.fromDate.toISOString().split('T')[0];
                const to = e.toDate.toISOString().split('T')[0];
                console.log(`${e.symbol.substring(0, 25).padEnd(25)} | ${e.interval} | ${from} to ${to}`);
            }
        } else {
            console.log(`${sym.padEnd(25)} | NO DATA`);
        }
    }

    // 4. Check a specific entry's data content
    console.log('\n4. SAMPLE DATA CONTENT (first TATASTEEL entry):');
    console.log('-'.repeat(60));

    const tataSample = await prisma.ohlcvCache.findFirst({
        where: { symbol: { contains: 'TATASTEEL' } }
    });

    if (tataSample && tataSample.data) {
        const data = tataSample.data;
        console.log(`Symbol: ${tataSample.symbol}`);
        console.log(`Date range: ${tataSample.fromDate.toISOString().split('T')[0]} to ${tataSample.toDate.toISOString().split('T')[0]}`);
        console.log(`Total candles: ${Array.isArray(data) ? data.length : 'N/A'}`);

        if (Array.isArray(data) && data.length > 0) {
            console.log('\nFirst 5 candles:');
            for (const c of data.slice(0, 5)) {
                const ts = c.timestamp ? new Date(c.timestamp).toISOString().split('T')[0] : 'N/A';
                console.log(`  ${ts} | O:${c.open} H:${c.high} L:${c.low} C:${c.close}`);
            }
            console.log('\nLast 5 candles:');
            for (const c of data.slice(-5)) {
                const ts = c.timestamp ? new Date(c.timestamp).toISOString().split('T')[0] : 'N/A';
                console.log(`  ${ts} | O:${c.open} H:${c.high} L:${c.low} C:${c.close}`);
            }
        }
    } else {
        console.log('No TATASTEEL data found in cache');
    }

    // 5. PRE_MARKET stocks inventory
    console.log('\n5. PRE_MARKET STOCKS SUMMARY:');
    console.log('-'.repeat(60));

    try {
        const preMarketCategory = await prisma.category.findFirst({
            where: { key: 'PRE_MARKET' }
        });

        if (preMarketCategory) {
            const stocksWithDates = await prisma.stockCategory.findMany({
                where: { categoryId: preMarketCategory.id },
                include: { stock: true },
                orderBy: { addedDate: 'asc' }
            });

            console.log(`Total PRE_MARKET stocks: ${stocksWithDates.length}`);

            // Get date distribution
            const dateGroups = {};
            for (const s of stocksWithDates) {
                const date = s.addedDate ? s.addedDate.toISOString().split('T')[0] : 'NULL';
                dateGroups[date] = (dateGroups[date] || 0) + 1;
            }

            console.log('\nStocks added by date:');
            const dates = Object.entries(dateGroups).slice(0, 15);
            for (const [date, count] of dates) {
                console.log(`  ${date}: ${count} stocks`);
            }
            if (Object.keys(dateGroups).length > 15) {
                console.log(`  ... and ${Object.keys(dateGroups).length - 15} more dates`);
            }

            // Show earliest stock that has cache data
            console.log('\nFirst 5 PRE_MARKET stocks:');
            for (const s of stocksWithDates.slice(0, 5)) {
                const addedDate = s.addedDate ? s.addedDate.toISOString().split('T')[0] : 'N/A';
                console.log(`  ${s.stock?.symbol || 'N/A'} - Added: ${addedDate}`);
            }
        }
    } catch (e) {
        console.log('Error getting PRE_MARKET stocks:', e.message);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('END OF REPORT');
    console.log('═'.repeat(70));

    await prisma.$disconnect();
}

checkOhlcvCache().catch(console.error);
