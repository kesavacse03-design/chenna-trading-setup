const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    // 1. Last 10 IB dates
    const recs = await p.$queryRaw`
        SELECT DISTINCT "added_date" FROM "stock_categories"
        WHERE "category_id" = (SELECT id FROM "categories" WHERE key = 'INTRADAY_BOOST')
        ORDER BY "added_date" DESC
        LIMIT 10
    `;
    console.log('Last 10 IB dates in database:');
    for (const r of recs) {
        const d = new Date(r.added_date);
        console.log('  ', d.toISOString().split('T')[0]);
    }

    // 2. What V5 signals exist?
    const sigDates = await p.$queryRaw`
        SELECT DISTINCT "signal_date", COUNT(*) as cnt
        FROM "v5_signals"
        GROUP BY "signal_date"
        ORDER BY "signal_date" DESC
        LIMIT 10
    `;
    console.log('\nV5 Signal dates:');
    for (const r of sigDates) {
        const d = new Date(r.signal_date);
        console.log('  ', d.toISOString().split('T')[0], '→', Number(r.cnt), 'signals');
    }

    // 3. Check 30m cache dates for a known IB stock
    const fs = require('fs');
    const path = require('path');
    const cacheDir = path.join(__dirname, '../cache/30minute');
    const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('_master.json')).slice(0, 3);
    console.log('\nSample 30m cache coverage:');
    for (const f of files) {
        const raw = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8'));
        const dates = [...new Set(raw.map(c => String(c.timestamp || c.date).split('T')[0]))].sort();
        console.log(`  ${f}: ${dates.length} days, range: ${dates[0]} to ${dates[dates.length - 1]}`);
    }

    // 4. Check daily cache
    const dayDir = path.join(__dirname, '../cache/day');
    const dayFiles = fs.readdirSync(dayDir).filter(f => f.endsWith('_master.json')).slice(0, 3);
    console.log('\nSample daily cache coverage:');
    for (const f of dayFiles) {
        const raw = JSON.parse(fs.readFileSync(path.join(dayDir, f), 'utf8'));
        const dates = raw.map(c => String(c.timestamp || c.date).split('T')[0]).sort();
        console.log(`  ${f}: ${dates.length} days, range: ${dates[0]} to ${dates[dates.length - 1]}`);
    }

    // 5. Check what IB stocks on the latest date match the 30m cache
    const latestIBDate = recs[0] ? new Date(recs[0].added_date) : null;
    if (latestIBDate) {
        const dStr = latestIBDate.toISOString().split('T')[0];
        const latestIBStocks = await p.$queryRaw`
            SELECT s.symbol FROM "stock_categories" sc
            JOIN "stocks" s ON sc."stock_id" = s.id
            WHERE sc."category_id" = (SELECT id FROM "categories" WHERE key = 'INTRADAY_BOOST')
            AND sc."added_date" >= ${latestIBDate}::date
            AND sc."added_date" < (${latestIBDate}::date + INTERVAL '1 day')
            LIMIT 5
        `;
        console.log(`\nFirst 5 IB stocks for ${dStr}:`);
        for (const s of latestIBStocks) {
            const cleanKey = s.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            const has30m = fs.existsSync(path.join(cacheDir, `${cleanKey}_master.json`));
            const hasDay = fs.existsSync(path.join(dayDir, `${cleanKey}_master.json`));

            let has30mToday = false;
            if (has30m) {
                const raw = JSON.parse(fs.readFileSync(path.join(cacheDir, `${cleanKey}_master.json`), 'utf8'));
                has30mToday = raw.some(c => String(c.timestamp || c.date).split('T')[0] === dStr);
            }
            console.log(`  ${s.symbol.padEnd(15)} | 30m cache: ${has30m ? 'YES' : 'NO'} | has ${dStr}: ${has30mToday ? 'YES' : 'NO'} | day cache: ${hasDay ? 'YES' : 'NO'}`);
        }
    }

    await p.$disconnect();
})();
