// Deep verification of LT signal for March 2
const prisma = require('./lib/prisma.cjs');
const { fetch1MinCandles } = require('./services/eodReportService.cjs');
const { evaluateOutcome, getISTTime } = require('./services/signalEngine.cjs');

async function verify() {
    const date = '2026-03-02';
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');

    // 1. Get LT signal from DB
    const ltSignal = await prisma.v5Signal.findFirst({
        where: {
            symbol: 'LT',
            signalDate: { gte: dayStart, lte: dayEnd },
            category: 'INTRADAY_BOOST'
        }
    });

    if (!ltSignal) {
        console.log('❌ No LT signal found for', date);
        await prisma.$disconnect();
        return;
    }

    console.log('=== LT Signal from v5Signal DB ===');
    console.log('  ID:', ltSignal.id);
    console.log('  Entry Price:', Number(ltSignal.entryPrice));
    console.log('  Stop Price:', Number(ltSignal.stopPrice));
    console.log('  T1 Price:', ltSignal.t1Price ? Number(ltSignal.t1Price) : 'NULL');
    console.log('  T2 Price:', ltSignal.t2Price ? Number(ltSignal.t2Price) : 'NULL');
    console.log('  Direction:', ltSignal.direction);
    console.log('  Entry Type:', ltSignal.entryType);
    console.log('  Status:', ltSignal.status);
    console.log('  Confidence:', ltSignal.confidenceScore, ltSignal.confidenceTier);
    console.log('  ConfirmedAt:', ltSignal.confirmedAt);
    console.log('  CreatedAt:', ltSignal.createdAt);
    console.log('  InstrumentKey:', ltSignal.instrumentKey);

    const entry = Number(ltSignal.entryPrice);
    const stop = Number(ltSignal.stopPrice);
    const t1 = ltSignal.t1Price ? Number(ltSignal.t1Price) : null;
    const risk = Math.abs(entry - stop);
    console.log('\n  Risk (|entry-stop|):', risk.toFixed(2));
    console.log('  Expected T1 (entry - risk):', (entry - risk).toFixed(2));
    console.log('  Expected T2 (entry - 2*risk):', (entry - 2 * risk).toFixed(2));

    // 2. Fetch 1-min candles
    console.log('\n=== Fetching 1-min candles for LT ===');
    const candles = await fetch1MinCandles(ltSignal.instrumentKey, date);

    if (!candles || candles.length === 0) {
        console.log('❌ No candles returned!');
        await prisma.$disconnect();
        return;
    }

    console.log('Total candles:', candles.length);
    console.log('First:', candles[0].timestamp, 'O:', candles[0].open, 'H:', candles[0].high, 'L:', candles[0].low);
    console.log('Last:', candles[candles.length - 1].timestamp, 'C:', candles[candles.length - 1].close);

    // 3. Find fill candle (SHORT: price must reach UP to entry)
    console.log('\n=== Fill Phase (SHORT entry at', entry, ') ===');
    let fillIdx = -1;
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const ist = getISTTime(c.timestamp);
        if (ist.totalMinutes > 920) break; // After 3:20 PM

        if (c.high >= entry || c.open >= entry) {
            fillIdx = i;
            console.log('  FILL at candle', i, ':', c.timestamp);
            console.log('    O:', c.open, 'H:', c.high, 'L:', c.low, 'C:', c.close);
            break;
        }
    }

    if (fillIdx === -1) {
        console.log('  ❌ Entry never filled!');
        await prisma.$disconnect();
        return;
    }

    // 4. Walk candles after fill — find first T1 or Stop hit
    console.log('\n=== Post-Fill Candle Walk ===');
    console.log('  Tracking: T1 =', t1, '(low <=', t1, '), Stop =', stop, '(high >=', stop, ')');

    let t1Hit = false;
    let currentStop = stop;

    for (let i = fillIdx + 1; i < Math.min(candles.length, fillIdx + 50); i++) {
        const c = candles[i];
        const ist = getISTTime(c.timestamp);
        if (ist.totalMinutes > 920) {
            console.log(`  [${c.timestamp}] EOD cutoff`);
            break;
        }

        const hitsT1 = !t1Hit && t1 !== null && c.low <= t1;
        const hitsStop = c.high >= currentStop;

        let marker = '';
        if (hitsT1 && hitsStop) marker = ' ⚠️ AMBIGUITY (T1+Stop same candle)';
        else if (hitsT1) marker = ' ✅ T1 HIT!';
        else if (hitsStop) marker = ' 🛑 STOP HIT!';

        if (marker || i <= fillIdx + 5) {
            console.log(`  [${c.timestamp}] O:${c.open} H:${c.high} L:${c.low} C:${c.close}${marker}`);
        }

        if (hitsStop && !hitsT1) {
            console.log('  → STOP_HIT at', c.timestamp, '— price high', c.high, '>=', currentStop);
            break;
        }
        if (hitsT1 && !hitsStop) {
            console.log('  → T1_HIT at', c.timestamp, '— price low', c.low, '<=', t1);
            t1Hit = true;
            currentStop = entry; // Move to breakeven
            console.log('  → Stop moved to breakeven:', entry);
        }
        if (hitsT1 && hitsStop) {
            // Ambiguity resolution
            if (c.open < entry) {
                console.log('  → T1 wins (open', c.open, '< entry', entry, ')');
                t1Hit = true;
                currentStop = entry;
            } else {
                console.log('  → STOP wins (open', c.open, '>= entry', entry, ')');
                break;
            }
        }
    }

    // 5. Run evaluateOutcome for comparison
    console.log('\n=== evaluateOutcome() Result ===');
    const result = evaluateOutcome(ltSignal, candles);
    console.log('  Outcome:', result.outcome);
    console.log('  R Multiple:', result.rMultiple);
    console.log('  Exit Price:', result.exitPrice);
    console.log('  Exit Time:', result.exitTime);
    console.log('  Fill Time:', result.fillTime);
    console.log('  hitT1:', result.hitT1, 'hitT2:', result.hitT2, 'hitStop:', result.hitStop);

    // User's Pine Script expected: entry ≈ ₹4078, T1 ≈ ₹4047
    console.log('\n=== Pine Script Comparison ===');
    console.log('  DB Entry:', entry, '| Pine Expected: ~₹4078');
    console.log('  DB T1:', t1, '| Pine Expected: ~₹4047');
    console.log('  DB Stop:', stop, '| Pine Expected: ~₹4109');
    if (Math.abs(entry - 4078) > 20) {
        console.log('  ⚠️ ENTRY MISMATCH! DB and Pine Script have different entry levels.');
        console.log('     This explains different outcomes — Pine uses a different OR/entry calculation.');
    } else {
        console.log('  ✅ Entry prices match within tolerance.');
    }

    await prisma.$disconnect();
}

verify().catch(e => { console.error('ERROR:', e); process.exit(1); });
