const priceService = require('../priceService.cjs');

/**
 * Swing Breakdown - Long Strategy (3-Tier System)
 * 
 * Logic:
 * 1. Calculate 10-Day Pre-Trend (from Signal Day Open back 10 days).
 * 2. Classify into Tier 1, 2, or 3.
 * 3. Return Entry/Target/Stop parameters.
 */

async function analyze(symbol, signalDateString) {
    // 1. Fetch Data needs to be handled by caller? 
    // Or we fetch here? Better to fetch here to be self-contained.

    // Fetch 20 days range
    const signalDate = new Date(signalDateString);
    const fromDate = new Date(signalDate);
    fromDate.setDate(fromDate.getDate() - 20);
    const toDate = new Date(signalDate);

    // Fetch Daily candles for Trend Calc (or 30min if that's what we have)
    // Using 30min offers more granularity but daily is enough for trend.
    // Let's use 30min to match previous validation.

    let candles = [];
    try {
        candles = await priceService.fetchPrice(symbol, null,
            fromDate.toISOString().split('T')[0],
            toDate.toISOString().split('T')[0], '30minute');
    } catch (e) {
        return { error: e.message };
    }

    if (!candles || candles.length < 50) return { error: 'Insufficient Data' };

    // Sort
    candles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

    // Find Signal Candle (Last candle of the signal date)
    const dayCandles = candles.filter(c => (c.timestamp || c.date).startsWith(signalDateString));
    if (dayCandles.length === 0) return { error: 'No data on signal date' };

    const signalOpen = dayCandles[0].open;

    // Find approx 10 days ago
    const signalIdx = candles.indexOf(dayCandles[0]);
    const trendStartIdx = Math.max(0, signalIdx - 150); // ~10 days of 30min candles

    if (trendStartIdx >= signalIdx) return { error: 'Not enough history for trend' };

    const price10d = candles[trendStartIdx].close;
    const trendPct = ((signalOpen - price10d) / price10d) * 100;

    // Classify
    let tier = 'TIER 3 (UPTREND)';
    let targetPct = 4.0;
    let stopPct = 2.0;

    if (trendPct < -5.0) {
        tier = 'TIER 1 (OVERSOLD)';
        targetPct = 6.0;
        stopPct = 5.0; // Optimized Wide Stop
    } else if (trendPct <= 0) {
        tier = 'TIER 2 (FRESH)';
        targetPct = 4.0;
        stopPct = 2.0;
    }

    return {
        symbol,
        date: signalDateString,
        tier,
        trend10d: parseFloat(trendPct.toFixed(2)),
        action: 'BUY',
        entryType: 'NEXT_OPEN',
        targetPct,
        stopPct,
        maxHoldDays: 5
    };
}

module.exports = { analyze };
