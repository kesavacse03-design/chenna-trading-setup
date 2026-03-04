const prisma = require('../lib/prisma.cjs');

async function run() {
    // Check candle counts in cache entries
    const entries = await prisma.ohlcvCache.findMany({
        where: { interval: 'day' },
        select: { symbol: true, fromDate: true, toDate: true, data: true },
        take: 30,
        orderBy: { toDate: 'desc' }
    });

    console.log('CANDLE COUNTS IN CACHE:');
    let totalCandles = 0;
    let entriesWithData = 0;
    for (const e of entries) {
        const d = Array.isArray(e.data) ? e.data : [];
        totalCandles += d.length;
        if (d.length > 0) entriesWithData++;
        const from = e.fromDate?.toISOString().split('T')[0];
        const to = e.toDate?.toISOString().split('T')[0];
        console.log(e.symbol + ': ' + d.length + ' candles (' + from + ' to ' + to + ')');
    }
    console.log('');
    console.log('Avg candles per entry: ' + (totalCandles / entries.length).toFixed(1));
    console.log('Entries with data: ' + entriesWithData + '/' + entries.length);

    // Check ALL entries distribution
    const allEntries = await prisma.ohlcvCache.findMany({
        where: { interval: 'day' },
        select: { data: true }
    });

    let dist = { '0': 0, '1-5': 0, '6-10': 0, '11-20': 0, '21+': 0 };
    for (const e of allEntries) {
        const len = Array.isArray(e.data) ? e.data.length : 0;
        if (len === 0) dist['0']++;
        else if (len <= 5) dist['1-5']++;
        else if (len <= 10) dist['6-10']++;
        else if (len <= 20) dist['11-20']++;
        else dist['21+']++;
    }
    console.log('');
    console.log('CANDLE DISTRIBUTION:');
    for (const [k, v] of Object.entries(dist)) {
        console.log('  ' + k + ' candles: ' + v + ' entries');
    }

    await prisma.$disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
