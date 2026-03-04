/**
 * Quick diagnostic: which IB stocks for today have fresh cache data?
 * Then clean old signals, restart, and run confirmation pipeline.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');
const path = require('path');

const CACHE_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DAY = path.join(__dirname, '../cache/day');
const TODAY = '2026-02-27';

(async () => {
    // 1. Get today's IB stocks
    const ibStocks = await p.$queryRaw`
        SELECT s.symbol FROM "stock_categories" sc
        JOIN "stocks" s ON sc."stock_id" = s.id
        WHERE sc."category_id" = (SELECT id FROM "categories" WHERE key = 'INTRADAY_BOOST')
        AND sc."added_date" >= '2026-02-27'::date AND sc."added_date" < '2026-02-28'::date
    `;

    let cached30m = 0, cachedDay = 0, hasToday30m = 0;
    const ready = [];

    for (const s of ibStocks) {
        const cleanKey = s.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
        const p30 = path.join(CACHE_30M, `${cleanKey}_master.json`);
        const pDay = path.join(CACHE_DAY, `${cleanKey}_master.json`);

        const has30m = fs.existsSync(p30);
        const hasDay = fs.existsSync(pDay);
        if (has30m) cached30m++;
        if (hasDay) cachedDay++;

        if (has30m) {
            const raw = JSON.parse(fs.readFileSync(p30, 'utf8'));
            const dates = [...new Set(raw.map(c => String(c.timestamp || c.date).split('T')[0]))];
            if (dates.includes(TODAY)) {
                hasToday30m++;
                ready.push(s.symbol);
            }
        }
    }

    console.log(`IB stocks for today: ${ibStocks.length}`);
    console.log(`With 30m cache: ${cached30m}`);
    console.log(`With daily cache: ${cachedDay}`);
    console.log(`With TODAY's 30m data: ${hasToday30m}`);
    console.log(`\nReady for confirmation (${ready.length}):`);
    ready.forEach(s => console.log(`  ✅ ${s}`));

    // 2. Delete old signals and re-generate
    const deleted = await p.v5Signal.deleteMany({});
    console.log(`\nCleaned ${deleted.count} old V5 signals from DB`);

    await p.$disconnect();
})();
