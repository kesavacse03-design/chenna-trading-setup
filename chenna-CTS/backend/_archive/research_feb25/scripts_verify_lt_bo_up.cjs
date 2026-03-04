const prisma = require('../lib/prisma.cjs');

async function verifyLtBoUp() {
    console.log('========================================');
    console.log('  VERIFYING LT_SWING_BO_UP ANALYSIS');
    console.log('========================================');

    const CATEGORY = 'LONG_TERM_SWING_BO_UP';

    // 1. Check Total vs Eligible (Age > 7 days)
    const total = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count 
        FROM stock_categories sc
        JOIN categories c ON sc.category_id = c.id
        WHERE c.key = ${CATEGORY}
    `;

    const eligible = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count 
        FROM stock_categories sc
        JOIN categories c ON sc.category_id = c.id
        WHERE c.key = ${CATEGORY}
          AND sc.added_date < NOW() - INTERVAL '7 days'
    `;

    console.log(`\nTotal Records: ${total[0].count}`);
    console.log(`Eligible (>7 days old): ${eligible[0].count}`);
    console.log(`Analyzed in previous run: 40`);
    console.log(`Gap: ${eligible[0].count - 40} eligible stocks NOT analyzed (Likely missing cache)`);

    // 2. Extract 5 Examples Analyzed Previously
    // Re-run the analysis logic just for this category to get details

    const stocks = await prisma.$queryRaw`
        SELECT s.symbol, sc.added_date
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        JOIN categories c ON sc.category_id = c.id
        WHERE c.key = ${CATEGORY}
          AND sc.added_date < NOW() - INTERVAL '7 days'
        ORDER BY sc.added_date DESC
    `;

    const cacheEntries = await prisma.ohlcvCache.findMany({
        where: { interval: 'day' },
        select: { symbol: true, fromDate: true, toDate: true, data: true }
    });

    const cacheMap = {};
    for (const entry of cacheEntries) {
        const candles = Array.isArray(entry.data) ? entry.data : [];
        if (candles.length >= 10) {
            if (!cacheMap[entry.symbol]) cacheMap[entry.symbol] = [];
            cacheMap[entry.symbol].push({ from: entry.fromDate, to: entry.toDate, candles: candles });
        }
    }

    const examples = [];
    const marketCheck = []; // To check Nifty dates

    for (const stock of stocks) {
        if (examples.length >= 10) break;

        const addedDate = new Date(stock.added_date);
        const addedStr = addedDate.toISOString().split('T')[0];
        const entries = cacheMap[stock.symbol];
        if (!entries) continue;

        let bestCandles = entries[0].candles; // Simplified for verification
        bestCandles.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Find Day 0
        let day0Idx = -1;
        for (let i = 0; i < bestCandles.length; i++) {
            const cDate = new Date(bestCandles[i].timestamp).toISOString().split('T')[0];
            if (cDate === addedStr) {
                day0Idx = i;
                break;
            }
        }

        // Approx match
        if (day0Idx === -1) {
            for (let i = 0; i < bestCandles.length; i++) {
                const diff = Math.abs(new Date(bestCandles[i].timestamp) - addedDate);
                if (diff < 2 * 86400000) { day0Idx = i; break; }
            }
        }

        if (day0Idx !== -1 && day0Idx + 5 < bestCandles.length) {
            const day0 = bestCandles[day0Idx];
            const day5 = bestCandles[day0Idx + 5];

            // Check max down in 5 days
            let minLow = Infinity;
            for (let j = 1; j <= 5; j++) {
                if (bestCandles[day0Idx + j].low < minLow) minLow = bestCandles[day0Idx + j].low;
            }

            const movePct = ((day5.close - day0.close) / day0.close) * 100;
            const maxDownPct = ((minLow - day0.close) / day0.close) * 100;

            examples.push({
                symbol: stock.symbol,
                added: addedStr,
                day0Close: day0.close,
                day5Close: day5.close,
                day5Date: new Date(day5.timestamp).toISOString().split('T')[0],
                movePct: movePct.toFixed(2),
                maxDownPct: maxDownPct.toFixed(2)
            });

            if (!marketCheck.includes(addedStr)) marketCheck.push(addedStr);
        }
    }

    console.log('\nTRADING EXAMPLES (LT_SWING_BO_UP):');
    examples.forEach(e => {
        console.log(`Symbol: ${e.symbol} | Added: ${e.added} | Day0: ${e.day0Close} -> Day5: ${e.day5Close} (${e.movePct}%) | MaxDown: ${e.maxDownPct}%`);
    });

    // 3. Check what Nifty was doing?
    // We don't have Nifty data in DB, so I'll infer from the dates.
    console.log('\nMarket Period Checked:');
    marketCheck.sort();
    if (marketCheck.length > 0) {
        console.log(`From ${marketCheck[0]} to ${marketCheck[marketCheck.length - 1]}`);
    }
}

verifyLtBoUp()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
