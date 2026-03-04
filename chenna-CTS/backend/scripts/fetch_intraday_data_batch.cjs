const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const priceService = require('../services/priceService.cjs'); // Assumes backend/services

async function fetchBatch() {
    const START_DATE = '2026-02-27';
    const END_DATE = '2026-03-03'; // Include 2nd
    const CATEGORIES = ['INTRADAY_BOOST'];

    try {
        console.log(`🚀 Starting Batch Fetch for ${START_DATE} to ${END_DATE}...`);

        // 1. Get Unique Symbols from Categories in Time Range
        const stocks = await prisma.stockCategory.findMany({
            where: {
                category: { key: { in: CATEGORIES } },
                addedDate: {
                    gte: new Date(START_DATE),
                    lte: new Date(END_DATE)
                }
            },
            include: { stock: true }
        });

        const uniqueSymbols = [...new Set(stocks.map(s => s.stock.symbol))];
        console.log(`Found ${uniqueSymbols.length} unique symbols to fetch.`);

        // 2. Fetch Data for each Symbol
        let success = 0;
        let fail = 0;
        const total = uniqueSymbols.length;

        for (let i = 0; i < total; i++) {
            const symbol = uniqueSymbols[i];
            const stock = stocks.find(s => s.stock.symbol === symbol).stock;
            const instrumentKey = stock.instrumentKey;

            if (!instrumentKey) {
                console.log(`[${i + 1}/${total}] ⚠️ Skipping ${symbol} (No Instrument Key)`);
                fail++;
                continue;
            }

            console.log(`[${i + 1}/${total}] Fetching ${symbol}...`);
            try {
                // Fetch 1-min candles for the whole range
                const candles = await priceService.fetchPrice(symbol, instrumentKey, START_DATE, END_DATE, '1minute');
                if (candles && candles.length > 0) {
                    console.log(`   ✅ Fetched ${candles.length} candles.`);
                    success++;
                } else {
                    console.log(`   ⚠️ No data returned.`);
                    fail++;
                }

                // Rate limit (mild)
                await new Promise(r => setTimeout(r, 500));

            } catch (e) {
                console.error(`   ❌ Error fetching ${symbol}:`, e.message);
                fail++;
            }
        }

        console.log(`\n🎉 Batch Fetch Complete! Success: ${success}, Fail: ${fail}`);
        await prisma.$disconnect();

    } catch (e) {
        console.error('❌ Batch Fetch Failed:', e);
        await prisma.$disconnect();
    }
}

fetchBatch();
