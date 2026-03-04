/**
 * COMPREHENSIVE V2.1 BUG VERIFICATION
 * 
 * Verifies ALL aspects of the backtest:
 * 1. Data validity - do all trades have actual candle data?
 * 2. Entry/Exit verification - do prices match candle data?
 * 3. Pattern verification - did patterns actually form?
 * 4. Filter verification - were all filters applied?
 * 5. Exit simulation - are exits realistic?
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import V2.1 functions
const {
    generateIntradaySignalsV21,
    simulateIntradayTradeV21,
    calculateEMA
} = require('../services/labs/intradayStrategyV2_1.cjs');

// Configuration from V2.1
const CONFIG = {
    TARGET_PERCENT: 1.5,
    MAX_OR_WIDTH_PERCENT: 2.0,
    MIN_WAIT_AFTER_OR: 15,
    MAX_WAIT_AFTER_OR: 45,
    MIN_BREAKOUT_STRENGTH: 0.005,
    MAX_EMA_DEVIATION: 0.01,
    BREAKOUT_VOLUME_MULT: 2.0
};

async function getRawCandles(symbol, date) {
    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: '5m' }
    });
    if (!cached || !cached.data) return [];

    return cached.data
        .filter(c => c.timestamp && c.timestamp.split('T')[0] === date)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function getAvgVolume(symbol, date) {
    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: 'day' }
    });
    if (!cached || !cached.data) return null;

    const priorCandles = cached.data
        .filter(c => (c.timestamp.split('T')[0] || new Date(c.timestamp).toISOString().split('T')[0]) < date)
        .slice(-20);

    if (priorCandles.length < 10) return null;
    return priorCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / priorCandles.length;
}

function isGreen(c) { return c.close > c.open; }

// ============================================================================
// ISSUE 1: DATA VALIDITY CHECK
// ============================================================================
async function validateTradeData(symbol, date) {
    const candles = await getRawCandles(symbol, date);

    return {
        symbol,
        date,
        candleCount: candles.length,
        hasData: candles.length > 0,
        isComplete: candles.length >= 300, // At least 300 candles for complete day
        firstCandle: candles[0]?.timestamp.split('T')[1].substring(0, 5) || 'N/A',
        lastCandle: candles[candles.length - 1]?.timestamp.split('T')[1].substring(0, 5) || 'N/A',
        status: candles.length >= 300 ? '✅ VALID' : candles.length > 0 ? '⚠️ INCOMPLETE' : '❌ NO DATA'
    };
}

// ============================================================================
// ISSUE 2: ENTRY/EXIT VERIFICATION
// ============================================================================
async function verifyEntryExit(trade) {
    const candles = await getRawCandles(trade.symbol, trade.date);

    // Find entry candle
    const entryCandle = candles.find(c => c.timestamp.split('T')[1].substring(0, 5) === trade.entryTime);

    // Find exit candle  
    const exitCandle = candles.find(c => c.timestamp.split('T')[1].substring(0, 5) === trade.exitTime);

    const result = {
        symbol: trade.symbol,
        date: trade.date,

        // Entry verification
        entryTime: trade.entryTime,
        entryPrice: trade.entryPrice,
        entryCandleExists: !!entryCandle,
        entryCandleData: entryCandle ? {
            open: entryCandle.open,
            high: entryCandle.high,
            low: entryCandle.low,
            close: entryCandle.close
        } : null,
        entryPriceInRange: entryCandle ?
            (trade.entryPrice >= entryCandle.low && trade.entryPrice <= entryCandle.high) : false,
        entryPriceMatch: entryCandle ?
            (trade.entryPrice === entryCandle.open ||
                trade.entryPrice === entryCandle.high ||
                trade.entryPrice === entryCandle.low ||
                trade.entryPrice === entryCandle.close) : false,

        // Exit verification
        exitTime: trade.exitTime,
        exitPrice: trade.exitPrice,
        exitReason: trade.exitReason,
        exitCandleExists: !!exitCandle,
        exitCandleData: exitCandle ? {
            open: exitCandle.open,
            high: exitCandle.high,
            low: exitCandle.low,
            close: exitCandle.close
        } : null,

        // Validation
        issues: []
    };

    // Check issues
    if (!entryCandle) result.issues.push('Entry candle not found');
    if (!exitCandle) result.issues.push('Exit candle not found');
    if (entryCandle && !result.entryPriceInRange) result.issues.push('Entry price outside candle range');

    if (exitCandle && trade.exitReason === 'TARGET_HIT') {
        if (exitCandle.high < trade.targetPrice) {
            result.issues.push(`Target ${trade.targetPrice} but candle high only ${exitCandle.high}`);
        }
    }

    if (exitCandle && trade.exitReason === 'STOP_HIT') {
        if (exitCandle.low > trade.stopPrice) {
            result.issues.push(`Stop ${trade.stopPrice} but candle low only ${exitCandle.low}`);
        }
    }

    result.status = result.issues.length === 0 ? '✅ VALID' : '❌ ISSUES';

    return result;
}

// ============================================================================
// ISSUE 3: PATTERN VERIFICATION
// ============================================================================
async function verifyPatternFormation(trade) {
    const candles = await getRawCandles(trade.symbol, trade.date);
    if (candles.length === 0) return { status: '❌ NO DATA', issues: ['No candle data'] };

    const result = {
        symbol: trade.symbol,
        date: trade.date,
        candleSequence: [],
        openingRange: null,
        pullback: null,
        breakout: null,
        issues: []
    };

    // Show first 25 candles
    for (let i = 0; i < Math.min(25, candles.length); i++) {
        const c = candles[i];
        result.candleSequence.push({
            index: i,
            time: c.timestamp.split('T')[1].substring(0, 5),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            type: isGreen(c) ? 'GREEN' : 'RED'
        });
    }

    // Detect Opening Range
    const firstIsGreen = isGreen(candles[0]);
    let orHigh = candles[0].high;
    let orLow = candles[0].low;
    let orEndIdx = 0;

    for (let i = 1; i < Math.min(30, candles.length); i++) {
        orHigh = Math.max(orHigh, candles[i].high);
        orLow = Math.min(orLow, candles[i].low);

        if ((firstIsGreen && !isGreen(candles[i])) || (!firstIsGreen && isGreen(candles[i]))) {
            orEndIdx = i;
            break;
        }
    }

    const orWidth = ((orHigh - orLow) / orLow) * 100;
    result.openingRange = {
        endIndex: orEndIdx,
        endTime: candles[orEndIdx]?.timestamp.split('T')[1].substring(0, 5),
        high: orHigh,
        low: orLow,
        widthPercent: orWidth.toFixed(2),
        widthValid: orWidth <= CONFIG.MAX_OR_WIDTH_PERCENT
    };

    if (!result.openingRange.widthValid) {
        result.issues.push(`OR width ${orWidth.toFixed(2)}% > ${CONFIG.MAX_OR_WIDTH_PERCENT}%`);
    }

    // Detect Pullback
    let pullbackLow = Infinity;
    let pullbackIdx = -1;

    for (let i = orEndIdx + 1; i < Math.min(orEndIdx + 60, candles.length); i++) {
        if (candles[i].low < pullbackLow) {
            pullbackLow = candles[i].low;
            pullbackIdx = i;
        }
    }

    if (pullbackIdx !== -1) {
        result.pullback = {
            index: pullbackIdx,
            time: candles[pullbackIdx]?.timestamp.split('T')[1].substring(0, 5),
            low: pullbackLow,
            aboveOrLow: pullbackLow > orLow
        };

        if (!result.pullback.aboveOrLow) {
            result.issues.push(`Pullback ${pullbackLow} below OR low ${orLow} - not higher low`);
        }
    }

    // Detect Breakout
    for (let i = orEndIdx + 1; i < Math.min(orEndIdx + CONFIG.MAX_WAIT_AFTER_OR + 1, candles.length); i++) {
        const c = candles[i];
        const minsAfterOR = i - orEndIdx;

        if (c.high > orHigh && minsAfterOR >= CONFIG.MIN_WAIT_AFTER_OR) {
            const breakoutStrength = (c.high - orHigh) / orHigh;

            result.breakout = {
                index: i,
                time: c.timestamp.split('T')[1].substring(0, 5),
                high: c.high,
                strengthPercent: (breakoutStrength * 100).toFixed(2),
                strengthValid: breakoutStrength >= CONFIG.MIN_BREAKOUT_STRENGTH,
                minsAfterOR,
                timeWindowValid: minsAfterOR >= CONFIG.MIN_WAIT_AFTER_OR && minsAfterOR <= CONFIG.MAX_WAIT_AFTER_OR
            };

            if (!result.breakout.strengthValid) {
                result.issues.push(`Breakout strength ${(breakoutStrength * 100).toFixed(2)}% < required ${CONFIG.MIN_BREAKOUT_STRENGTH * 100}%`);
            }

            break;
        }
    }

    if (!result.breakout) {
        result.issues.push('No valid breakout detected');
    }

    result.status = result.issues.length === 0 ? '✅ VALID PATTERN' : '⚠️ PATTERN ISSUES';

    return result;
}

// ============================================================================
// ISSUE 4: FILTER VERIFICATION
// ============================================================================
async function verifyFilters(trade) {
    const candles = await getRawCandles(trade.symbol, trade.date);
    const avgDailyVol = await getAvgVolume(trade.symbol, trade.date);

    if (candles.length === 0) return { status: '❌ NO DATA', issues: ['No candle data'] };

    const result = {
        symbol: trade.symbol,
        date: trade.date,
        filters: {},
        issues: []
    };

    // Get OR data
    const firstIsGreen = isGreen(candles[0]);
    let orHigh = candles[0].high, orLow = candles[0].low, orEndIdx = 0;

    for (let i = 1; i < Math.min(30, candles.length); i++) {
        orHigh = Math.max(orHigh, candles[i].high);
        orLow = Math.min(orLow, candles[i].low);
        if ((firstIsGreen && !isGreen(candles[i])) || (!firstIsGreen && isGreen(candles[i]))) {
            orEndIdx = i;
            break;
        }
    }

    const orWidth = ((orHigh - orLow) / orLow) * 100;

    // Find pullback and breakout
    let pullbackLow = Infinity, pullbackIdx = -1, breakoutIdx = -1, breakoutCandle = null;

    for (let i = orEndIdx + 1; i < Math.min(orEndIdx + 60, candles.length); i++) {
        if (candles[i].low < pullbackLow) {
            pullbackLow = candles[i].low;
            pullbackIdx = i;
        }

        if (candles[i].high > orHigh && breakoutIdx === -1 && (i - orEndIdx) >= CONFIG.MIN_WAIT_AFTER_OR) {
            breakoutIdx = i;
            breakoutCandle = candles[i];
            break;
        }
    }

    // FILTER 1: OR Width < 2%
    result.filters.orWidth = {
        name: 'OR Width < 2%',
        actual: orWidth.toFixed(2) + '%',
        required: '< 2%',
        passed: orWidth <= CONFIG.MAX_OR_WIDTH_PERCENT
    };

    if (!result.filters.orWidth.passed) {
        result.issues.push(`Filter FAIL: OR Width ${orWidth.toFixed(2)}% > 2%`);
    }

    // FILTER 2: Time Window 15-45 min
    if (breakoutIdx !== -1) {
        const minsAfterOR = breakoutIdx - orEndIdx;
        result.filters.timeWindow = {
            name: 'Time Window 15-45 min',
            actual: minsAfterOR + ' mins',
            required: '15-45 mins',
            passed: minsAfterOR >= 15 && minsAfterOR <= 45
        };

        if (!result.filters.timeWindow.passed) {
            result.issues.push(`Filter FAIL: Breakout ${minsAfterOR} mins after OR (need 15-45)`);
        }
    }

    // FILTER 3: Higher Low
    result.filters.higherLow = {
        name: 'Higher Low (pullback > OR low)',
        actual: `Pullback ${pullbackLow.toFixed(2)} vs OR low ${orLow.toFixed(2)}`,
        required: 'Pullback > OR Low',
        passed: pullbackLow > orLow
    };

    if (!result.filters.higherLow.passed) {
        result.issues.push(`Filter FAIL: Pullback ${pullbackLow} <= OR low ${orLow}`);
    }

    // FILTER 4: Breakout Strength > 0.5%
    if (breakoutCandle) {
        const strength = ((breakoutCandle.high - orHigh) / orHigh) * 100;
        result.filters.breakoutStrength = {
            name: 'Breakout Strength > 0.5%',
            actual: strength.toFixed(2) + '%',
            required: '> 0.5%',
            passed: strength >= 0.5
        };

        if (!result.filters.breakoutStrength.passed) {
            result.issues.push(`Filter FAIL: Breakout strength ${strength.toFixed(2)}% < 0.5%`);
        }

        // FILTER 5: Breakout Volume
        if (avgDailyVol) {
            const avgCandleVol = avgDailyVol / 375;
            const breakoutVol = breakoutCandle.volume || 0;
            const volRatio = breakoutVol / avgCandleVol;

            result.filters.breakoutVolume = {
                name: 'Breakout Volume 2x',
                actual: volRatio.toFixed(2) + 'x',
                required: '> 2x',
                passed: volRatio >= 2
            };
        }

        // FILTER 6: EMA Deviation
        if (pullbackIdx !== -1) {
            const emaCandles = candles.slice(0, pullbackIdx + 1);
            const ema20 = calculateEMA(emaCandles, 20);

            if (ema20) {
                const deviation = Math.abs(pullbackLow - ema20) / ema20 * 100;
                result.filters.emaDeviation = {
                    name: 'EMA Deviation < 1%',
                    actual: deviation.toFixed(2) + '%',
                    required: '< 1%',
                    passed: deviation <= 1
                };
            }
        }
    }

    // Check 2 of 3 enhanced filters
    const enhancedFilters = [
        result.filters.breakoutStrength?.passed,
        result.filters.breakoutVolume?.passed,
        result.filters.emaDeviation?.passed
    ].filter(Boolean).length;

    result.enhancedFiltersPassed = enhancedFilters;
    result.enhancedFiltersRequired = 2;
    result.enhancedFiltersOK = enhancedFilters >= 2;

    if (!result.enhancedFiltersOK) {
        result.issues.push(`Enhanced filters: only ${enhancedFilters}/3 passed (need 2)`);
    }

    result.status = result.issues.length === 0 ? '✅ ALL FILTERS PASSED' : '⚠️ FILTER ISSUES';

    return result;
}

// ============================================================================
// ISSUE 5: EXIT SIMULATION VERIFICATION
// ============================================================================
async function verifyExitSimulation(trade) {
    const candles = await getRawCandles(trade.symbol, trade.date);

    if (candles.length === 0) return { status: '❌ NO DATA', issues: ['No candle data'] };

    // Find entry candle index
    const entryIdx = candles.findIndex(c => c.timestamp.split('T')[1].substring(0, 5) === trade.entryTime);

    if (entryIdx === -1) return { status: '❌ NO ENTRY', issues: ['Entry candle not found'] };

    const result = {
        symbol: trade.symbol,
        date: trade.date,
        entryTime: trade.entryTime,
        entryPrice: trade.entryPrice,
        targetPrice: trade.targetPrice,
        stopPrice: trade.stopPrice,
        expectedExitReason: trade.exitReason,
        expectedExitPrice: trade.exitPrice,
        candlesAfterEntry: [],
        simulation: null,
        issues: []
    };

    // Show 30 candles after entry
    for (let i = entryIdx; i < Math.min(entryIdx + 30, candles.length); i++) {
        const c = candles[i];
        result.candlesAfterEntry.push({
            index: i - entryIdx,
            time: c.timestamp.split('T')[1].substring(0, 5),
            high: c.high,
            low: c.low,
            targetHit: c.high >= trade.targetPrice,
            stopHit: c.low <= trade.stopPrice
        });
    }

    // Simulate exit
    let simExitReason = 'EOD_EXIT';
    let simExitPrice = 0;
    let simExitIdx = -1;

    for (let i = entryIdx; i < candles.length; i++) {
        const c = candles[i];

        if (c.high >= trade.targetPrice) {
            simExitReason = 'TARGET_HIT';
            simExitPrice = trade.targetPrice;
            simExitIdx = i;
            break;
        }

        if (c.low <= trade.stopPrice) {
            simExitReason = 'STOP_HIT';
            simExitPrice = trade.stopPrice;
            simExitIdx = i;
            break;
        }
    }

    if (simExitReason === 'EOD_EXIT') {
        simExitPrice = candles[candles.length - 1].close;
        simExitIdx = candles.length - 1;
    }

    result.simulation = {
        exitReason: simExitReason,
        exitPrice: simExitPrice,
        exitCandleIdx: simExitIdx,
        exitTime: candles[simExitIdx]?.timestamp.split('T')[1].substring(0, 5)
    };

    // Compare
    if (simExitReason !== trade.exitReason) {
        result.issues.push(`Exit reason mismatch: sim=${simExitReason}, trade=${trade.exitReason}`);
    }

    if (Math.abs(simExitPrice - trade.exitPrice) > 0.01) {
        result.issues.push(`Exit price mismatch: sim=${simExitPrice}, trade=${trade.exitPrice}`);
    }

    result.status = result.issues.length === 0 ? '✅ EXIT VALID' : '⚠️ EXIT ISSUES';

    return result;
}

// ============================================================================
// MAIN VERIFICATION RUNNER
// ============================================================================
async function runFullVerification() {
    console.log('═'.repeat(80));
    console.log('COMPREHENSIVE V2.1 BUG VERIFICATION');
    console.log('═'.repeat(80));
    console.log('');

    // Get all trades
    const dates = [
        '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
        '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-16', '2026-01-19'
    ];

    const allTrades = [];

    for (const dateStr of dates) {
        const date = new Date(dateStr);
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        const signals = await generateIntradaySignalsV21('INTRADAY_BOOST', date);
        for (const signal of signals) {
            const trade = await simulateIntradayTradeV21(signal, date);
            allTrades.push(trade);
        }
    }

    console.log(`\nTotal trades to verify: ${allTrades.length}\n`);

    // ========================================
    // ISSUE 1: DATA VALIDITY CHECK
    // ========================================
    console.log('─'.repeat(80));
    console.log('ISSUE 1: DATA VALIDITY CHECK (All 35 trades)');
    console.log('─'.repeat(80));

    let validData = 0, incompleteData = 0, noData = 0;

    for (const trade of allTrades) {
        const result = await validateTradeData(trade.symbol, trade.date);

        if (result.candleCount >= 300) validData++;
        else if (result.candleCount > 0) incompleteData++;
        else noData++;

        if (result.candleCount < 300) {
            console.log(`${result.status} ${trade.symbol} on ${trade.date}: ${result.candleCount} candles (${result.firstCandle} - ${result.lastCandle})`);
        }
    }

    console.log(`\nSummary: Valid=${validData}, Incomplete=${incompleteData}, NoData=${noData}`);

    // ========================================
    // ISSUE 2: ENTRY/EXIT VERIFICATION (5 random)
    // ========================================
    console.log('\n' + '─'.repeat(80));
    console.log('ISSUE 2: ENTRY/EXIT VERIFICATION (5 random trades)');
    console.log('─'.repeat(80));

    const sample5 = allTrades.slice(0, 5);

    for (const trade of sample5) {
        const result = await verifyEntryExit(trade);
        console.log(`\n${result.status} ${trade.symbol} on ${trade.date}`);
        console.log(`  Entry: ${result.entryTime} at ${result.entryPrice}`);
        if (result.entryCandleData) {
            console.log(`  Entry Candle: O=${result.entryCandleData.open} H=${result.entryCandleData.high} L=${result.entryCandleData.low} C=${result.entryCandleData.close}`);
        }
        console.log(`  Exit: ${result.exitTime} at ${result.exitPrice} (${result.exitReason})`);
        if (result.issues.length > 0) {
            result.issues.forEach(i => console.log(`    ⚠️ ${i}`));
        }
    }

    // ========================================
    // ISSUE 3: PATTERN VERIFICATION (3 trades)
    // ========================================
    console.log('\n' + '─'.repeat(80));
    console.log('ISSUE 3: PATTERN VERIFICATION (3 trades)');
    console.log('─'.repeat(80));

    const sample3 = allTrades.slice(0, 3);

    for (const trade of sample3) {
        const result = await verifyPatternFormation(trade);
        console.log(`\n${result.status} ${trade.symbol} on ${trade.date}`);

        if (result.openingRange) {
            console.log(`  Opening Range: candles 0-${result.openingRange.endIndex}, High=${result.openingRange.high}, Low=${result.openingRange.low}, Width=${result.openingRange.widthPercent}%`);
        }

        if (result.pullback) {
            console.log(`  Pullback: candle ${result.pullback.index} (${result.pullback.time}), Low=${result.pullback.low}, Above OR Low: ${result.pullback.aboveOrLow ? 'YES' : 'NO'}`);
        }

        if (result.breakout) {
            console.log(`  Breakout: candle ${result.breakout.index} (${result.breakout.time}), Strength=${result.breakout.strengthPercent}% (valid: ${result.breakout.strengthValid ? 'YES' : 'NO'})`);
        }

        if (result.issues.length > 0) {
            console.log(`  Issues:`);
            result.issues.forEach(i => console.log(`    ⚠️ ${i}`));
        }
    }

    // ========================================
    // ISSUE 4: FILTER VERIFICATION (5 trades)
    // ========================================
    console.log('\n' + '─'.repeat(80));
    console.log('ISSUE 4: FILTER VERIFICATION (5 trades)');
    console.log('─'.repeat(80));

    for (const trade of sample5) {
        const result = await verifyFilters(trade);
        console.log(`\n${result.status} ${trade.symbol} on ${trade.date}`);

        for (const [key, filter] of Object.entries(result.filters)) {
            if (filter && typeof filter === 'object' && filter.name) {
                console.log(`  ${filter.passed ? '✅' : '❌'} ${filter.name}: ${filter.actual} (need: ${filter.required})`);
            }
        }

        console.log(`  Enhanced filters: ${result.enhancedFiltersPassed}/3 passed (need 2): ${result.enhancedFiltersOK ? '✅' : '❌'}`);

        if (result.issues.length > 0) {
            result.issues.forEach(i => console.log(`    ⚠️ ${i}`));
        }
    }

    // ========================================
    // ISSUE 5: EXIT SIMULATION (3 trades)
    // ========================================
    console.log('\n' + '─'.repeat(80));
    console.log('ISSUE 5: EXIT SIMULATION VERIFICATION (3 trades)');
    console.log('─'.repeat(80));

    for (const trade of sample3) {
        const result = await verifyExitSimulation(trade);
        console.log(`\n${result.status} ${trade.symbol} on ${trade.date}`);
        console.log(`  Entry: ${result.entryTime} at ${result.entryPrice}`);
        console.log(`  Target: ${result.targetPrice}, Stop: ${result.stopPrice}`);

        if (result.simulation) {
            console.log(`  Simulation: Exit at ${result.simulation.exitTime} (${result.simulation.exitReason}) price ${result.simulation.exitPrice}`);
            console.log(`  Trade says: Exit at ${result.expectedExitReason} price ${result.expectedExitPrice}`);
        }

        if (result.issues.length > 0) {
            result.issues.forEach(i => console.log(`    ⚠️ ${i}`));
        }
    }

    // ========================================
    // BUG SUMMARY
    // ========================================
    console.log('\n' + '═'.repeat(80));
    console.log('BUG SUMMARY REPORT');
    console.log('═'.repeat(80));

    console.log(`
Data Validity: ${validData}/${allTrades.length} trades have complete data
Incomplete: ${incompleteData}, No data: ${noData}

Run complete. Check above for specific issues marked with ⚠️
    `);
}

runFullVerification()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
