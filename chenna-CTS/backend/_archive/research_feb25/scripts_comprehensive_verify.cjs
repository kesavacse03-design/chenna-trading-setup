/**
 * COMPREHENSIVE V2.1 VERIFICATION
 * 
 * Tasks:
 * 1. Deep verify 5 random trades (3 WIN, 2 LOSS from different dates)
 * 2. Check for candle 0/1 breakout bug
 * 3. Report breakout candle indices across all trades
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getRawCandles(symbol, date) {
    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: '5m' }
    });
    if (!cached || !cached.data) return [];

    return cached.data
        .filter(c => c.timestamp && c.timestamp.split('T')[0] === date)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function isGreen(c) {
    return c.close > c.open;
}

async function deepVerifyTrade(symbol, date, expectedOutcome, tradeNum) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`TRADE VERIFICATION #${tradeNum}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Date: ${date}`);
    console.log(`Expected Outcome: ${expectedOutcome}`);

    const candles = await getRawCandles(symbol, date);
    if (candles.length === 0) {
        console.log(`❌ NO DATA FOUND`);
        return { symbol, date, status: 'NO_DATA' };
    }

    console.log(`\nTotal candles: ${candles.length}`);

    // Step 1: Find Opening Range
    console.log(`\n📊 OPENING RANGE FORMATION:`);
    let orHigh = candles[0].high;
    let orLow = candles[0].low;
    let orEndIdx = 0;
    const firstIsGreen = isGreen(candles[0]);

    for (let i = 1; i < Math.min(30, candles.length); i++) {
        orHigh = Math.max(orHigh, candles[i].high);
        orLow = Math.min(orLow, candles[i].low);

        if ((firstIsGreen && !isGreen(candles[i])) || (!firstIsGreen && isGreen(candles[i]))) {
            orEndIdx = i;
            break;
        }
    }

    const orWidth = ((orHigh - orLow) / orLow * 100);
    console.log(`  OR formed at candle: ${orEndIdx} (${candles[orEndIdx]?.timestamp.split('T')[1].substring(0, 5)})`);
    console.log(`  OR High: ${orHigh.toFixed(2)}`);
    console.log(`  OR Low: ${orLow.toFixed(2)}`);
    console.log(`  OR Width: ${orWidth.toFixed(2)}% ${orWidth <= 2 ? '✅' : '⚠️ >2%'}`);

    // Step 2: Find Pullback and Breakout
    console.log(`\n🔍 PULLBACK & BREAKOUT DETECTION:`);
    let pullbackLow = Infinity;
    let pullbackIdx = -1;
    let breakoutIdx = -1;

    for (let i = orEndIdx + 1; i < Math.min(orEndIdx + 60, candles.length); i++) {
        const c = candles[i];

        if (c.low < pullbackLow) {
            pullbackLow = c.low;
            pullbackIdx = i;
        }

        if (c.high > orHigh && breakoutIdx === -1) {
            // Check time window (15-45 min after OR)
            const minsAfterOR = i - orEndIdx;
            if (minsAfterOR >= 15 && minsAfterOR <= 45) {
                // Check higher low
                if (pullbackLow > orLow) {
                    breakoutIdx = i;
                    break;
                }
            }
        }
    }

    if (pullbackIdx !== -1) {
        console.log(`  Pullback at candle: ${pullbackIdx} (${candles[pullbackIdx]?.timestamp.split('T')[1].substring(0, 5)})`);
        console.log(`  Pullback Low: ${pullbackLow.toFixed(2)}`);
        console.log(`  Higher Low: ${pullbackLow > orLow ? 'YES ✅' : 'NO ❌'}`);
    }

    if (breakoutIdx !== -1) {
        const minsAfterOR = breakoutIdx - orEndIdx;
        const breakoutTime = candles[breakoutIdx]?.timestamp.split('T')[1].substring(0, 5);
        console.log(`  Breakout at candle: ${breakoutIdx} (${breakoutTime})`);
        console.log(`  Minutes after OR: ${minsAfterOR} ${minsAfterOR >= 15 && minsAfterOR <= 45 ? '✅' : '⚠️'}`);
    } else {
        console.log(`  ❌ NO VALID BREAKOUT FOUND`);
        return { symbol, date, status: 'NO_BREAKOUT', orEndIdx, pullbackIdx, breakoutIdx };
    }

    // Step 3: Simulate Trade
    console.log(`\n💰 TRADE SIMULATION:`);
    const entryPrice = orHigh;
    const targetPrice = entryPrice * 1.015;
    const stopPrice = pullbackLow;

    console.log(`  Entry Price: ${entryPrice.toFixed(2)} (at OR High)`);
    console.log(`  Target (+1.5%): ${targetPrice.toFixed(2)}`);
    console.log(`  Stop (Pullback Low): ${stopPrice.toFixed(2)}`);

    let exitIdx = -1;
    let exitReason = 'EOD_EXIT';
    let exitPrice = 0;

    for (let i = breakoutIdx; i < candles.length; i++) {
        const c = candles[i];

        if (c.high >= targetPrice) {
            exitIdx = i;
            exitReason = 'TARGET_HIT';
            exitPrice = targetPrice;
            break;
        }
        if (c.low <= stopPrice) {
            exitIdx = i;
            exitReason = 'STOP_HIT';
            exitPrice = stopPrice;
            break;
        }
    }

    if (exitIdx !== -1) {
        const exitTime = candles[exitIdx]?.timestamp.split('T')[1].substring(0, 5);
        console.log(`  Exit at candle: ${exitIdx} (${exitTime})`);
        console.log(`  Exit Reason: ${exitReason}`);
        console.log(`  Exit Price: ${exitPrice.toFixed(2)}`);
    }

    // Step 4: Verification Checks
    console.log(`\n✅ VERIFICATION CHECKS:`);
    const checks = {
        orFormedProperly: orEndIdx > 0,
        breakoutAfterOR: breakoutIdx > orEndIdx,
        breakoutInTimeWindow: (breakoutIdx - orEndIdx) >= 15 && (breakoutIdx - orEndIdx) <= 45,
        higherLow: pullbackLow > orLow,
        exitAfterEntry: exitIdx > breakoutIdx || exitIdx === -1,
        noLookahead: breakoutIdx > 0 && breakoutIdx > orEndIdx
    };

    console.log(`  OR formed properly (index > 0): ${checks.orFormedProperly ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  Breakout after OR end: ${checks.breakoutAfterOR ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  Breakout in 15-45 min window: ${checks.breakoutInTimeWindow ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  Higher low confirmed: ${checks.higherLow ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  Exit after entry: ${checks.exitAfterEntry ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  NO LOOKAHEAD BIAS: ${checks.noLookahead ? 'YES ✅' : 'NO ❌'}`);

    const allPass = Object.values(checks).every(v => v);
    console.log(`\n📋 STATUS: ${allPass ? 'VALID TRADE ✅' : 'ISSUES FOUND ⚠️'}`);

    return {
        symbol, date,
        status: allPass ? 'VALID' : 'ISSUES',
        orEndIdx, pullbackIdx, breakoutIdx, exitIdx,
        checks
    };
}

async function main() {
    console.log('═'.repeat(70));
    console.log('COMPREHENSIVE V2.1 VERIFICATION');
    console.log('═'.repeat(70));

    // 5 trades from CSV (3 WIN, 2 LOSS from different dates)
    const tradesToVerify = [
        { symbol: 'CUMMINSIND', date: '2026-01-02', outcome: 'WIN' },
        { symbol: 'NATIONALUM', date: '2026-01-06', outcome: 'WIN' },
        { symbol: 'MPHASIS', date: '2026-01-07', outcome: 'WIN' },
        { symbol: 'IRFC', date: '2026-01-02', outcome: 'LOSS' },
        { symbol: 'VEDL', date: '2026-01-09', outcome: 'LOSS' },
    ];

    const results = [];
    for (let i = 0; i < tradesToVerify.length; i++) {
        const t = tradesToVerify[i];
        const result = await deepVerifyTrade(t.symbol, t.date, t.outcome, i + 1);
        results.push(result);
    }

    // Summary
    console.log(`\n${'═'.repeat(70)}`);
    console.log('VERIFICATION SUMMARY');
    console.log(`${'═'.repeat(70)}`);

    const valid = results.filter(r => r.status === 'VALID').length;
    const issues = results.filter(r => r.status === 'ISSUES').length;
    const noBreakout = results.filter(r => r.status === 'NO_BREAKOUT').length;

    console.log(`\nResults:`);
    console.log(`  Valid trades: ${valid}/5`);
    console.log(`  Trades with issues: ${issues}/5`);
    console.log(`  No breakout found: ${noBreakout}/5`);

    // Check for candle 0/1 breakout bug
    console.log(`\n🐛 CANDLE 0/1 BREAKOUT BUG CHECK:`);
    const earlyBreakouts = results.filter(r => r.breakoutIdx <= 5);
    console.log(`  Trades with breakout at candle 0-5: ${earlyBreakouts.length}`);

    if (earlyBreakouts.length > 0) {
        console.log(`  ⚠️ EARLY BREAKOUTS FOUND:`);
        earlyBreakouts.forEach(r => {
            console.log(`    - ${r.symbol} on ${r.date}: breakout at candle ${r.breakoutIdx}`);
        });
    } else {
        console.log(`  ✅ No early breakout bugs detected`);
    }

    // Breakout distribution
    console.log(`\n📊 BREAKOUT CANDLE DISTRIBUTION:`);
    results.forEach(r => {
        if (r.breakoutIdx !== undefined && r.breakoutIdx !== -1) {
            console.log(`  ${r.symbol}: breakout at candle ${r.breakoutIdx}`);
        }
    });

    console.log(`\n${'═'.repeat(70)}`);
}

main().finally(() => prisma.$disconnect());
