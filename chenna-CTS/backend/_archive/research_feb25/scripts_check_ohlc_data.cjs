/**
 * Check OHLC Data Availability
 * Investigate what data exists for backtesting
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOHLCData() {
    console.log('═'.repeat(70));
    console.log('OHLC DATA AVAILABILITY REPORT');
    console.log('═'.repeat(70));

    // 1. Check all intervals in database
    console.log('\n1. ALL INTERVALS IN DATABASE:');
    console.log('-'.repeat(50));

    try {
        const intervals = await prisma.$queryRaw`
            SELECT interval, COUNT(*) as count
            FROM "OhlcCandle"
            GROUP BY interval
            ORDER BY count DESC
        `;

        for (const row of intervals) {
            console.log(`${row.interval}: ${row.count} candles`);
        }
    } catch (e) {
        console.log('Error querying intervals:', e.message);
    }

    // 2. Check 1-minute candle data by date (most recent)
    console.log('\n2. ONE-MINUTE CANDLE DATA BY DATE (Last 30 dates):');
    console.log('-'.repeat(50));

    try {
        const intradayByDate = await prisma.$queryRaw`
            SELECT 
                DATE(timestamp) as date,
                COUNT(DISTINCT symbol) as stocks,
                COUNT(*) as candles
            FROM "OhlcCandle"
            WHERE interval = '1minute'
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
            LIMIT 30
        `;

        if (intradayByDate.length === 0) {
            console.log('NO 1-MINUTE DATA FOUND!');
        } else {
            console.log('Date       | Stocks | Candles');
            console.log('-'.repeat(35));
            for (const row of intradayByDate) {
                const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date;
                console.log(`${dateStr} | ${String(row.stocks).padStart(6)} | ${row.candles}`);
            }
        }
    } catch (e) {
        console.log('Error querying 1-minute data:', e.message);
    }

    // 3. Check daily candle data summary
    console.log('\n3. DAILY CANDLE DATA SUMMARY:');
    console.log('-'.repeat(50));

    try {
        const dailySummary = await prisma.$queryRaw`
            SELECT 
                interval,
                MIN(DATE(timestamp)) as earliest,
                MAX(DATE(timestamp)) as latest,
                COUNT(DISTINCT symbol) as stocks,
                COUNT(*) as total_candles
            FROM "OhlcCandle"
            WHERE interval IN ('day', '1day', 'daily', '1d')
            GROUP BY interval
        `;

        if (dailySummary.length === 0) {
            console.log('NO DAILY DATA FOUND!');
        } else {
            for (const row of dailySummary) {
                const earliest = row.earliest instanceof Date ? row.earliest.toISOString().split('T')[0] : row.earliest;
                const latest = row.latest instanceof Date ? row.latest.toISOString().split('T')[0] : row.latest;
                console.log(`Interval: ${row.interval}`);
                console.log(`  Earliest: ${earliest}`);
                console.log(`  Latest: ${latest}`);
                console.log(`  Stocks: ${row.stocks}`);
                console.log(`  Candles: ${row.total_candles}`);
            }
        }
    } catch (e) {
        console.log('Error querying daily data:', e.message);
    }

    // 4. Check specific dates from backtest CSV
    console.log('\n4. DATA FOR SPECIFIC DATES (from backtest CSV):');
    console.log('-'.repeat(50));

    const checkDates = [
        '2025-01-02',  // First date in CSV
        '2025-01-06',  // Another date in CSV
        '2025-10-29',  // When PRE_MARKET stocks started
        '2026-01-07',  // Recent date
        '2026-01-15',  // Recent date
        '2026-02-03',  // Today
    ];

    for (const date of checkDates) {
        try {
            const oneMinCount = await prisma.ohlcCandle.count({
                where: {
                    interval: '1minute',
                    timestamp: {
                        gte: new Date(date + 'T00:00:00Z'),
                        lte: new Date(date + 'T23:59:59Z')
                    }
                }
            });

            const dailyCount = await prisma.ohlcCandle.count({
                where: {
                    interval: { in: ['day', '1day', 'daily', '1d'] },
                    timestamp: {
                        gte: new Date(date + 'T00:00:00Z'),
                        lte: new Date(date + 'T23:59:59Z')
                    }
                }
            });

            console.log(`${date}: 1-min=${oneMinCount.toString().padStart(6)}, daily=${dailyCount}`);
        } catch (e) {
            console.log(`${date}: Error - ${e.message}`);
        }
    }

    // 5. Check PRE_MARKET category stocks dates
    console.log('\n5. PRE_MARKET STOCKS DATE DISTRIBUTION:');
    console.log('-'.repeat(50));

    try {
        // First check if CategoryStock table exists and has categoryKey
        const premarketCount = await prisma.stockCategory.count({
            where: {
                category: {
                    key: 'PRE_MARKET'
                }
            }
        });
        console.log(`Total PRE_MARKET stocks: ${premarketCount}`);

        // Get date distribution
        const premarketStocks = await prisma.stockCategory.findMany({
            where: {
                category: {
                    key: 'PRE_MARKET'
                }
            },
            select: {
                addedDate: true
            },
            orderBy: {
                addedDate: 'asc'
            }
        });

        // Group by date
        const dateGroups = {};
        for (const s of premarketStocks) {
            const dateStr = s.addedDate ? s.addedDate.toISOString().split('T')[0] : 'NULL';
            dateGroups[dateStr] = (dateGroups[dateStr] || 0) + 1;
        }

        console.log('Date       | Stocks Added');
        console.log('-'.repeat(25));
        for (const [date, count] of Object.entries(dateGroups).slice(0, 20)) {
            console.log(`${date} | ${count}`);
        }
    } catch (e) {
        console.log('Error querying PRE_MARKET stocks:', e.message);
    }

    // 6. Sample: Check TATASTEEL data
    console.log('\n6. SAMPLE STOCK DATA (TATASTEEL on 2025-01-02):');
    console.log('-'.repeat(50));

    try {
        const tataSample = await prisma.ohlcCandle.findMany({
            where: {
                symbol: { contains: 'TATASTEEL' },
                timestamp: {
                    gte: new Date('2025-01-02T00:00:00Z'),
                    lte: new Date('2025-01-02T23:59:59Z')
                }
            },
            take: 10
        });

        if (tataSample.length === 0) {
            console.log('No TATASTEEL data found for 2025-01-02');
        } else {
            console.log(`Found ${tataSample.length} candles`);
            for (const c of tataSample.slice(0, 5)) {
                console.log(`${c.timestamp.toISOString().slice(0, 16)} | ${c.interval} | O:${c.open} H:${c.high} L:${c.low} C:${c.close}`);
            }
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    // 7. Check most recent TATASTEEL data
    console.log('\n7. MOST RECENT TATASTEEL DATA:');
    console.log('-'.repeat(50));

    try {
        const tataRecent = await prisma.ohlcCandle.findMany({
            where: {
                symbol: { contains: 'TATASTEEL' }
            },
            orderBy: { timestamp: 'desc' },
            take: 5
        });

        if (tataRecent.length === 0) {
            console.log('No TATASTEEL data found');
        } else {
            for (const c of tataRecent) {
                console.log(`${c.timestamp.toISOString().slice(0, 16)} | ${c.interval} | O:${c.open} H:${c.high} L:${c.low} C:${c.close}`);
            }
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('END OF REPORT');
    console.log('═'.repeat(70));

    await prisma.$disconnect();
}

checkOHLCData().catch(console.error);
