const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

const TARGETS_FILE = path.join(__dirname, '../results/deep_analysis_st_up_targets.json');
const OUTPUT_FILE = path.join(__dirname, '../results/deep_analysis_st_up_data.json');

const NIFTY_KEY = 'NSE_INDEX|Nifty 50';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchData() {
    console.log('Starting Deep Analysis ST_UP Data Fetch...');

    if (!fs.existsSync(TARGETS_FILE)) {
        console.error('Targets file not found!');
        return;
    }

    const targets = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
    console.log(`Loaded ${targets.length} targets.`);

    const results = {};

    for (let i = 0; i < targets.length; i++) {
        const stock = targets[i];
        console.log(`[${i + 1}/${targets.length}] Fetching ${stock.symbol}...`);

        const addedDate = new Date(stock.added_date);

        // 1. Calculate Ranges
        // Daily: -30 to +15 days
        const dailyStart = new Date(addedDate); dailyStart.setDate(dailyStart.getDate() - 40);
        const dailyEnd = new Date(addedDate); dailyEnd.setDate(dailyEnd.getDate() + 20);

        // Weekly: -6 months
        const weeklyStart = new Date(addedDate); weeklyStart.setMonth(weeklyStart.getMonth() - 7);
        const weeklyEnd = new Date(addedDate); weeklyEnd.setDate(weeklyEnd.getDate() + 5);

        // Format for Upstox 
        const dStartStr = dailyStart.toISOString().split('T')[0];
        const dEndStr = dailyEnd.toISOString().split('T')[0];
        const wStartStr = weeklyStart.toISOString().split('T')[0];
        const wEndStr = weeklyEnd.toISOString().split('T')[0];

        try {
            // A. Fetch Stock Daily
            const daily = await priceService.fetchPrice(
                stock.symbol,
                stock.instrument_key,
                dStartStr,
                dEndStr,
                'day'
            );

            // B. Fetch Stock Weekly
            const weekly = await priceService.fetchPrice(
                stock.symbol,
                stock.instrument_key,
                wStartStr,
                wEndStr,
                'week'
            );

            // C. Fetch Nifty Daily (Context)
            const nifty = await priceService.fetchPrice(
                'NIFTY 50',
                NIFTY_KEY,
                dStartStr,
                dEndStr,
                'day'
            );

            results[stock.symbol] = {
                addedDate: stock.added_date,
                daily: daily || [],
                weekly: weekly || [],
                nifty: nifty || []
            };

            console.log(`  -> Got ${daily?.length || 0} daily, ${weekly?.length || 0} weekly, ${nifty?.length || 0} nifty`);

        } catch (e) {
            console.error(`  -> ERROR: ${e.message}`);
            results[stock.symbol] = { error: e.message };
        }

        // Rate Limit: 2 seconds per stock
        await sleep(2000);
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`Saved deep analysis data to ${OUTPUT_FILE}`);
}

fetchData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
