const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(' BULK CACHE JOB: 150D DAILY + 5D 30-MIN SLICES');
    console.log('═══════════════════════════════════════════════════════\n');

    fs.mkdirSync(path.join(__dirname, '../cache/day'), { recursive: true });
    fs.mkdirSync(path.join(__dirname, '../cache/30minute'), { recursive: true });

    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) process.exit(1);

    const stockEntries = await prisma.stockCategory.findMany({
        where: {
            categoryId: cat.id,
            addedDate: { gte: new Date('2025-08-01T00:00:00Z') }
        },
        include: { stock: true }
    });

    const uniqueMap = new Map();
    for (const sc of stockEntries) {
        uniqueMap.set(`${sc.stock.symbol}_${toISTDateString(sc.addedDate)}`, {
            symbol: sc.stock.symbol,
            instrumentKey: sc.stock.instrumentKey,
            addedDate: toISTDateString(sc.addedDate)
        });
    }
    const targetStocks = Array.from(uniqueMap.values()).sort((a, b) => a.addedDate.localeCompare(b.addedDate));

    console.log(`Found ${targetStocks.length} historical signals to cache.`);

    let dtCount = 0;
    let minCount = 0;

    for (let i = 0; i < targetStocks.length; i++) {
        const req = targetStocks[i];
        try {
            const signalDateObj = new Date(req.addedDate + 'T00:00:00+05:30');

            // EXACT SAME RANGES AS INDICATOR STUDY to guarantee cache hits
            // Daily Data (150 days back, 25 forward)
            const dailyFrom = toISTDateString(new Date(signalDateObj.getTime() - 150 * 86400000));
            const dailyTo = toISTDateString(new Date(signalDateObj.getTime() + 25 * 86400000));

            const req1 = await priceService.fetchFromUpstox(req.instrumentKey, dailyFrom, dailyTo, 'day', req.symbol);
            dtCount++;

            // 30-min Data (Signal Day to Signal Date + 5)
            const minFrom = req.addedDate;
            const minToStr = toISTDateString(new Date(signalDateObj.getTime() + 5 * 86400000));
            const req2 = await priceService.fetchFromUpstox(req.instrumentKey, minFrom, minToStr, '30minute', req.symbol);
            minCount++;

            if (i % 20 === 0) process.stdout.write(`\n[${i}/${targetStocks.length}] `);
            process.stdout.write('.');

            // Respect API limit slightly if it's actually doing real fetches
            await new Promise(r => setTimeout(r, 100));

        } catch (e) {
            console.error(`\nFailed to cache ${req.symbol}: ${e.message}`);
        }
    }

    // Evaluate Cache Size
    let totalSize = 0;
    let dayFiles = 0;
    let minFiles = 0;
    const dayPath = path.join(__dirname, '../cache/day');
    const minPath = path.join(__dirname, '../cache/30minute');

    if (fs.existsSync(dayPath)) {
        const files = fs.readdirSync(dayPath);
        dayFiles = files.length;
        for (const f of files) totalSize += fs.statSync(path.join(dayPath, f)).size;
    }
    if (fs.existsSync(minPath)) {
        const files = fs.readdirSync(minPath);
        minFiles = files.length;
        for (const f of files) totalSize += fs.statSync(path.join(minPath, f)).size;
    }

    const mbSize = (totalSize / (1024 * 1024)).toFixed(2);
    const stats = priceService.getRateLimitStats();

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log(' CACHE JOB COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total stocks processed: ${targetStocks.length}`);
    console.log(`Daily candle files: ${dayFiles}`);
    console.log(`30-min candle files: ${minFiles}`);
    console.log(`Total cache size: ${mbSize} MB`);
    console.log(`API calls used today: ${stats.requestsToday} out of 1000 daily limit`);

    process.exit(0);
}

main().catch(console.error);
