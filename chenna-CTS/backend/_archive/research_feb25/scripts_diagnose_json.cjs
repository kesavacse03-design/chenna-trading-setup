const prisma = require('../lib/prisma.cjs');
const fs = require('fs');
const path = require('path');

async function run() {
    const result = {};

    // 1. Category counts
    result.categories = await prisma.$queryRaw`
        SELECT c.key as category, COUNT(*)::int as total, COUNT(DISTINCT s.symbol)::int as unique_symbols,
               MIN(sc.added_date)::text as earliest, MAX(sc.added_date)::text as latest
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        JOIN categories c ON sc.category_id = c.id
        WHERE c.key IN ('SHORT_TERM_SWING_BO_UP','SHORT_TERM_SWING_BO_DOWN','LONG_TERM_SWING_BO_UP','LONG_TERM_SWING_BO_DOWN','MULTI_RESISTANCE_BO','MULTI_SUPPORT_BO')
        GROUP BY c.key ORDER BY total DESC
    `;

    // 2. OHLC cache stats
    result.ohlc = await prisma.$queryRaw`
        SELECT COUNT(*)::int as entries, COUNT(DISTINCT symbol)::int as symbols,
               MIN(from_date)::text as earliest, MAX(to_date)::text as latest
        FROM ohlcv_cache WHERE interval = 'day'
    `;

    // 3. Cross-check
    result.crosscheck = await prisma.$queryRaw`
        SELECT c.key as category, COUNT(DISTINCT s.symbol)::int as cat_symbols,
               COUNT(DISTINCT CASE WHEN oc.symbol IS NOT NULL THEN s.symbol END)::int as has_ohlc
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        JOIN categories c ON sc.category_id = c.id
        LEFT JOIN ohlcv_cache oc ON s.symbol = oc.symbol AND oc.interval = 'day'
        WHERE c.key IN ('SHORT_TERM_SWING_BO_UP','SHORT_TERM_SWING_BO_DOWN','LONG_TERM_SWING_BO_UP','LONG_TERM_SWING_BO_DOWN','MULTI_RESISTANCE_BO','MULTI_SUPPORT_BO')
        GROUP BY c.key ORDER BY cat_symbols DESC
    `;

    // 4. Sample cached data
    const sample = await prisma.ohlcvCache.findFirst({
        where: { interval: 'day' },
        select: { symbol: true, fromDate: true, toDate: true, data: true },
        orderBy: { toDate: 'desc' }
    });
    if (sample) {
        const d = Array.isArray(sample.data) ? sample.data : [];
        result.sample = {
            symbol: sample.symbol,
            from: sample.fromDate, to: sample.toDate,
            candleCount: d.length,
            keys: d.length > 0 ? Object.keys(d[0]) : [],
            first: d[0] || null,
            last: d[d.length - 1] || null
        };
    }

    // 5. Coverage per category (>7 days old for analysis)
    result.coverage = [];
    for (const cat of ['SHORT_TERM_SWING_BO_UP', 'LONG_TERM_SWING_BO_DOWN', 'LONG_TERM_SWING_BO_UP', 'MULTI_RESISTANCE_BO', 'MULTI_SUPPORT_BO']) {
        const c = await prisma.$queryRaw`
            SELECT COUNT(DISTINCT s.symbol)::int as total,
                   COUNT(DISTINCT CASE WHEN oc.id IS NOT NULL THEN s.symbol END)::int as with_cache
            FROM stock_categories sc
            JOIN stocks s ON sc.stock_id = s.id
            JOIN categories c ON sc.category_id = c.id
            LEFT JOIN ohlcv_cache oc ON s.symbol = oc.symbol AND oc.interval = 'day'
            WHERE c.key = ${cat} AND sc.added_date < NOW() - INTERVAL '7 days'
        `;
        result.coverage.push({ category: cat, ...c[0] });
    }

    const outPath = path.join(__dirname, '../results/diagnosis.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log('SAVED: ' + outPath);
    await prisma.$disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });
