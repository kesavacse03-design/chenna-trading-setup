const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    console.log('--- DB Queries for SHORT_TERM_SWING_BO_UP ---');

    const cat = await p.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) {
        console.log('Category SHORT_TERM_SWING_BO_UP not found in DB!');
        return process.exit(1);
    }

    // 1. Count distinct stocks
    const dist = await p.stockCategory.findMany({
        where: { categoryId: cat.id },
        distinct: ['stockId']
    });
    console.log(`Total Distinct Stocks in Category: ${dist.length}`);

    // 2. Recent additions
    const recent = await p.stockCategory.findMany({
        where: { categoryId: cat.id },
        orderBy: { addedDate: 'desc' },
        take: 10,
        include: { stock: true }
    });
    console.log(`\nRecent Additions:`);
    recent.forEach(r => console.log(`  ${r.stock?.symbol}: Added ${r.addedDate ? r.addedDate.toISOString().split('T')[0] : 'N/A'}`));

    // 3. TATATECH OHLCV Check
    console.log(`\n--- TATATECH OHLCV (Jan 5 - 15) ---`);
    const tatatech = await p.ohlcvCache.findFirst({
        where: { symbol: 'TATATECH', interval: 'day' },
        orderBy: { createdAt: 'desc' }
    });
    if (tatatech && tatatech.data && Array.isArray(tatatech.data)) {
        tatatech.data
            .filter(c => {
                const dt = c.date || c.timestamp || '';
                return dt >= '2026-01-05' && dt <= '2026-01-15';
            })
            .forEach(c => {
                const dt = c.date || c.timestamp || '';
                console.log(`  ${dt.split('T')[0]} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`);
            });
    } else {
        console.log('  No TATATECH cache data found or invalid format.');
    }

    // 4. PETRONET OHLCV Check
    console.log(`\n--- PETRONET OHLCV (Feb 15 - 25) ---`);
    const petronet = await p.ohlcvCache.findFirst({
        where: { symbol: 'PETRONET', interval: 'day' },
        orderBy: { createdAt: 'desc' }
    });
    if (petronet && petronet.data && Array.isArray(petronet.data)) {
        petronet.data
            .filter(c => {
                const dt = c.date || c.timestamp || '';
                return dt >= '2026-02-15' && dt <= '2026-02-25';
            })
            .forEach(c => {
                const dt = c.date || c.timestamp || '';
                console.log(`  ${dt.split('T')[0]} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`);
            });
    } else {
        console.log('  No PETRONET cache data found or invalid format.');
    }

    await p.$disconnect();
})();
