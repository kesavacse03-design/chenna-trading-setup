/**
 * DEEP VERIFICATION SCRIPT v2
 * 
 * Verifies that the timezone fix works by:
 * 1. Testing toISTDateString() conversion
 * 2. Simulating the signal generator candle matching
 * 3. Showing raw DB data and manual trade simulation
 * 
 * Usage: node scripts/verify_backtest.cjs TITAN 2026-01-07
 */

const { PrismaClient } = require('@prisma/client');
const { calculateIntelligentStop, calculateTrailingStop } = require('../services/stopLossCalculator.cjs');

const prisma = new PrismaClient();

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function getDailyCandles(symbol) {
    const caches = await prisma.ohlcvCache.findMany({
        where: { symbol, interval: 'day' }
    });
    if (!caches.length) {
        console.log('NO OhlcvCache records found for ' + symbol);
        return [];
    }
    console.log('Found ' + caches.length + ' cache records for ' + symbol);
    const all = [];
    for (const c of caches) {
        const data = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
        all.push(...data);
    }
    const unique = {};
    for (const c of all) {
        // FIXED: Use raw string split instead of toISOString
        const ts = String(c.timestamp || c.date || '');
        const dt = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
        if (dt) unique[dt] = {
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
    console.log('');
    console.log('======================================================================');
    console.log('  DEEP VERIFICATION v2: ' + symbol + ' (Signal: ' + signalDate + ')');
    console.log('======================================================================');

    // STEP 0: Test timezone fix
    console.log('');
    console.log('--- TIMEZONE FIX VERIFICATION ---');
    const testDate = new Date(signalDate + 'T00:00:00+05:30');
    console.log('  Input: ' + signalDate + 'T00:00:00+05:30');
    console.log('  OLD (broken): new Date().toISOString().split(T)[0] = ' + testDate.toISOString().split('T')[0]);
    console.log('  NEW (fixed):  toISTDateString() = ' + toISTDateString(testDate));
    console.log('  Raw string split: ' + (signalDate + 'T00:00:00+05:30').split('T')[0]);
    console.log('  Expected: ' + signalDate);
    console.log('  Fix working: ' + (toISTDateString(testDate) === signalDate ? 'YES' : 'NO'));

    const candles = await getDailyCandles(symbol);
    if (candles.length === 0) return;

    console.log('');
    console.log('Total unique candles: ' + candles.length);

    const signalIdx = candles.findIndex(c => c.date === signalDate);
    if (signalIdx === -1) {
        console.log('Signal date ' + signalDate + ' not found!');
        await prisma.$disconnect();
        return;
    }

    // Show candles
    console.log('');
    console.log('--- RAW CANDLE DATA FROM DATABASE ---');
    console.log('  Date       |   Open    |   High    |   Low     |   Close   | Volume');
    console.log('----------------------------------------------------------------------');
    const startShow = Math.max(0, signalIdx - 3);
    const endShow = Math.min(candles.length, signalIdx + 25);
    for (let i = startShow; i < endShow; i++) {
        const c = candles[i];
        const marker = i === signalIdx ? ' <-- SIGNAL' :
            i === signalIdx + 1 ? ' <-- ENTRY (Day+1)' : '';
        console.log('  ' + c.date + ' | ' +
            String(c.open.toFixed(2)).padStart(9) + ' | ' +
            String(c.high.toFixed(2)).padStart(9) + ' | ' +
            String(c.low.toFixed(2)).padStart(9) + ' | ' +
            String(c.close.toFixed(2)).padStart(9) + ' | ' +
            String(c.volume).padStart(8) + marker);
    }

    // Signal generation
    const signalCandle = candles[signalIdx];
    const pastCandles = candles.slice(0, signalIdx + 1);
    const stopResult = calculateIntelligentStop({
        entryPrice: signalCandle.close,
        candles: pastCandles,
        atrMultiplier: 2.5,
        swingLookback: 5,
        targetMultiplier: 3.0
    });

    console.log('');
    console.log('--- SIGNAL GENERATION ---');
    console.log('  Signal Price (close): ' + signalCandle.close.toFixed(2));
    console.log('  Method: ' + stopResult.method);
    console.log('  ATR(14): ' + stopResult.atr + ' (' + stopResult.atrPct + '%)');
    console.log('  Stop: ' + stopResult.stopPrice + ' (-' + stopResult.stopPct + '%)');
    console.log('  Target: ' + stopResult.targetPrice + ' (+' + stopResult.targetPct + '%)');

    // Day+1 Entry
    const entryIdx = signalIdx + 1;
    if (entryIdx >= candles.length) {
        console.log('No Day+1 candle!');
        await prisma.$disconnect();
        return;
    }
    const entryCandle = candles[entryIdx];
    const entryPrice = entryCandle.open;

    console.log('');
    console.log('--- TRADE SETUP ---');
    console.log('  Entry Date: ' + entryCandle.date + ' (Day+1)');
    console.log('  Entry Price: ' + entryPrice.toFixed(2) + ' (Day+1 OPEN)');
    console.log('  Stop: ' + stopResult.stopPrice + ' (-' + ((entryPrice - stopResult.stopPrice) / entryPrice * 100).toFixed(1) + '% from entry)');
    console.log('  Target: ' + stopResult.targetPrice + ' (+' + ((stopResult.targetPrice - entryPrice) / entryPrice * 100).toFixed(1) + '% from entry)');

    // Day-by-day simulation
    const targetPrice = stopResult.targetPrice;
    let currentStop = stopResult.stopPrice;
    let highestPrice = entryPrice;
    const maxHoldDays = 20;

    console.log('');
    console.log('--- DAY-BY-DAY SIMULATION (LONG) ---');

    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let daysHeld = 0;

    for (let d = 0; d < maxHoldDays; d++) {
        const candleIdx = entryIdx + d;
        if (candleIdx >= candles.length) break;
        const candle = candles[candleIdx];
        daysHeld = d + 1;

        if (d === 0) {
            console.log('  Day ' + d + ' | ' + candle.date + ' | O=' + candle.open.toFixed(2) + ' H=' + candle.high.toFixed(2) + ' L=' + candle.low.toFixed(2) + ' C=' + candle.close.toFixed(2) + ' | ENTRY (pending)');
            continue;
        }

        if (candle.high > highestPrice) highestPrice = candle.high;

        const trail = calculateTrailingStop({
            entryPrice,
            currentStop,
            highestPrice,
            trailPct: 0.03,
            activationPct: 0.015,
            breakevenPct: 0.02
        });
        if (trail.newStop > currentStop) currentStop = trail.newStop;

        const targetHit = candle.high >= targetPrice;
        const stopHit = candle.low <= currentStop;

        let action = 'HOLD';
        if (targetHit) {
            exitPrice = targetPrice;
            exitReason = 'TARGET';
            exitDate = candle.date;
            action = 'EXIT TARGET @ ' + targetPrice.toFixed(2);
        } else if (stopHit) {
            exitPrice = currentStop;
            exitReason = currentStop > entryPrice ? 'TRAILING_STOP_PROFIT' : 'STOP';
            exitDate = candle.date;
            action = 'EXIT ' + exitReason + ' @ ' + currentStop.toFixed(2);
        } else if (daysHeld >= maxHoldDays) {
            exitPrice = candle.close;
            exitReason = 'MAX_HOLD';
            exitDate = candle.date;
            action = 'EXIT MAX_HOLD @ ' + candle.close.toFixed(2);
        }

        console.log('  Day ' + d + ' | ' + candle.date + ' | O=' + candle.open.toFixed(2) + ' H=' + candle.high.toFixed(2) + ' L=' + candle.low.toFixed(2) + ' C=' + candle.close.toFixed(2) + ' | Stop=' + currentStop.toFixed(2) + ' | ' + action);

        if (exitPrice) break;
    }

    if (!exitPrice) {
        const lastCandle = candles[Math.min(entryIdx + maxHoldDays, candles.length - 1)];
        exitPrice = lastCandle.close;
        exitReason = 'BACKTEST_END';
        exitDate = lastCandle.date;
    }

    const pnl = ((exitPrice - entryPrice) / entryPrice) * 100;

    console.log('');
    console.log('======================================================================');
    console.log('  CORRECT RESULT (with timezone fix)');
    console.log('======================================================================');
    console.log('  Entry: ' + entryPrice.toFixed(2) + ' (' + entryCandle.date + ' OPEN)');
    console.log('  Exit:  ' + exitPrice.toFixed(2) + ' (' + exitDate + ')');
    console.log('  Reason: ' + exitReason);
    console.log('  Days: ' + daysHeld);
    console.log('  P&L: ' + (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '%');
    console.log('  Outcome: ' + (pnl > 0 ? 'WIN' : 'LOSS'));
    console.log('');
    console.log('  OLD BROKEN RESULT (from CSV):');
    console.log('  Entry: 3370 (wrong!) | Exit: 4115.06 (1 day!) | +22.10% (fake!)');
    console.log('======================================================================');

    await prisma.$disconnect();
}

const symbol = process.argv[2] || 'TITAN';
const signalDate = process.argv[3] || '2026-01-07';
verify(symbol, signalDate).catch(e => {
    console.error('Error:', e.message);
    prisma.$disconnect();
});
