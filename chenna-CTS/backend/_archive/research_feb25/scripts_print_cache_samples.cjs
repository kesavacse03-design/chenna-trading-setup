/**
 * Print Sample Cache Data for TradingView Cross-Verification
 * Grabs 1 stock from each category and prints recent Daily and 30-min candles.
 */
const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function printSampleData() {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(` SAMPLE DATA FOR TRADINGVIEW CROSS-VERIFICATION`);
    console.log(`${'═'.repeat(80)}\n`);

    const categories = [
        'SHORT_TERM_SWING_BO_DOWN',
        'LONG_TERM_SWING_BO_UP',
        'LONG_TERM_SWING_BO_DOWN'
    ];

    const todayStr = toISTDateString(new Date());
    const weekAgoStr = toISTDateString(new Date(Date.now() - 7 * 86400000));

    for (const cat of categories) {
        console.log(`\n▶ CATEGORY: ${cat}`);

        const category = await prisma.category.findUnique({ where: { key: cat } });
        if (!category) {
            console.log(`  Not found in DB.`);
            continue;
        }

        const catStocks = await prisma.stockCategory.findFirst({
            where: { categoryId: category.id },
            include: { stock: true },
            orderBy: { addedDate: 'desc' } // Get a recently added stock
        });

        if (!catStocks) {
            console.log(`  No stocks found.`);
            continue;
        }

        const symbol = catStocks.stock.symbol;
        const iKey = catStocks.stock.instrumentKey || symbol;

        console.log(`  STOCK: ${symbol}`);

        try {
            // Fetch Daily
            const dailyData = await priceService.fetchFromUpstox(iKey, weekAgoStr, todayStr, 'day', symbol);

            if (dailyData && dailyData.length > 0) {
                console.log(`\n  --- RECENT DAILY CANDLES ---`);
                console.log(`  Date            Open       High       Low        Close      Volume`);
                console.log(`  ${'-'.repeat(66)}`);

                // Print last 3 daily candles
                const last3Daily = dailyData.slice(-3);
                for (const c of last3Daily) {
                    const d = String(c.timestamp || c.date).split('T')[0];
                    console.log(`  ${d.padEnd(14)} ${c.open.toFixed(2).padStart(8)} ${c.high.toFixed(2).padStart(10)} ${c.low.toFixed(2).padStart(10)} ${c.close.toFixed(2).padStart(10)} ${String(c.volume).padStart(12)}`);
                }
            } else {
                console.log(`  No Daily data found in cache.`);
            }

            // Fetch 30-min
            const m30Data = await priceService.fetchFromUpstox(iKey, weekAgoStr, todayStr, '30minute', symbol);

            if (m30Data && m30Data.length > 0) {
                console.log(`\n  --- RECENT 30-MIN CANDLES (Last 5) ---`);
                console.log(`  Timestamp                  Open       High       Low        Close      Volume`);
                console.log(`  ${'-'.repeat(78)}`);

                // Print last 5 30-min candles
                const last5M30 = m30Data.slice(-5);
                for (const c of last5M30) {
                    // Handle different Upstox timestamp formats cleanly
                    let tsStr = String(c.timestamp || c.date);
                    // Standardize to YYYY-MM-DD HH:MM
                    if (tsStr.includes('T')) {
                        tsStr = tsStr.replace('T', ' ').substring(0, 16);
                    }
                    console.log(`  ${tsStr.padEnd(24)} ${c.open.toFixed(2).padStart(8)} ${c.high.toFixed(2).padStart(10)} ${c.low.toFixed(2).padStart(10)} ${c.close.toFixed(2).padStart(10)} ${String(c.volume).padStart(12)}`);
                }
            } else {
                console.log(`  No 30-min data found in cache.`);
            }

        } catch (err) {
            console.error(`  Error fetching data: ${err.message}`);
        }

        console.log(`\n  ${'·'.repeat(80)}`);
    }

    process.exit(0);
}

printSampleData().catch(console.error);
