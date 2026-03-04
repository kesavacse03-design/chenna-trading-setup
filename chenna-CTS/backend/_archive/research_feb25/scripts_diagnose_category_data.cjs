const prisma = require('../lib/prisma.cjs');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../results/diagnosis_report.txt');

async function diagnoseCategories() {
    const lines = [];
    const log = (msg) => { lines.push(msg); };

    log('====================================================');
    log('  STEP 1: CATEGORY INVENTORY (No API Needed)');
    log('====================================================');
    log('');

    const categoryCounts = await prisma.$queryRaw`
        SELECT 
            c.key as category,
            COUNT(*) as total_records,
            COUNT(DISTINCT s.symbol) as unique_symbols,
            MIN(sc.added_date) as earliest_date,
            MAX(sc.added_date) as latest_date
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        JOIN categories c ON sc.category_id = c.id
        WHERE c.key IN (
            'SHORT_TERM_SWING_BO_UP',
            'SHORT_TERM_SWING_BO_DOWN',
            'LONG_TERM_SWING_BO_UP',
            'LONG_TERM_SWING_BO_DOWN',
            'MULTI_RESISTANCE_BO',
            'MULTI_SUPPORT_BO'
        )
        GROUP BY c.key
        ORDER BY total_records DESC
    `;

    for (const row of categoryCounts) {
        const earliest = row.earliest_date ? new Date(row.earliest_date).toISOString().split('T')[0] : 'N/A';
        const latest = row.latest_date ? new Date(row.latest_date).toISOString().split('T')[0] : 'N/A';
        log(`${row.category}`);
        log(`  Total: ${row.total_records} | Unique: ${row.unique_symbols} | Range: ${earliest} to ${latest}`);
    }

    log('');
    log('====================================================');
    log('  STEP 2: OHLC CACHE AVAILABILITY');
    log('====================================================');
    log('');

    const ohlcStats = await prisma.$queryRaw`
        SELECT 
            COUNT(*) as total_cache_entries,
            COUNT(DISTINCT symbol) as symbols_with_data,
            MIN(from_date) as earliest_from,
            MAX(to_date) as latest_to
        FROM ohlcv_cache
        WHERE interval = 'day'
    `;

    for (const row of ohlcStats) {
        const ef = row.earliest_from ? new Date(row.earliest_from).toISOString().split('T')[0] : 'N/A';
        const lt = row.latest_to ? new Date(row.latest_to).toISOString().split('T')[0] : 'N/A';
        log(`Total Cache Entries: ${row.total_cache_entries}`);
        log(`Symbols with Data: ${row.symbols_with_data}`);
        log(`Date Range: ${ef} to ${lt}`);
    }

    log('');
    log('====================================================');
    log('  STEP 3: CROSS-CHECK (Categories vs OHLC Cache)');
    log('====================================================');
    log('');

    const crossCheck = await prisma.$queryRaw`
        SELECT 
            c.key as category,
            COUNT(DISTINCT s.symbol) as category_symbols,
            COUNT(DISTINCT CASE WHEN oc.symbol IS NOT NULL THEN s.symbol END) as has_ohlc_data
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        JOIN categories c ON sc.category_id = c.id
        LEFT JOIN ohlcv_cache oc ON s.symbol = oc.symbol AND oc.interval = 'day'
        WHERE c.key IN (
            'SHORT_TERM_SWING_BO_UP',
            'SHORT_TERM_SWING_BO_DOWN',
            'LONG_TERM_SWING_BO_UP',
            'LONG_TERM_SWING_BO_DOWN',
            'MULTI_RESISTANCE_BO',
            'MULTI_SUPPORT_BO'
        )
        GROUP BY c.key
        ORDER BY category_symbols DESC
    `;

    for (const row of crossCheck) {
        const pct = Number(row.category_symbols) > 0
            ? Math.round((Number(row.has_ohlc_data) / Number(row.category_symbols)) * 100)
            : 0;
        log(`${row.category}: ${row.has_ohlc_data}/${row.category_symbols} symbols have cache (${pct}%)`);
    }

    log('');
    log('====================================================');
    log('  STEP 4: SAMPLE CACHED DATA FORMAT');
    log('====================================================');
    log('');

    const sampleCache = await prisma.ohlcvCache.findFirst({
        where: { interval: 'day' },
        select: { symbol: true, fromDate: true, toDate: true, data: true },
        orderBy: { toDate: 'desc' }
    });

    if (sampleCache) {
        const dataArray = Array.isArray(sampleCache.data) ? sampleCache.data : [];
        log(`Sample Symbol: ${sampleCache.symbol}`);
        log(`  Range: ${sampleCache.fromDate?.toISOString().split('T')[0]} to ${sampleCache.toDate?.toISOString().split('T')[0]}`);
        log(`  Candles stored: ${dataArray.length}`);
        if (dataArray.length > 0) {
            log(`  Keys: ${Object.keys(dataArray[0]).join(', ')}`);
            log(`  First: ${JSON.stringify(dataArray[0])}`);
            log(`  Last:  ${JSON.stringify(dataArray[dataArray.length - 1])}`);
        }
    } else {
        log('  NO cached OHLC data found!');
    }

    log('');
    log('====================================================');
    log('  STEP 5: OHLC COVERAGE DEPTH PER CATEGORY (>7 days ago)');
    log('====================================================');
    log('');

    const cats = ['SHORT_TERM_SWING_BO_UP', 'LONG_TERM_SWING_BO_DOWN', 'LONG_TERM_SWING_BO_UP', 'MULTI_RESISTANCE_BO', 'MULTI_SUPPORT_BO'];
    for (const cat of cats) {
        const coverage = await prisma.$queryRaw`
            SELECT 
                COUNT(DISTINCT s.symbol) as total_symbols,
                COUNT(DISTINCT CASE WHEN oc.id IS NOT NULL THEN s.symbol END) as with_cache,
                COALESCE(SUM(CASE WHEN oc.id IS NOT NULL THEN 1 ELSE 0 END), 0) as cache_entries
            FROM stock_categories sc
            JOIN stocks s ON sc.stock_id = s.id
            JOIN categories c ON sc.category_id = c.id
            LEFT JOIN ohlcv_cache oc ON s.symbol = oc.symbol AND oc.interval = 'day'
            WHERE c.key = ${cat}
              AND sc.added_date < NOW() - INTERVAL '7 days'
        `;
        const r = coverage[0];
        log(`${cat}: ${r.with_cache}/${r.total_symbols} symbols have cache (${r.cache_entries} entries)`);
    }

    log('');
    log('====================================================');
    log('  DIAGNOSIS COMPLETE');
    log('====================================================');

    const report = lines.join('\n');
    fs.writeFileSync(OUT, report, 'utf8');
    console.log(`Report saved to: ${OUT}`);
    console.log(report);
}

diagnoseCategories()
    .catch(err => console.error('ERROR:', err.message))
    .finally(() => prisma.$disconnect());
