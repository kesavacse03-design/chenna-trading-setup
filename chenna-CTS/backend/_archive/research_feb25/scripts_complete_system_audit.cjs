// COMPLETE SYSTEM AUDIT SCRIPT
// Run: node scripts/complete_system_audit.cjs

const { PrismaClient } = require('@prisma/client');

async function runCompleteAudit() {
    const prisma = new PrismaClient();

    console.log('═'.repeat(70));
    console.log('COMPLETE SYSTEM AUDIT REPORT');
    console.log('Date:', new Date().toISOString().slice(0, 19));
    console.log('═'.repeat(70));

    try {
        // ═══════════════════════════════════════════════════════════════
        // AUDIT 1: CHECK ALL CATEGORY DATA IN DATABASE
        // ═══════════════════════════════════════════════════════════════
        console.log('\n\n' + '═'.repeat(70));
        console.log('AUDIT 1: CATEGORY DATA STATUS');
        console.log('═'.repeat(70));

        const categories = [
            'PRE_MARKET',
            'INTRADAY_BOOST',
            'HIGH_POWERED_STOCKS',
            'UPSIDE_LOM_INTRA',
            'DOWNSIDE_LOM_INTRA',
            'DAILY_CONTRACTION',
            'MULTI_RESISTANCE_BO',
            'MULTI_SUPPORT_BO',
            'UPSIDE_LOM_SWING',
            'DOWNSIDE_LOM_SWING',
            'SHORT_TERM_SWING_BO_UP',
            'SHORT_TERM_SWING_BO_DOWN',
            'LONG_TERM_SWING_BO_UP',
            'LONG_TERM_SWING_BO_DOWN',
            'LONG_TERM_BO_UP'
        ];

        let totalStocks = 0;
        let categoriesWithData = 0;
        let categoriesEmpty = 0;

        for (const catKey of categories) {
            // Find category in database
            const category = await prisma.category.findFirst({
                where: { key: catKey }
            });

            if (!category) {
                console.log(`\n${catKey}:`);
                console.log(`  ⚠️ CATEGORY NOT FOUND IN DATABASE`);
                categoriesEmpty++;
                continue;
            }

            // Count stocks
            const count = await prisma.stockCategory.count({
                where: { categoryId: category.id }
            });

            // Get date range
            const entries = await prisma.stockCategory.findMany({
                where: { categoryId: category.id },
                select: { addedDate: true },
                orderBy: { addedDate: 'asc' }
            });

            const minDate = entries.length > 0 && entries[0].addedDate
                ? entries[0].addedDate.toISOString().slice(0, 10) : 'N/A';
            const maxDate = entries.length > 0 && entries[entries.length - 1].addedDate
                ? entries[entries.length - 1].addedDate.toISOString().slice(0, 10) : 'N/A';

            // Get unique dates
            const uniqueDates = new Set();
            entries.forEach(e => {
                if (e.addedDate) uniqueDates.add(e.addedDate.toISOString().slice(0, 10));
            });

            console.log(`\n${catKey}:`);
            console.log(`  Stocks: ${count}`);
            console.log(`  Unique dates: ${uniqueDates.size}`);
            console.log(`  Date range: ${minDate} to ${maxDate}`);

            if (count > 0) {
                categoriesWithData++;
                totalStocks += count;
            } else {
                categoriesEmpty++;
            }
        }

        console.log('\n' + '-'.repeat(50));
        console.log(`SUMMARY:`);
        console.log(`  Total stock entries: ${totalStocks}`);
        console.log(`  Categories with data: ${categoriesWithData}/${categories.length}`);
        console.log(`  Categories EMPTY: ${categoriesEmpty}/${categories.length}`);

        // ═══════════════════════════════════════════════════════════════
        // AUDIT 2: CHECK OHLC DATA SOURCE
        // ═══════════════════════════════════════════════════════════════
        console.log('\n\n' + '═'.repeat(70));
        console.log('AUDIT 2: OHLC DATA STATUS');
        console.log('═'.repeat(70));

        // Check if OhlcCandle table exists and has data
        let ohlcCount = 0;
        let ohlcMinDate = 'N/A';
        let ohlcMaxDate = 'N/A';

        try {
            const ohlcEntries = await prisma.ohlcCandle.findMany({
                select: { timestamp: true },
                orderBy: { timestamp: 'asc' },
                take: 1
            });

            const ohlcEntriesMax = await prisma.ohlcCandle.findMany({
                select: { timestamp: true },
                orderBy: { timestamp: 'desc' },
                take: 1
            });

            ohlcCount = await prisma.ohlcCandle.count();

            if (ohlcEntries.length > 0) {
                ohlcMinDate = ohlcEntries[0].timestamp.toISOString().slice(0, 10);
            }
            if (ohlcEntriesMax.length > 0) {
                ohlcMaxDate = ohlcEntriesMax[0].timestamp.toISOString().slice(0, 10);
            }

            console.log(`Total OHLC candles in database: ${ohlcCount}`);
            console.log(`Date range: ${ohlcMinDate} to ${ohlcMaxDate}`);

            // Check intervals
            const intervals = await prisma.$queryRaw`
        SELECT interval, COUNT(*) as count
        FROM "OhlcCandle"
        GROUP BY interval
      `;

            console.log('\nBy Interval:');
            for (const row of intervals) {
                console.log(`  ${row.interval}: ${row.count} candles`);
            }

        } catch (e) {
            console.log(`⚠️ OhlcCandle table error: ${e.message}`);
            console.log('This means OHLC data is NOT stored in database.');
            console.log('Backtest fetches directly from Upstox API with caching.');
        }

        // ═══════════════════════════════════════════════════════════════
        // AUDIT 3: CHECK CACHE STATUS (if OHLC is cached differently)
        // ═══════════════════════════════════════════════════════════════
        console.log('\n\n' + '═'.repeat(70));
        console.log('AUDIT 3: CACHE STATUS');
        console.log('═'.repeat(70));

        try {
            const cacheCount = await prisma.priceCache.count();
            console.log(`PriceCache entries: ${cacheCount}`);

            if (cacheCount > 0) {
                const cacheMin = await prisma.priceCache.findFirst({ orderBy: { startDate: 'asc' } });
                const cacheMax = await prisma.priceCache.findFirst({ orderBy: { endDate: 'desc' } });
                console.log(`Cache date range: ${cacheMin?.startDate?.toISOString()?.slice(0, 10) || 'N/A'} to ${cacheMax?.endDate?.toISOString()?.slice(0, 10) || 'N/A'}`);

                // Sample symbols
                const symbols = await prisma.priceCache.groupBy({
                    by: ['symbol'],
                    _count: true
                });
                console.log(`\nUnique symbols cached: ${symbols.length}`);
                console.log('Sample symbols:', symbols.slice(0, 10).map(s => s.symbol).join(', '));
            }
        } catch (e) {
            console.log(`PriceCache: ${e.message}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // AUDIT 4: VERIFY A SPECIFIC TRADE - TATASTEEL 2025-12-01
        // ═══════════════════════════════════════════════════════════════
        console.log('\n\n' + '═'.repeat(70));
        console.log('AUDIT 4: TRADE VERIFICATION - TATASTEEL 2025-12-01');
        console.log('═'.repeat(70));

        // Check if TATASTEEL exists in our stocks
        const tataStock = await prisma.stock.findFirst({
            where: { symbol: { contains: 'TATASTEEL' } }
        });

        console.log(`\nTATASTEEL in stocks table: ${tataStock ? 'YES' : 'NO'}`);
        if (tataStock) {
            console.log(`  Symbol: ${tataStock.symbol}`);
            console.log(`  Name: ${tataStock.name}`);
            console.log(`  Instrument Key: ${tataStock.instrumentKey}`);
        }

        // Check OHLC data for that date
        try {
            const tataCandles = await prisma.ohlcCandle.findMany({
                where: {
                    symbol: { contains: 'TATASTEEL' },
                    timestamp: {
                        gte: new Date('2025-12-01T00:00:00'),
                        lte: new Date('2025-12-01T23:59:59')
                    }
                },
                orderBy: { timestamp: 'asc' }
            });

            console.log(`\nOHLC candles for 2025-12-01: ${tataCandles.length}`);
            if (tataCandles.length > 0) {
                console.log('First candle:');
                console.log(`  Open: ${tataCandles[0].open}`);
                console.log(`  High: ${tataCandles[0].high}`);
                console.log(`  Low: ${tataCandles[0].low}`);
                console.log(`  Close: ${tataCandles[0].close}`);
                console.log(`  Interval: ${tataCandles[0].interval}`);
            }
        } catch (e) {
            console.log(`OHLC query failed: ${e.message}`);
        }

        // Check PriceCache for TATASTEEL
        try {
            const tataCaches = await prisma.priceCache.findMany({
                where: {
                    symbol: { contains: 'TATASTEEL' }
                },
                orderBy: { endDate: 'desc' },
                take: 5
            });

            console.log(`\nPriceCache entries for TATASTEEL: ${tataCaches.length}`);
            for (const cache of tataCaches) {
                console.log(`  ${cache.startDate?.toISOString()?.slice(0, 10)} to ${cache.endDate?.toISOString()?.slice(0, 10)} - ${cache.candles?.length || 0} candles`);
            }

            // Look for Dec 1 data
            const dec1Cache = tataCaches.find(c => {
                const start = c.startDate ? new Date(c.startDate) : null;
                const end = c.endDate ? new Date(c.endDate) : null;
                const dec1 = new Date('2025-12-01');
                return start && end && start <= dec1 && end >= dec1;
            });

            if (dec1Cache && dec1Cache.candles) {
                console.log('\n✅ Found cache containing Dec 1, 2025:');
                const candles = Array.isArray(dec1Cache.candles) ? dec1Cache.candles : JSON.parse(dec1Cache.candles);
                const dec1Candle = candles.find(c => {
                    const ts = new Date(c.timestamp || c.time);
                    return ts.toISOString().slice(0, 10) === '2025-12-01';
                });

                if (dec1Candle) {
                    console.log('  Dec 1 Daily Candle:');
                    console.log(`    Open: ${dec1Candle.open}`);
                    console.log(`    High: ${dec1Candle.high}`);
                    console.log(`    Low: ${dec1Candle.low}`);
                    console.log(`    Close: ${dec1Candle.close}`);
                    console.log('\n  Expected from CSV: Entry 168.98, Exit 163.91');
                    console.log('  Does this match? Let\'s check if low reached 163.91...');
                    if (dec1Candle.low && dec1Candle.low <= 163.91) {
                        console.log('  ✅ Low price matches or below exit price');
                    } else {
                        console.log(`  ⚠️ Low was ${dec1Candle.low}, exit price was 163.91`);
                    }
                }
            }
        } catch (e) {
            console.log(`PriceCache query failed: ${e.message}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // AUDIT 5: ALL STRATEGIES IN DATABASE
        // ═══════════════════════════════════════════════════════════════
        console.log('\n\n' + '═'.repeat(70));
        console.log('AUDIT 5: STRATEGIES IN DATABASE');
        console.log('═'.repeat(70));

        try {
            const strategies = await prisma.strategyRun.findMany({
                select: {
                    id: true,
                    categoryKey: true,
                    version: true,
                    status: true,
                    runDate: true
                },
                orderBy: { runDate: 'desc' },
                take: 20
            });

            console.log(`Recent strategy runs: ${strategies.length}`);
            for (const s of strategies) {
                console.log(`  ${s.runDate?.toISOString()?.slice(0, 10) || 'N/A'} - ${s.categoryKey} - v${s.version} - ${s.status}`);
            }
        } catch (e) {
            console.log(`Strategy query: ${e.message}`);
        }

    } finally {
        await prisma.$disconnect();
    }

    console.log('\n\n' + '═'.repeat(70));
    console.log('AUDIT COMPLETE');
    console.log('═'.repeat(70));
}

runCompleteAudit().catch(console.error);
