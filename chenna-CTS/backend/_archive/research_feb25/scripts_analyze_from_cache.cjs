/**
 * analyze_from_cache.cjs
 * 
 * Analyzes swing/breakout categories using EXISTING cached OHLC data.
 * NO API calls needed - reads directly from ohlcv_cache table.
 * 
 * Strategy: For each category stock, find cached daily candles that cover
 * the stock's addedDate. Calculate pre-trend, max_up_5d, max_down_5d.
 */

const prisma = require('../lib/prisma.cjs');
const fs = require('fs');
const path = require('path');

const CATEGORIES = [
    'SHORT_TERM_SWING_BO_UP',
    'LONG_TERM_SWING_BO_DOWN',
    'LONG_TERM_SWING_BO_UP',
    'MULTI_RESISTANCE_BO',
    'MULTI_SUPPORT_BO'
];

const OUT_JSON = path.join(__dirname, '../results/cache_analysis.json');
const OUT_MD = path.join(__dirname, '../results/swing_categories_master_analysis.md');

async function analyzeCategory(categoryKey) {
    console.log(`\nAnalyzing ${categoryKey}...`);

    // 1. Get stocks older than 7 days (so we have future data)
    const stocks = await prisma.$queryRaw`
        SELECT s.symbol, sc.added_date
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        JOIN categories c ON sc.category_id = c.id
        WHERE c.key = ${categoryKey}
          AND sc.added_date < NOW() - INTERVAL '7 days'
        ORDER BY sc.added_date DESC
    `;

    console.log(`  Found ${stocks.length} stocks (>7 days old)`);

    // 2. Get ALL cache entries with enough candles (>= 10)
    const cacheEntries = await prisma.ohlcvCache.findMany({
        where: { interval: 'day' },
        select: { symbol: true, fromDate: true, toDate: true, data: true }
    });

    // Build a lookup: symbol -> array of cache entries with good data
    const cacheMap = {};
    for (const entry of cacheEntries) {
        const candles = Array.isArray(entry.data) ? entry.data : [];
        if (candles.length >= 10) {  // Only entries with enough data
            if (!cacheMap[entry.symbol]) cacheMap[entry.symbol] = [];
            cacheMap[entry.symbol].push({
                from: entry.fromDate,
                to: entry.toDate,
                candles: candles
            });
        }
    }

    console.log(`  Cache: ${Object.keys(cacheMap).length} symbols with 10+ candles`);

    // 3. For each stock, find matching cache and analyze
    const results = [];
    let skippedNoCache = 0;
    let skippedNoMatch = 0;
    let skippedInsufficient = 0;

    for (const stock of stocks) {
        const addedDate = new Date(stock.added_date);
        const addedStr = addedDate.toISOString().split('T')[0];

        // Find cache for this symbol
        const entries = cacheMap[stock.symbol];
        if (!entries) {
            skippedNoCache++;
            continue;
        }

        // Find a cache entry that covers the addedDate window
        let bestCandles = null;
        for (const entry of entries) {
            // Check if cache covers a period around the added date
            const from = new Date(entry.from);
            const to = new Date(entry.to);
            if (from <= addedDate && to >= addedDate) {
                bestCandles = entry.candles;
                break;
            }
        }

        // If no exact match, use the entry with the most candles
        if (!bestCandles && entries.length > 0) {
            entries.sort((a, b) => b.candles.length - a.candles.length);
            bestCandles = entries[0].candles;
        }

        if (!bestCandles || bestCandles.length < 10) {
            skippedInsufficient++;
            continue;
        }

        // Sort candles by timestamp
        bestCandles.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Find the candle closest to addedDate
        let day0Idx = -1;
        for (let i = 0; i < bestCandles.length; i++) {
            const cDate = new Date(bestCandles[i].timestamp).toISOString().split('T')[0];
            if (cDate === addedStr) {
                day0Idx = i;
                break;
            }
        }

        // If exact date not found, find closest
        if (day0Idx === -1) {
            let minDiff = Infinity;
            for (let i = 0; i < bestCandles.length; i++) {
                const diff = Math.abs(new Date(bestCandles[i].timestamp) - addedDate);
                if (diff < minDiff) {
                    minDiff = diff;
                    day0Idx = i;
                }
                // Only allow within 2 days
                if (minDiff > 2 * 86400000) {
                    day0Idx = -1;
                }
            }
        }

        if (day0Idx === -1 || day0Idx >= bestCandles.length - 1) {
            skippedNoMatch++;
            continue;
        }

        const day0Close = bestCandles[day0Idx].close;
        if (!day0Close || day0Close <= 0) continue;

        // Pre-trend (up to 10 days before)
        let preTrend = null;
        const preIdx = Math.max(0, day0Idx - 10);
        if (preIdx < day0Idx && bestCandles[preIdx].close > 0) {
            preTrend = ((day0Close - bestCandles[preIdx].close) / bestCandles[preIdx].close) * 100;
        }

        // Max up/down (up to 5 days after)
        let maxUp = -Infinity;
        let maxDown = Infinity;
        let futureDays = 0;

        for (let i = 1; i <= 5; i++) {
            if (day0Idx + i < bestCandles.length) {
                const candle = bestCandles[day0Idx + i];
                const upMove = ((candle.high - day0Close) / day0Close) * 100;
                const downMove = ((candle.low - day0Close) / day0Close) * 100;

                if (upMove > maxUp) maxUp = upMove;
                if (downMove < maxDown) maxDown = downMove;
                futureDays++;
            }
        }

        if (futureDays < 1) {
            skippedInsufficient++;
            continue;
        }

        results.push({
            symbol: stock.symbol,
            addedDate: addedStr,
            preTrend: preTrend !== null ? preTrend : 0,
            maxUp: maxUp,
            maxDown: maxDown,
            futureDays: futureDays
        });
    }

    console.log(`  Analyzed: ${results.length} stocks`);
    console.log(`  Skipped: ${skippedNoCache} no cache, ${skippedNoMatch} no date match, ${skippedInsufficient} insufficient data`);

    // 4. Aggregate
    if (results.length === 0) {
        return {
            category: categoryKey,
            count: 0,
            avgUp: 0,
            avgDown: 0,
            avgPreTrend: 0,
            ratio: 0,
            strategy: 'SKIP (No Data)'
        };
    }

    const avgUp = results.reduce((s, r) => s + r.maxUp, 0) / results.length;
    const avgDown = results.reduce((s, r) => s + Math.abs(r.maxDown), 0) / results.length;
    const avgPreTrend = results.reduce((s, r) => s + r.preTrend, 0) / results.length;
    const winnersLong = results.filter(r => r.maxUp > 2).length;
    const winnersShort = results.filter(r => r.maxDown < -2).length;

    const ratio = avgDown > 0 ? avgUp / avgDown : 0;
    let strategy;
    if (ratio > 1.5) strategy = 'LONG';
    else if (ratio < 0.67) strategy = 'SHORT';
    else strategy = 'SKIP (No Edge)';

    console.log(`  Avg UP: +${avgUp.toFixed(2)}%, Avg DOWN: -${avgDown.toFixed(2)}%, Ratio: ${ratio.toFixed(2)}x`);
    console.log(`  Pre-Trend: ${avgPreTrend >= 0 ? '+' : ''}${avgPreTrend.toFixed(2)}%`);
    console.log(`  Winners Long (>2%): ${winnersLong}/${results.length}, Short (<-2%): ${winnersShort}/${results.length}`);
    console.log(`  => STRATEGY: ${strategy}`);

    return {
        category: categoryKey,
        count: results.length,
        avgUp: avgUp,
        avgDown: -avgDown,
        avgPreTrend: avgPreTrend,
        ratio: ratio,
        winnersLong: winnersLong,
        winnersShort: winnersShort,
        strategy: strategy,
        details: results
    };
}

async function run() {
    console.log('========================================');
    console.log('  CACHE-BASED CATEGORY ANALYSIS');
    console.log('  (No API Calls Required)');
    console.log('========================================');

    const allResults = {};

    for (const cat of CATEGORIES) {
        allResults[cat] = await analyzeCategory(cat);
    }

    // Save JSON
    fs.writeFileSync(OUT_JSON, JSON.stringify(allResults, null, 2), 'utf8');
    console.log(`\nJSON saved: ${OUT_JSON}`);

    // Generate MD
    let md = '# Universal Swing Category Analysis (Cache-Based)\n\n';
    md += '| Category | Analyzed | Avg UP (5d) | Avg DOWN (5d) | Ratio | Pre-Trend | Strategy |\n';
    md += '|---|---|---|---|---|---|---|\n';

    // Include ST_SWING_BO_DOWN from prior analysis
    md += '| SHORT_TERM_SWING_BO_DOWN | 305 | +4.70% | -2.00% | 2.35x | -5.2% | **LONG** |\n';

    for (const cat of CATEGORIES) {
        const r = allResults[cat];
        const up = r.avgUp >= 0 ? `+${r.avgUp.toFixed(2)}%` : `${r.avgUp.toFixed(2)}%`;
        const down = `${r.avgDown.toFixed(2)}%`;
        const pre = r.avgPreTrend >= 0 ? `+${r.avgPreTrend.toFixed(2)}%` : `${r.avgPreTrend.toFixed(2)}%`;
        const strat = r.strategy === 'LONG' || r.strategy === 'SHORT' ? `**${r.strategy}**` : r.strategy;
        md += `| ${cat} | ${r.count} | ${up} | ${down} | ${r.ratio.toFixed(2)}x | ${pre} | ${strat} |\n`;
    }

    md += '\n## Key\n';
    md += '- **Ratio > 1.5** = LONG edge (UP moves dominate)\n';
    md += '- **Ratio < 0.67** = SHORT edge (DOWN moves dominate)\n';
    md += '- **0.67 - 1.5** = SKIP (no clear edge)\n';

    fs.writeFileSync(OUT_MD, md, 'utf8');
    console.log(`MD saved: ${OUT_MD}`);

    console.log('\n========================================');
    console.log('  ANALYSIS COMPLETE');
    console.log('========================================');
}

run()
    .catch(e => console.error('ERROR:', e.message, e.stack))
    .finally(() => prisma.$disconnect());
