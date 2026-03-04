/**
 * analyze_segmented_st_down.cjs
 * 
 * Performs "Pro Trader" segmented analysis on ST_SWING_BO_DOWN stocks.
 * MODIFIED: Uses SMA20 as Trend proxy due to limited data depth.
 */

const prisma = require('../lib/prisma.cjs');

async function analyzeSegmentation() {
    console.log('Fetching data for SHORT_TERM_SWING_BO_DOWN...');

    // 1. Get Stocks
    const categoryKey = 'SHORT_TERM_SWING_BO_DOWN';
    const stocks = await prisma.$queryRaw`
        SELECT s.symbol, sc.added_date
        FROM stock_categories sc
        JOIN stocks s ON sc.stock_id = s.id
        JOIN categories c ON sc.category_id = c.id
        WHERE c.key = ${categoryKey}
          AND sc.added_date < NOW() - INTERVAL '7 days'
        ORDER BY sc.added_date DESC
    `;

    // 2. Get Cache
    const cacheEntries = await prisma.ohlcvCache.findMany({
        where: { interval: 'day' },
        select: { symbol: true, data: true }
    });

    const cacheMap = {};
    for (const entry of cacheEntries) {
        const candles = Array.isArray(entry.data) ? entry.data : [];
        if (candles.length >= 25) { // RELAXED: Need 25+
            if (!cacheMap[entry.symbol]) cacheMap[entry.symbol] = [];
            cacheMap[entry.symbol] = candles;
        }
    }

    // 3. Analyze Each Stock
    const segments = {
        'OVERSOLD_REVERSAL': { count: 0, wins: 0, total_pnl: 0 },
        'DIP_IN_UPTREND': { count: 0, wins: 0, total_pnl: 0 },
        'TREND_DOWN_CONT': { count: 0, wins: 0, total_pnl: 0 },
        'OTHER': { count: 0, wins: 0, total_pnl: 0 }
    };

    const rawData = [];

    for (const stock of stocks) {
        const candles = cacheMap[stock.symbol];
        if (!candles) continue;

        // Sort
        candles.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Find Signal Date
        const addedDate = new Date(stock.added_date).toISOString().split('T')[0];
        let idx = -1;

        // Find exact or closest date
        let minDiff = Infinity;
        for (let i = 0; i < candles.length; i++) {
            const cDate = new Date(candles[i].timestamp).toISOString().split('T')[0];
            if (cDate === addedDate) {
                idx = i; break;
            }
            const diff = Math.abs(new Date(candles[i].timestamp) - new Date(stock.added_date));
            if (diff < minDiff) {
                minDiff = diff;
                idx = i;
            }
        }

        // Check if reasonably close (within 2 days)
        if (idx !== -1) {
            const diff = Math.abs(new Date(candles[idx].timestamp) - new Date(stock.added_date));
            if (diff > 2 * 86400000) idx = -1;
        }

        // Need 20 days prior (SMA20) and 5 days after
        if (idx < 20 || idx >= candles.length - 5) continue;

        const day0 = candles[idx];
        const day5 = candles[idx + 5];
        const close = day0.close;

        // --- INDICATORS ---

        // 1. Trend (SMA 20)
        let sum20 = 0;
        for (let k = 0; k < 20; k++) sum20 += candles[idx - k].close;
        const sma20 = sum20 / 20;
        const trend = close > sma20 ? 'UP' : 'DOWN';

        // 2. Prior 20d Move
        // If idx-20 exists
        const dayMinus20 = candles[idx - 20];
        const priorMove = ((close - dayMinus20.close) / dayMinus20.close) * 100;

        // 3. RSI 14
        let gains = 0, losses = 0;
        // Need 14 days prior
        if (idx < 14) continue;
        for (let k = 14; k >= 1; k--) {
            const change = candles[idx - k + 1].close - candles[idx - k].close;
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }
        let avgGain = gains / 14;
        let avgLoss = losses / 14;
        let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

        // --- OUTCOME ---
        const profitPct = ((day5.close - day0.close) / day0.close) * 100;
        const isWin = profitPct > 0;

        // --- SEGMENTATION ---
        let segment = 'OTHER';

        if (trend === 'UP') { // Above SMA20
            if (priorMove < -10 && rsi < 35) {
                segment = 'OVERSOLD_REVERSAL';
            } else if (priorMove >= -10 && priorMove < -3) { // Adjusted -5 to -3 for testing
                segment = 'DIP_IN_UPTREND';
            }
        } else {
            // Trend DOWN
            segment = 'TREND_DOWN_CONT';
        }

        // Stats
        segments[segment].count++;
        if (isWin) segments[segment].wins++;
        segments[segment].total_pnl += profitPct;
    }

    console.log('\nSEGMENTATION RESULTS (Outcome: Buying Day 0 -> Sell Day 5)');
    console.log('-----------------------------------------------------------');
    console.log('| Segment             | Count | Win Rate | Avg P&L | Recommendation |');
    console.log('|---------------------|-------|----------|---------|----------------|');

    for (const [key, data] of Object.entries(segments)) {
        if (data.count === 0) {
            console.log(`| ${key.padEnd(19)} | 0     | N/A      | N/A     | N/A            |`);
            continue;
        }
        const wr = ((data.wins / data.count) * 100).toFixed(1);
        const avg = (data.total_pnl / data.count).toFixed(2);
        let rec = 'SKIP';
        if (parseFloat(avg) > 2.0 && parseFloat(wr) > 60) rec = 'STRONG BUY';
        else if (parseFloat(avg) > 0.5) rec = 'BUY';
        else if (parseFloat(avg) < -1.0) rec = 'SHORT';

        console.log(`| ${key.padEnd(19)} | ${data.count.toString().padEnd(5)} | ${wr}%    | ${avg}%  | ${rec.padEnd(14)} |`);
    }
}

analyzeSegmentation()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
