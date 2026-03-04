// Diagnostic: Replicate exact EOD flow for March 2 signals
const prisma = require('./lib/prisma.cjs');
const { fetch1MinCandles, generateEODReport } = require('./services/eodReportService.cjs');
const { evaluateOutcome, filterMarketHours, getISTTime } = require('./services/signalEngine.cjs');

async function diagnose() {
    const date = '2026-03-02';

    // 1. Get INTRADAY_BOOST signals for March 2
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');

    const signals = await prisma.v5Signal.findMany({
        where: {
            signalDate: { gte: dayStart, lte: dayEnd },
            category: 'INTRADAY_BOOST'
        },
        take: 3,
        orderBy: { createdAt: 'asc' }
    });

    console.log('=== EOD Diagnostic for', date, '===');
    console.log('Found', signals.length, 'INTRADAY_BOOST signals');

    if (signals.length === 0) {
        console.log('NO signals found! Checking all categories...');
        const allSigs = await prisma.v5Signal.findMany({
            where: { signalDate: { gte: dayStart, lte: dayEnd } },
            take: 5,
            select: { id: true, symbol: true, category: true, status: true }
        });
        console.log('All signals for', date, ':', JSON.stringify(allSigs, null, 2));
        await prisma.$disconnect();
        return;
    }

    for (const sig of signals) {
        console.log('\n--- Signal:', sig.symbol, sig.direction || 'LONG', '---');
        console.log('  Entry:', Number(sig.entryPrice), 'Stop:', Number(sig.stopPrice));
        console.log('  T1:', sig.t1Price ? Number(sig.t1Price) : 'NULL', 'T2:', sig.t2Price ? Number(sig.t2Price) : 'NULL');
        console.log('  Status:', sig.status, 'Type:', sig.entryType);
        console.log('  InstrumentKey:', sig.instrumentKey);

        // 2. Fetch 1-min candles (same as EOD does)
        const candles = await fetch1MinCandles(sig.instrumentKey, date);

        if (!candles || candles.length === 0) {
            console.log('  ❌ NO CANDLES RETURNED from fetch1MinCandles!');
            console.log('  -> This is why outcome is NO_DATA/BREAKEVEN');
            continue;
        }

        console.log('  Total candles:', candles.length);
        console.log('  First candle:', candles[0].timestamp, 'O:', candles[0].open);
        console.log('  Last candle:', candles[candles.length - 1].timestamp, 'C:', candles[candles.length - 1].close);

        // Check IST times
        const firstIST = getISTTime(candles[0].timestamp);
        const lastIST = getISTTime(candles[candles.length - 1].timestamp);
        console.log('  First candle IST:', firstIST.hours + ':' + String(firstIST.minutes).padStart(2, '0'));
        console.log('  Last candle IST:', lastIST.hours + ':' + String(lastIST.minutes).padStart(2, '0'));

        // Check market hours filter
        const marketCandles = filterMarketHours(candles);
        console.log('  Market-hour candles:', marketCandles.length);

        if (marketCandles.length === 0) {
            console.log('  ❌ ALL CANDLES FILTERED OUT by market hours!');
            continue;
        }

        // 3. Run evaluateOutcome
        const result = evaluateOutcome(sig, candles);
        console.log('  OUTCOME:', result.outcome, 'R:', result.rMultiple);
        console.log('  Exit Price:', result.exitPrice, 'ExitTime:', result.exitTime);
        console.log('  hitT1:', result.hitT1, 'hitT2:', result.hitT2, 'hitStop:', result.hitStop);

        // Respect rate limit
        await new Promise(r => setTimeout(r, 400));
    }

    await prisma.$disconnect();
}

diagnose().catch(e => { console.error('ERROR:', e); process.exit(1); });
