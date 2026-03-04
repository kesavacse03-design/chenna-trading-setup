/**
 * DEEP VERIFICATION SCRIPT
 * 
 * Proves whether backtest results are real or fake by:
 * 1. Fetching raw candle data from DB for a specific stock
 * 2. Manually simulating a trade step by step
 * 3. Comparing with what the backtest engine produces
 * 
 * Usage: node verify_backtest.cjs TITAN 2026-01-07
 */

const { PrismaClient } = require('@prisma/client');
const { calculateIntelligentStop, calculateTrailingStop } = require('./chenna-CTS/backend/services/stopLossCalculator.cjs');

const prisma = new PrismaClient();

async function getDailyCandles(symbol) {
    // Same method as multiSupportBoStrategy.cjs
    const caches = await prisma.ohlcvCache.findMany({
        where: { symbol, interval: 'day' }
    });
    if (!caches.length) {
        console.log(`❌ No OhlcvCache records found for ${symbol}`);
        return [];
    }

    console.log(`📦 Found ${caches.length} cache records for ${symbol}`);

    const all = [];
    for (const c of caches) {
        const data = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
        console.log(`   Cache: ${c.fromDate} → ${c.toDate} | ${data.length} candles | source: ${c.source || 'unknown'}`);
        all.push(...data);
    }

    // Deduplicate by date
    const unique = {};
    for (const c of all) {
        const dt = (c.timestamp || c.date || '').split('T')[0];
        if (dt) unique[dt] = {
            timestamp: c.timestamp || c.date,
            date: dt,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseInt(c.volume || 0)
        };
    }

    return Object.values(unique).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function verify(symbol, signalDate) {
    console.log('\n' + '═'.repeat(70));
    console.log(`  DEEP VERIFICATION: ${symbol} (Signal: ${signalDate})`);
    console.log('═'.repeat(70) + '\n');

    // 1. Get ALL candle data from DB
    const candles = await getDailyCandles(symbol);
    if (candles.length === 0) {
        console.log('❌ No candle data found!');
        return;
    }

    console.log(`\n📊 Total unique candles: ${candles.length}`);
    console.log(`   Date range: ${candles[0].date} → ${candles[candles.length - 1].date}\n`);

    // 2. Show candles around the signal date
    const signalIdx = candles.findIndex(c => c.date === signalDate);
    if (signalIdx === -1) {
        console.log(`❌ Signal date ${signalDate} not found in candle data!`);
        console.log(`   Closest dates:`);
        const close = candles.filter(c => Math.abs(new Date(c.date) - new Date(signalDate)) < 7 * 86400000);
        close.forEach(c => console.log(`   ${c.date}: O=${c.open} H=${c.high} L=${c.low} C=${c.close}`));
        return;
    }

    console.log('─'.repeat(70));
    console.log('  RAW CANDLE DATA FROM DATABASE (around signal date)');
    console.log('─'.repeat(70));
    console.log('  Date       |   Open    |   High    |   Low     |   Close   | Volume');
    console.log('─'.repeat(70));

    const startShow = Math.max(0, signalIdx - 5);
    const endShow = Math.min(candles.length, signalIdx + 25);
    for (let i = startShow; i < endShow; i++) {
        const c = candles[i];
        const marker = i === signalIdx ? ' ← SIGNAL' :
            i === signalIdx + 1 ? ' ← ENTRY' : '';
        console.log(`  ${c.date} | ${String(c.open.toFixed(2)).padStart(9)} | ${String(c.high.toFixed(2)).padStart(9)} | ${String(c.low.toFixed(2)).padStart(9)} | ${String(c.close.toFixed(2)).padStart(9)} | ${String(c.volume).padStart(8)}${marker}`);
    }

    // 3. Calculate stop/target using SAME function as strategy
    const signalCandle = candles[signalIdx];
    const pastCandles = candles.slice(0, signalIdx + 1); // Only data available on signal day

    const stopResult = calculateIntelligentStop({
        entryPrice: signalCandle.close,
        candles: pastCandles,
        atrMultiplier: 2.5,
        swingLookback: 5,
        targetMultiplier: 3.0
    });

    console.log('\n' + '─'.repeat(70));
    console.log('  SIGNAL GENERATION (using calculateIntelligentStop)');
    console.log('─'.repeat(70));
    console.log(`  Signal Date: ${signalDate}`);
    console.log(`  Signal Price (close): ₹${signalCandle.close}`);
    console.log(`  Stop Method: ${stopResult.method}`);
    console.log(`  ATR(14): ₹${stopResult.atr} (${stopResult.atrPct}%)`);
    console.log(`  Swing Low: ₹${stopResult.swingLow}`);
    console.log(`  Stop Price: ₹${stopResult.stopPrice} (-${stopResult.stopPct}%)`);
    console.log(`  Target Price: ₹${stopResult.targetPrice} (+${stopResult.targetPct}%)`);

    // 4. Day+1 Entry
    const entryIdx = signalIdx + 1;
    if (entryIdx >= candles.length) {
        console.log('\n❌ No candle data for Day+1 entry!');
        return;
    }

    const entryCandle = candles[entryIdx];
    const entryPrice = entryCandle.open;

    // Recalculate stop/target based on ACTUAL entry price
    const entryStopResult = calculateIntelligentStop({
        entryPrice: entryPrice,
        candles: candles.slice(0, entryIdx + 1),
        atrMultiplier: 2.5,
        swingLookback: 5,
        targetMultiplier: 3.0
    });

    console.log('\n' + '─'.repeat(70));
    console.log('  TRADE SETUP (Day+1 Entry)');
    console.log('─'.repeat(70));
    console.log(`  Entry Date: ${entryCandle.date}`);
    console.log(`  Entry Price: ₹${entryPrice} (Day+1 OPEN)`);
    console.log(`  Stop Loss: ₹${entryStopResult.stopPrice} (-${entryStopResult.stopPct}%)`);
    console.log(`  Target: ₹${entryStopResult.targetPrice} (+${entryStopResult.targetPct}%)`);

    // NOTE: The backtest engine uses the signal-day stop/target, not recalculated ones
    // So let's use the original signal values
    const targetPrice = stopResult.targetPrice;
    let currentStop = stopResult.stopPrice;
    let highestPrice = entryPrice;

    console.log(`\n  [Backtest uses signal-day values:]`);
    console.log(`  Stop: ₹${currentStop} | Target: ₹${targetPrice}`);

    // 5. Day-by-day simulation
    console.log('\n' + '─'.repeat(70));
    console.log('  DAY-BY-DAY SIMULATION (LONG direction)');
    console.log('─'.repeat(70));
    console.log('  Day | Date       |   Open    |   High    |   Low     |   Close   | Stop Hit? | Target Hit? | Trail Stop  | Action');
    console.log('─'.repeat(70));

    const maxHoldDays = 20;
    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let daysHeld = 0;

    for (let d = 0; d < maxHoldDays; d++) {
        const candleIdx = entryIdx + d; // Day 0 = entry day
        if (candleIdx >= candles.length) break;

        const candle = candles[candleIdx];
        daysHeld = d + 1;

        // Skip entry day for exit checks (Day 0 = pending entry)
        if (d === 0) {
            console.log(`  ${String(d).padStart(3)} | ${candle.date} | ${String(candle.open.toFixed(2)).padStart(9)} | ${String(candle.high.toFixed(2)).padStart(9)} | ${String(candle.low.toFixed(2)).padStart(9)} | ${String(candle.close.toFixed(2)).padStart(9)} |    -      |      -      | ₹${currentStop.toFixed(2).padStart(8)} | ENTRY DAY`);
            continue;
        }

        // Update highest price
        if (candle.high > highestPrice) highestPrice = candle.high;

        // Check trailing stop
        const trail = calculateTrailingStop({
            entryPrice,
            currentStop,
            highestPrice,
            trailPct: 0.03,
            activationPct: 0.015,
            breakevenPct: 0.02
        });
        if (trail.newStop > currentStop) currentStop = trail.newStop;

        // Check LONG target (HIGH >= target)
        const targetHit = candle.high >= targetPrice;
        // Check LONG stop (LOW <= stop)
        const stopHit = candle.low <= currentStop;

        let action = 'HOLD';
        if (targetHit) {
            exitPrice = targetPrice;
            exitReason = 'TARGET';
            exitDate = candle.date;
            action = `EXIT TARGET @ ₹${targetPrice.toFixed(2)}`;
        } else if (stopHit) {
            exitPrice = currentStop;
            exitReason = currentStop > entryPrice ? 'TRAILING_STOP_PROFIT' : 'STOP';
            exitDate = candle.date;
            action = `EXIT ${exitReason} @ ₹${currentStop.toFixed(2)}`;
        } else if (daysHeld >= maxHoldDays) {
            exitPrice = candle.close;
            exitReason = 'MAX_HOLD';
            exitDate = candle.date;
            action = `EXIT MAX_HOLD @ ₹${candle.close.toFixed(2)}`;
        }

        console.log(`  ${String(d).padStart(3)} | ${candle.date} | ${String(candle.open.toFixed(2)).padStart(9)} | ${String(candle.high.toFixed(2)).padStart(9)} | ${String(candle.low.toFixed(2)).padStart(9)} | ${String(candle.close.toFixed(2)).padStart(9)} | ${String(stopHit ? 'YES' : 'NO').padStart(9)} | ${String(targetHit ? 'YES' : 'NO').padStart(11)} | ₹${currentStop.toFixed(2).padStart(8)} | ${action}`);

        if (exitPrice) break;
    }

    if (!exitPrice) {
        const lastCandle = candles[Math.min(entryIdx + maxHoldDays, candles.length - 1)];
        exitPrice = lastCandle.close;
        exitReason = 'BACKTEST_END / MAX_HOLD';
        exitDate = lastCandle.date;
    }

    // 6. Results comparison
    const pnl = ((exitPrice - entryPrice) / entryPrice) * 100;

    console.log('\n' + '─'.repeat(70));
    console.log('  MANUAL CALCULATION RESULT');
    console.log('─'.repeat(70));
    console.log(`  Entry Price: ₹${entryPrice.toFixed(2)} (${entryCandle.date} OPEN)`);
    console.log(`  Exit Price:  ₹${exitPrice.toFixed(2)} (${exitDate})`);
    console.log(`  Exit Reason: ${exitReason}`);
    console.log(`  Days Held:   ${daysHeld}`);
    console.log(`  P&L:         ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`);
    console.log(`  Outcome:     ${pnl > 0 ? 'WIN ✅' : 'LOSS ❌'}`);

    console.log('\n' + '─'.repeat(70));
    console.log('  BACKTEST ENGINE OUTPUT (from CSV/screenshot)');
    console.log('─'.repeat(70));
    console.log('  Entry Price: ₹3370 | Exit Price: ₹4115.06 | Exit: TRAILING_STOP_PROFIT');
    console.log('  P&L: +22.10% | Signal: 2026-01-07 | Entry: 2026-01-08 | Exit: 2026-01-09');

    console.log('\n' + '═'.repeat(70));
    console.log('  VERDICT');
    console.log('═'.repeat(70));
    console.log(`  DB Entry Price:    ₹${entryPrice.toFixed(2)} vs Backtest: ₹3370`);
    console.log(`  DB Exit Date:      ${exitDate} vs Backtest: 2026-01-09`);
    console.log(`  DB Exit Price:     ₹${exitPrice.toFixed(2)} vs Backtest: ₹4115.06`);
    console.log(`  DB P&L:            ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% vs Backtest: +22.10%`);

    const priceMatch = Math.abs(entryPrice - 3370) < 5;
    console.log(`\n  Entry Price Match: ${priceMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`  Exit in 1 day possible? ${daysHeld <= 2 ? '⚠️ Maybe' : '❌ NO — took ' + daysHeld + ' days'}`);

    console.log('\n' + '═'.repeat(70));
    await prisma.$disconnect();
}

// Run
const symbol = process.argv[2] || 'TITAN';
const signalDate = process.argv[3] || '2026-01-07';
verify(symbol, signalDate).catch(e => {
    console.error('Error:', e.message);
    prisma.$disconnect();
});
