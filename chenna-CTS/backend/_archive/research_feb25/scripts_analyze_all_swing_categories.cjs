const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');
const fs = require('fs');
const path = require('path');

// Configuration
const CATEGORIES = [
    'SHORT_TERM_SWING_BO_UP',
    'LONG_TERM_SWING_BO_DOWN',
    'LONG_TERM_SWING_BO_UP',
    'MULTI_RESISTANCE_BO',
    'MULTI_SUPPORT_BO'
];

const BATCH_SIZE = 5;
const DELAY_MS = 1000; // 1 second delay between batches
const OUTPUT_FILE = path.join(__dirname, '../results/category_master_analysis.json');
const MD_FILE = path.join(__dirname, '../results/swing_categories_master_analysis.md');

// Statistics Storage
const stats = {};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCandles(symbol, instrumentKey, dateStr) {
    const signalDate = new Date(dateStr);
    const startDate = new Date(signalDate);
    startDate.setDate(startDate.getDate() - 20); // Get 20 days prior for pre-trend
    const endDate = new Date(signalDate);
    endDate.setDate(endDate.getDate() + 10); // Get 10 days after for outcome

    // Clamp to today
    const today = new Date();
    if (endDate > today) {
        endDate.setTime(today.getTime());
    }

    try {
        const candles = await priceService.fetchPrice(symbol, instrumentKey, startDate, endDate, '1day');
        return candles || []; // Handle null
    } catch (e) {
        console.error(`[Error] ${symbol}: ${e.message}`);
        return [];
    }
}

function analyzeStock(candles, signalDateStr) {
    const signalDate = new Date(signalDateStr).toISOString().split('T')[0];

    // Find index of signal date
    const idx = candles.findIndex(c => c.date.startsWith(signalDate));
    if (idx === -1) return null;

    const signalCandle = candles[idx];
    const close = signalCandle.close;

    // 1. Pre-Trend (10 days)
    let preTrend = null;
    if (idx >= 10) {
        const prev = candles[idx - 10];
        preTrend = ((close - prev.close) / prev.close) * 100;
    }

    // 2. Future Moves (5 days)
    let maxUp = -Infinity;
    let maxDown = Infinity;
    let daysCount = 0;

    for (let i = 1; i <= 5; i++) {
        if (idx + i < candles.length) {
            const next = candles[idx + i];
            const upMove = ((next.high - close) / close) * 100;
            const downMove = ((next.low - close) / close) * 100;

            if (upMove > maxUp) maxUp = upMove;
            if (downMove < maxDown) maxDown = downMove;
            daysCount++;
        }
    }

    if (daysCount < 1) return null; // Not enough future data

    return {
        preTrend,
        maxUp,
        maxDown
    };
}

async function processCategory(categoryKey) {
    console.log(`\nAnalyzing ${categoryKey}...`);

    // Fetch stocks
    const stocks = await prisma.$queryRaw`
        SELECT s.symbol, s.instrument_key, sc.added_date 
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        JOIN categories c ON sc.category_id = c.id
        WHERE c.key = ${categoryKey}
        AND sc.added_date < NOW() - INTERVAL '7 days'
        ORDER BY sc.added_date DESC
        LIMIT 50
    `;

    console.log(`Found ${stocks.length} records. Processing...`);

    const results = {
        category: categoryKey,
        total: stocks.length,
        processed: 0,
        valid: 0,
        avgPreTrend: 0,
        avgMaxUp: 0,
        avgMaxDown: 0,
        winnersLong: 0, // MaxUp > 2%
        winnersShort: 0 // MaxDown < -2%
    };

    let totalPre = 0, totalUp = 0, totalDown = 0;

    // Batch Process
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (stock) => {
            // VALIDATION: Check added_date
            if (!stock.added_date || isNaN(new Date(stock.added_date).getTime())) {
                return null;
            }

            const candles = await fetchCandles(stock.symbol, stock.instrument_key, stock.added_date);
            if (candles.length === 0) return null;

            const analysis = analyzeStock(candles, stock.added_date);
            return analysis;
        });

        const batchResults = await Promise.all(promises);

        batchResults.forEach(res => {
            if (res) {
                results.valid++;
                if (res.preTrend !== null) totalPre += res.preTrend;
                totalUp += res.maxUp;
                totalDown += res.maxDown;

                if (res.maxUp > 2) results.winnersLong++;
                if (res.maxDown < -2) results.winnersShort++;
            }
        });

        results.processed += batch.length;
        process.stdout.write(`\rProgress: ${results.processed}/${results.total}`);
        await sleep(DELAY_MS);
    }

    if (results.valid > 0) {
        results.avgPreTrend = totalPre / results.valid;
        results.avgMaxUp = totalUp / results.valid;
        results.avgMaxDown = totalDown / results.valid;
    }

    stats[categoryKey] = results;
    console.log(`\nCompleted ${categoryKey}. Avg Up: ${results.avgMaxUp.toFixed(2)}%, Avg Down: ${results.avgMaxDown.toFixed(2)}%`);
}

async function run() {
    // Increase API Limit locally for this script
    priceService.dailyLimit = 10000;

    for (const cat of CATEGORIES) {
        await processCategory(cat);
    }

    // Generate Markdown
    let md = '# Universal Swing Category Analysis\n\n';
    md += '| Category | Count | Avg UP (5d) | Avg DOWN (5d) | Ratio | Strategy |\n';
    md += '|---|---|---|---|---|---|\n';

    for (const cat of CATEGORIES) {
        const s = stats[cat];
        if (!s) continue;

        const ratio = Math.abs(s.avgMaxUp / s.avgMaxDown).toFixed(2);
        let strategy = 'SKIP (No Edge)';

        if (s.avgMaxUp > Math.abs(s.avgMaxDown) * 1.5) strategy = '**LONG ✅**';
        else if (Math.abs(s.avgMaxDown) > s.avgMaxUp * 1.5) strategy = '**SHORT ✅**';

        md += `| ${cat} | ${s.valid} | +${s.avgMaxUp.toFixed(2)}% | ${s.avgMaxDown.toFixed(2)}% | ${ratio}x | ${strategy} |\n`;
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stats, null, 2));
    fs.writeFileSync(MD_FILE, md);
    console.log(`\nAnalysis Saved to ${MD_FILE}`);

    await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
