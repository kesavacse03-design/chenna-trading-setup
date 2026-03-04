/* eslint-disable no-console */
const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../results/lom_data.json');
const API_LOG_FILE = path.join(__dirname, '../results/api_usage_log.txt');
const NIFTY_KEY = 'NSE_INDEX|Nifty 50';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function logApi(msg) {
    const log = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(API_LOG_FILE, log);
}

async function getStocksForCategory(categoryKey, limit) {
    return await prisma.stockCategory.findMany({
        where: {
            category: { key: categoryKey }
        },
        include: { stock: true },
        take: limit,
        orderBy: { addedDate: 'desc' } // Get recent ones? Or mixed? Desc = recent.
    });
}

async function main() {
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  STEP 1: FETCH DATA FOR LOM ANALYSIS`);
    console.log('══════════════════════════════════════════════════════════════════════\n');

    if (!fs.existsSync(API_LOG_FILE)) fs.writeFileSync(API_LOG_FILE, '');

    try {
        const results = {
            'UPSIDE_LOM_INTRA': {},
            'DOWNSIDE_LOM_INTRA': {}
        };

        // 1. SELECT STOCKS
        const ups = await getStocksForCategory('UPSIDE_LOM_INTRA', 40);
        const downs = await getStocksForCategory('DOWNSIDE_LOM_INTRA', 40);

        console.log(`Selected ${ups.length} UPSIDE and ${downs.length} DOWNSIDE stocks.`);

        const allItems = [
            ...ups.map(s => ({ ...s, type: 'UPSIDE_LOM_INTRA' })),
            ...downs.map(s => ({ ...s, type: 'DOWNSIDE_LOM_INTRA' }))
        ];

        // 2. FETCH DATA IN BATCHES
        const BATCH_SIZE = 5;
        let apiCalls = 0;

        for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
            const batch = allItems.slice(i, i + BATCH_SIZE);
            console.log(`\nProcessing Batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} stocks)...`);

            await Promise.all(batch.map(async (item) => {
                const stock = item.stock;
                const symbol = stock.symbol;
                const addedDate = new Date(item.addedDate);
                const type = item.type;

                console.log(`  Fetching ${symbol} (${type})...`);

                // Range: -5 days to +10 days
                const startDaily = new Date(addedDate); startDaily.setDate(startDaily.getDate() - 5);
                const endDaily = new Date(addedDate); endDaily.setDate(endDaily.getDate() + 10);

                const dStart = startDaily.toISOString().split('T')[0];
                const dEnd = endDaily.toISOString().split('T')[0];

                try {
                    // Daily Stock
                    const daily = await priceService.fetchPrice(symbol, stock.instrumentKey, dStart, dEnd, 'day');
                    apiCalls++;

                    results[type][symbol] = {
                        symbol,
                        addedDate: item.addedDate,
                        daily: daily || []
                    };

                    logApi(`Fetched ${symbol}: Daily(${daily?.length})`);

                } catch (e) {
                    console.error(`  ❌ Failed ${symbol}: ${e.message}`);
                    logApi(`FAILED ${symbol}: ${e.message}`);
                }
            }));

            if (i + BATCH_SIZE < allItems.length) {
                console.log('  Waiting 5s...');
                await sleep(5000);
            }
        }

        // 3. SAVE RESULTS
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
        console.log(`\n✅ Saved data to ${OUTPUT_FILE}`);
        console.log(`Total API Calls: ${apiCalls}`);

    } catch (e) {
        console.error('\n❌ Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
