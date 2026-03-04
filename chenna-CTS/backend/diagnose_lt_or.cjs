// Diagnostic: Extract exact OR High/Low for LT on March 2 — FIXED candle filtering
const prisma = require('./lib/prisma.cjs');
const { detectOpeningRange, getStrategyConfig } = require('./services/labs/intradayStrategyV2_1.cjs');

// Use the same candle fetch as eodReportService
const { fetch1MinCandles } = require('./services/eodReportService.cjs');

async function diagnose() {
    const date = '2026-03-02';
    const symbol = 'LT';

    // 1. Get exact signal from DB
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');
    const signal = await prisma.v5Signal.findFirst({
        where: { symbol, signalDate: { gte: dayStart, lte: dayEnd }, category: 'INTRADAY_BOOST' }
    });

    if (!signal) { console.log('❌ No LT signal found'); await prisma.$disconnect(); return; }

    console.log('══════════════════════════════════════════');
    console.log('LT OPENING RANGE DIAGNOSTIC — March 2 2026');
    console.log('══════════════════════════════════════════\n');

    console.log('=== DB Signal Values ===');
    console.log('  Entry:', Number(signal.entryPrice));
    console.log('  Stop:', Number(signal.stopPrice));
    console.log('  T1:', signal.t1Price ? Number(signal.t1Price) : 'NULL');
    console.log('  T2:', signal.t2Price ? Number(signal.t2Price) : 'NULL');
    console.log('  Direction:', signal.direction);
    console.log('  Entry Type:', signal.entryType);
    console.log('  InstrumentKey:', signal.instrumentKey);

    if (signal.meta) {
        const meta = typeof signal.meta === 'string' ? JSON.parse(signal.meta) : signal.meta;
        console.log('\n=== Signal Meta ===');
        console.log(JSON.stringify(meta, null, 2));
    }

    // 2. Fetch 1-min candles using the proven eodReportService method
    console.log('\nFetching 1-min candles...');
    const candles = await fetch1MinCandles(signal.instrumentKey, date);

    if (!candles || candles.length === 0) {
        console.log('❌ No candles returned (API may be down)');
        await prisma.$disconnect();
        return;
    }

    console.log(`Total candles: ${candles.length}\n`);

    // 3. Print first 30 candles
    console.log('=== First 30 Candles (1-min, IST) ===');
    console.log('  #   | Timestamp      |   Open |   High |    Low |  Close | Color');
    console.log('  ----+----------------+--------+--------+--------+--------+------');
    for (let i = 0; i < Math.min(30, candles.length); i++) {
        const c = candles[i];
        const time = c.timestamp.split('T')[1]?.substring(0, 8) || c.timestamp;
        const color = c.close >= c.open ? '🟢' : '🔴';
        console.log(`  ${String(i).padStart(3)} | ${time} | ${c.open.toFixed(1).padStart(6)} | ${c.high.toFixed(1).padStart(6)} | ${c.low.toFixed(1).padStart(6)} | ${c.close.toFixed(1).padStart(6)} | ${color}`);
    }

    // 4. V2.1 OR detection (first 15 candles = 15 minutes)
    const config = getStrategyConfig('INTRADAY_BOOST', 'STRICT');
    const orResult = detectOpeningRange(candles, config);

    console.log('\n=== V2.1 Opening Range (first 15 × 1-min = 9:15-9:30) ===');
    if (orResult) {
        console.log('  OR High:', orResult.high);
        console.log('  OR Low:', orResult.low);
        console.log('  OR Width:', orResult.rangePercent.toFixed(2) + '%');
    } else {
        // Calculate manually even if width check fails
        let high = -Infinity, low = Infinity;
        for (let i = 0; i < Math.min(15, candles.length); i++) {
            if (candles[i].high > high) high = candles[i].high;
            if (candles[i].low < low) low = candles[i].low;
        }
        console.log('  ❌ OR FAILED width check (> ' + config.MAX_OR_WIDTH_PERCENT + '%)');
        console.log('  But raw OR High:', high);
        console.log('  But raw OR Low:', low);
        console.log('  Raw OR Width:', (((high - low) / low) * 100).toFixed(2) + '%');
    }

    // 5. Pine Script OR (5-min aggregation, first opposite color)
    console.log('\n=== Pine Script Style — 5-min chart ===');
    const fiveMinCandles = [];
    for (let i = 0; i < candles.length; i += 5) {
        const chunk = candles.slice(i, i + 5);
        if (chunk.length === 0) break;
        fiveMinCandles.push({
            timestamp: chunk[0].timestamp,
            open: chunk[0].open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1].close
        });
    }

    console.log('  First 10 five-minute candles:');
    console.log('  #  | Timestamp      |   Open |   High |    Low |  Close | Color');
    console.log('  ---+----------------+--------+--------+--------+--------+------');
    for (let i = 0; i < Math.min(10, fiveMinCandles.length); i++) {
        const c = fiveMinCandles[i];
        const time = c.timestamp.split('T')[1]?.substring(0, 5) || '';
        const color = c.close >= c.open ? '🟢' : '🔴';
        console.log(`  ${String(i).padStart(2)} | ${time}          | ${c.open.toFixed(1).padStart(6)} | ${c.high.toFixed(1).padStart(6)} | ${c.low.toFixed(1).padStart(6)} | ${c.close.toFixed(1).padStart(6)} | ${color}`);
    }

    // Pine: first candle color, find first opposite
    if (fiveMinCandles.length > 1) {
        const firstColor = fiveMinCandles[0].close >= fiveMinCandles[0].open ? 'green' : 'red';
        let pineOrEnd = 0;
        for (let i = 1; i < fiveMinCandles.length; i++) {
            const color = fiveMinCandles[i].close >= fiveMinCandles[i].open ? 'green' : 'red';
            if (color !== firstColor) {
                pineOrEnd = i;
                break;
            }
        }

        let pineOrHigh = -Infinity, pineOrLow = Infinity;
        for (let i = 0; i <= pineOrEnd; i++) {
            if (fiveMinCandles[i].high > pineOrHigh) pineOrHigh = fiveMinCandles[i].high;
            if (fiveMinCandles[i].low < pineOrLow) pineOrLow = fiveMinCandles[i].low;
        }

        console.log(`\n  First 5-min candle color: ${firstColor}`);
        console.log(`  Opposite color at index ${pineOrEnd}: ${fiveMinCandles[pineOrEnd]?.timestamp.split('T')[1]?.substring(0, 5)}`);
        console.log(`  Pine OR High: ${pineOrHigh}`);
        console.log(`  Pine OR Low: ${pineOrLow}`);
        console.log(`  Pine OR Width: ${(((pineOrHigh - pineOrLow) / pineOrLow) * 100).toFixed(2)}%`);

        // For SHORT: entry = OR Low, stop = OR High
        console.log(`\n  Pine SHORT signal: Entry = OR Low = ${pineOrLow}, Stop = OR High = ${pineOrHigh}`);
        console.log(`  Pine Risk: ${(pineOrHigh - pineOrLow).toFixed(1)}`);
        console.log(`  Pine T1: ${(pineOrLow - (pineOrHigh - pineOrLow)).toFixed(1)} (1R)`);
    }

    // 6. Summary comparison
    const v21High = orResult ? orResult.high : 'N/A';
    const v21Low = orResult ? orResult.low : 'N/A';
    console.log('\n══════════════════════════════════════════════');
    console.log('FINAL COMPARISON');
    console.log('══════════════════════════════════════════════');
    console.log('  Field         | V2.1 Scanner   | Pine Script | DB Signal');
    console.log('  OR High       |', String(v21High).padEnd(14), '|', '?'.padEnd(11), '|', Number(signal.stopPrice));
    console.log('  OR Low        |', String(v21Low).padEnd(14), '|', '?'.padEnd(11), '|', Number(signal.entryPrice));
    console.log('');
    console.log('  KEY FINDING: V2.1 generates LONG-only (entry = OR High = ' + v21High + ')');
    console.log('  But DB signal is SHORT with entry = ' + Number(signal.entryPrice));
    console.log('  → Signal was NOT generated by intradayStrategyV2_1.cjs');
    console.log('  → It was generated by v5SignalGenerator.cjs (check that file for OR logic)');

    await prisma.$disconnect();
}

diagnose().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
