const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
    // Find ALL Jan 7 candles across all cache records
    const allCaches = await p.ohlcvCache.findMany({
        where: { symbol: 'TITAN', interval: 'day' }
    });

    console.log('=== ALL JAN 7 CANDLES ACROSS 68 CACHE RECORDS ===');
    console.log('');

    let count = 0;
    const allJan7 = [];
    for (const c of allCaches) {
        const data = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
        for (const d of data) {
            const dt = (d.timestamp || d.date || '').split('T')[0];
            if (dt === '2026-01-07') {
                allJan7.push({
                    open: parseFloat(d.open),
                    close: parseFloat(d.close),
                    high: parseFloat(d.high),
                    low: parseFloat(d.low),
                    cacheFrom: c.fromDate,
                    cacheTo: c.toDate
                });
                count++;
            }
        }
    }

    console.log('Found ' + count + ' copies of Jan 7 candle:');
    const uniquePrices = {};
    for (const c of allJan7) {
        const key = c.close.toFixed(2);
        if (!uniquePrices[key]) uniquePrices[key] = 0;
        uniquePrices[key]++;
    }
    console.log('');
    console.log('Unique close prices:');
    for (const [price, cnt] of Object.entries(uniquePrices)) {
        console.log('  Close=' + price + ' appears ' + cnt + ' times');
    }

    // Now check: does any candle in the ENTIRE dataset have close = 3370?
    console.log('');
    console.log('=== SEARCHING FOR CLOSE=3370 ACROSS ALL DATA ===');
    let found3370 = 0;
    for (const c of allCaches) {
        const data = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
        for (const d of data) {
            const close = parseFloat(d.close);
            if (Math.abs(close - 3370) < 1) {
                const dt = (d.timestamp || d.date || '').split('T')[0];
                console.log('  Found close=3370 on ' + dt + ' (O=' + d.open + ' H=' + d.high + ' L=' + d.low + ' C=' + d.close + ')');
                found3370++;
            }
        }
    }
    if (found3370 === 0) {
        console.log('  NOT FOUND! 3370 does not exist in any TITAN candle!');
    }

    // Check priceService fetchPrice simulation - what would it return?
    // The signal generator sorts by timestamp then finds matching date
    // Let's simulate exactly what it does
    console.log('');
    console.log('=== SIMULATING SIGNAL GENERATOR PRICE FETCH ===');

    const targetDate = '2026-01-07';
    const startDate = new Date('2026-01-07');
    startDate.setDate(startDate.getDate() - 200);
    const fromDate = startDate.toISOString().split('T')[0]; // ~2025-06-21

    console.log('Fetching: ' + fromDate + ' to ' + targetDate);

    const priceService = require('../services/priceService.cjs');
    const titan = await p.stock.findUnique({ where: { symbol: 'TITAN' } });

    if (titan && titan.instrumentKey) {
        try {
            const ohlcData = await priceService.fetchPrice(
                'TITAN',
                titan.instrumentKey,
                fromDate,
                targetDate
            );

            if (ohlcData && ohlcData.length > 0) {
                ohlcData.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

                const candle = ohlcData.find(c => {
                    const candleDate = new Date(c.timestamp || c.date).toISOString().split('T')[0];
                    return candleDate === targetDate;
                }) || ohlcData[ohlcData.length - 1];

                console.log('fetchPrice returned ' + ohlcData.length + ' candles');
                console.log('Target date candle: ' + JSON.stringify(candle));
                console.log('Price used: ' + candle.close);
            } else {
                console.log('fetchPrice returned no data!');
            }
        } catch (e) {
            console.log('fetchPrice error: ' + e.message);
        }
    }

    await p.$disconnect();
}

check().catch(e => { console.error(e); p.$disconnect(); });
