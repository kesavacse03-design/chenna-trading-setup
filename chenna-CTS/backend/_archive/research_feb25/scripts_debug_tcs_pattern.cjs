const { get1MinCandles, detectNPatternV21, detectOpeningRange } = require('../services/labs/intradayStrategyV2_1.cjs');
const prisma = require('../lib/prisma.cjs');

async function traceTCS() {
    const symbol = 'TCS';
    const date = '2026-02-05';

    console.log(`TRACING TCS PATTERN on ${date}`);
    const candles = await get1MinCandles(symbol, date);

    // 1. OR
    const or = detectOpeningRange(candles, 'STRICT');
    if (!or) {
        console.log('OR Detection Failed');
        return;
    }
    console.log(`OR: High=${or.high}, Low=${or.low}, EndIndex=${or.endIndex}`);

    // 2. Trace Loop
    const startIndex = or.endIndex + 1;
    let pullbackLow = Infinity;

    console.log('\n--- CANDLE TRACE ---');
    console.log('Time      | High   | Low    | Breakout% | P.Low  | >OR.Low? | Status');

    for (let i = startIndex; i < Math.min(candles.length, startIndex + 60); i++) {
        const c = candles[i];
        const time = c.timestamp.split('T')[1].substring(0, 5);

        if (c.low < pullbackLow) pullbackLow = c.low;

        if (c.high > or.high) {
            const breakoutStr = ((c.high - or.high) / or.high) * 100;
            const validPullback = pullbackLow > or.low;

            console.log(`[${time}] High=${c.high} (+${breakoutStr.toFixed(2)}%) | Low=${c.low} | PLow=${pullbackLow} (${validPullback ? 'Valid' : 'INVALID'})`);
        }
    }
}

traceTCS().catch(console.error).finally(() => prisma.$disconnect());
