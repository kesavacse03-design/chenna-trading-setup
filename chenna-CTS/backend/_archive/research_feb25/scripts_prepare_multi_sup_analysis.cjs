/* eslint-disable no-console */
const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const CATEGORY_KEY = 'MULTI_SUPPORT_BO';
const OUTPUT_FILE = path.join(__dirname, '../results/multi_sup_data.json');
const API_LOG_FILE = path.join(__dirname, '../results/api_usage_log.txt');
const NIFTY_KEY = 'NSE_INDEX|Nifty 50';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function logApi(msg) {
    const log = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(API_LOG_FILE, log);
}

async function getStocksForPeriod(startDate, endDate, limit) {
    return await prisma.stockCategory.findMany({
        where: {
            category: { key: CATEGORY_KEY },
            addedDate: {
                gte: new Date(startDate),
                lte: new Date(endDate)
            }
        },
        include: { stock: true },
        take: limit,
        orderBy: { addedDate: 'asc' }
    });
}

async function main() {
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  STEP 2: FETCH DATA FOR ${CATEGORY_KEY}`);
    console.log('══════════════════════════════════════════════════════════════════════\n');

    // Create log file if not exists
    if (!fs.existsSync(API_LOG_FILE)) fs.writeFileSync(API_LOG_FILE, '');

    try {
        // 1. SELECT STOCKS
        console.log('Selecting 50 stocks from different periods...');

        const period1 = await getStocksForPeriod('2025-08-01', '2025-09-30', 15);
        const period2 = await getStocksForPeriod('2025-10-01', '2025-11-30', 15);
        const period3 = await getStocksForPeriod('2025-12-01', '2026-01-31', 15);
        const period4 = await getStocksForPeriod('2026-02-01', '2026-02-28', 5);

        const allStocks = [...period1, ...period2, ...period3, ...period4];
        console.log(`Selected ${allStocks.length} stocks:`);
        console.log(`- Aug-Sep 25: ${period1.length}`);
        console.log(`- Oct-Nov 25: ${period2.length}`);
        console.log(`- Dec-Jan 26: ${period3.length}`);
        console.log(`- Feb 26:     ${period4.length}`);

        if (allStocks.length === 0) {
            console.error('No stocks found! Check database.');
            return;
        }

        // 2. FETCH DATA IN BATCHES
        const results = {};
        const BATCH_SIZE = 5;
        let apiCalls = 0;

        for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
            const batch = allStocks.slice(i, i + BATCH_SIZE);
            console.log(`\nProcessing Batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} stocks)...`);

            await Promise.all(batch.map(async (item) => {
                const stock = item.stock;
                const addedDate = new Date(item.addedDate);
                const symbol = stock.symbol;

                console.log(`  Fetching ${symbol} (Signal: ${item.addedDate.toISOString().split('T')[0]})...`);

                // Calculate ranges
                // FETCH MORE HISTORY: -100 days for LT indicators
                const startDaily = new Date(addedDate); startDaily.setDate(startDaily.getDate() - 100);
                const endDaily = new Date(addedDate); endDaily.setDate(endDaily.getDate() + 30); // Future 30 days

                // Weekly: -200 days for trend
                const startWeekly = new Date(addedDate); startWeekly.setDate(startWeekly.getDate() - 200);
                const endWeekly = new Date(addedDate); endWeekly.setDate(endWeekly.getDate() + 30);

                const dStart = startDaily.toISOString().split('T')[0];
                const dEnd = endDaily.toISOString().split('T')[0];
                const wStart = startWeekly.toISOString().split('T')[0];
                const wEnd = endWeekly.toISOString().split('T')[0];

                try {
                    // API Calls
                    // 1. Daily Stock
                    const daily = await priceService.fetchPrice(symbol, stock.instrumentKey, dStart, dEnd, 'day');
                    apiCalls++;

                    // 2. Weekly Stock
                    const weekly = await priceService.fetchPrice(symbol, stock.instrumentKey, wStart, wEnd, 'week');
                    apiCalls++;

                    // 3. Nifty Daily
                    const nifty = await priceService.fetchPrice('Nifty 50', NIFTY_KEY, dStart, dEnd, 'day');
                    apiCalls++;

                    results[symbol] = {
                        symbol,
                        addedDate: item.addedDate,
                        daily: daily || [],
                        weekly: weekly || [],
                        nifty: nifty || []
                    };

                    logApi(`Fetched ${symbol}: Daily(${daily?.length}), Weekly(${weekly?.length}), Nifty(${nifty?.length})`);

                } catch (e) {
                    console.error(`  ❌ Failed ${symbol}: ${e.message}`);
                    logApi(`FAILED ${symbol}: ${e.message}`);
                    if (e.message.includes('429') || e.message.toLowerCase().includes('rate limit')) {
                        throw new Error('RATE_LIMIT_HIT');
                    }
                }
            }));

            // Wait 10s between batches
            if (i + BATCH_SIZE < allStocks.length) {
                console.log('  Waiting 10s...');
                await sleep(10000); // 10s delay
            }
        }

        // 3. SAVE RESULTS
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
        console.log(`\n✅ Saved data for ${Object.keys(results).length} stocks to ${OUTPUT_FILE}`);
        console.log(`Total API Calls: ${apiCalls}`);

    } catch (e) {
        if (e.message === 'RATE_LIMIT_HIT') {
            console.error('\n🚨 API RATE LIMIT REACHED! Stopping.');
        } else {
            console.error('\n❌ Error:', e);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
