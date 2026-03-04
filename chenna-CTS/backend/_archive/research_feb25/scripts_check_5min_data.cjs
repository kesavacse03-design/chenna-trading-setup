const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check5MinData() {
    console.log('='.repeat(60));
    console.log('TASK 1: Checking 5-Minute Data Availability');
    console.log('='.repeat(60));

    // Check what intervals we have
    const intervals = await prisma.$queryRaw`
        SELECT DISTINCT interval 
        FROM ohlcv_cache 
        WHERE symbol IN ('RELIANCE', 'TCS', 'INFY')
    `;
    console.log('\n📊 Available intervals:', intervals);

    // Check data for Jan 2026
    const janData = await prisma.$queryRaw`
        SELECT 
            symbol, 
            interval, 
            from_date::text, 
            to_date::text, 
            jsonb_array_length(data) as candle_count
        FROM ohlcv_cache 
        WHERE symbol IN ('RELIANCE', 'TCS', 'INFY')
          AND from_date >= '2026-01-02'
          AND to_date <= '2026-01-20'
        ORDER BY symbol, from_date
        LIMIT 20
    `;

    console.log('\n📅 Data for Jan 2-20, 2026:');
    if (janData.length === 0) {
        console.log('❌ NO DATA found for Jan 2-20, 2026');
    } else {
        console.table(janData);
    }

    // Check all available data for these symbols
    const allData = await prisma.$queryRaw`
        SELECT 
            symbol, 
            interval, 
            MIN(from_date)::text as earliest_date,
            MAX(to_date)::text as latest_date,
            COUNT(*) as record_count
        FROM ohlcv_cache 
        WHERE symbol IN ('RELIANCE', 'TCS', 'INFY')
        GROUP BY symbol, interval
        ORDER BY symbol, interval
    `;

    console.log('\n📈 Summary of all available data:');
    console.table(allData);

    // Check INTRADAY BOOST and HIGH POWERED categories
    const intradayCategories = await prisma.category.findMany({
        where: {
            key: {
                in: ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS', 'INTRADAY', 'HIGH_POWERED']
            }
        },
        include: {
            _count: { select: { stocks: true } }
        }
    });

    console.log('\n🏷️ Intraday-related categories:');
    intradayCategories.forEach(c => {
        console.log(`  - ${c.key}: ${c._count.stocks} stocks`);
    });

    // Check if we have ANY 5-minute data at all
    const fiveMinCheck = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM ohlcv_cache 
        WHERE interval IN ('5m', '5min', '5minute', '5')
    `;
    console.log('\n⏱️ Total 5-minute records in database:', fiveMinCheck[0]?.count || 0);

    console.log('\n' + '='.repeat(60));
    console.log('CONCLUSION:');
    console.log('='.repeat(60));

    const hasFiveMinData = Number(fiveMinCheck[0]?.count || 0) > 0;
    if (hasFiveMinData) {
        console.log('✅ 5-minute data EXISTS in database');
    } else {
        console.log('❌ NO 5-minute data found');
        console.log('   Need to import 5-min data for intraday strategy testing');
    }
}

check5MinData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
