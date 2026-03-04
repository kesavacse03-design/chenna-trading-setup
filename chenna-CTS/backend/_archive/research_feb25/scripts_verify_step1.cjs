const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    // CHECK 1.1
    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
    if (!cat) { console.log("CATEGORY NOT FOUND!"); return; }
    const count = await prisma.stockCategory.count({ where: { categoryId: cat.id } });
    console.log(`=== CHECK 1.1 ===`);
    console.log(`Stock Count: ${count}`);

    // CHECK 1.2
    const stocks = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true },
        take: 10
    });
    console.log(`\n=== CHECK 1.2: First 10 ===`);
    for (const s of stocks) {
        console.log(`${s.stock.symbol} | ${s.stock.instrumentKey || 'NULL'}`);
    }

    // CHECK 1.3
    const all = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });
    const valid = all.filter(s => s.stock.instrumentKey && s.stock.instrumentKey.startsWith('NSE_EQ|'));
    const nullK = all.filter(s => !s.stock.instrumentKey);
    console.log(`\n=== CHECK 1.3 ===`);
    console.log(`Valid: ${valid.length} / NULL: ${nullK.length}`);
    if (nullK.length > 0) console.log(`NULL: ${nullK.map(s => s.stock.symbol).join(', ')}`);

    // CHECK 2.1
    const cacheCount = await prisma.ohlcvCache.count({ where: { interval: 'day' } });
    console.log(`\n=== CHECK 2.1 ===`);
    console.log(`OHLCV cache records: ${cacheCount}`);

    // CHECK 2.2: Pick first stock, show data
    const sym = stocks[0].stock.symbol;
    const caches = await prisma.ohlcvCache.findMany({ where: { symbol: sym, interval: 'day' } });
    console.log(`\n=== CHECK 2.2: ${sym} ===`);
    if (caches.length === 0) {
        console.log(`NO DATA!`);
    } else {
        for (const c of caches) {
            const candles = c.data;
            console.log(`Record: ${candles.length} candles`);
            const last3 = candles.slice(-3);
            for (const cd of last3) {
                const dt = cd.timestamp ? cd.timestamp.split('T')[0] : 'N/A';
                console.log(`  ${dt} | O:${cd.open} H:${cd.high} L:${cd.low} C:${cd.close} V:${cd.volume || 0}`);
            }
        }
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
