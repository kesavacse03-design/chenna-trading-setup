// Re-test: Clear March 2 IB signals and regenerate with fixed OR logic
const prisma = require('./lib/prisma.cjs');

async function retest() {
    const date = '2026-03-02';
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');

    // Step 1: Show current signals
    const current = await prisma.v5Signal.findMany({
        where: { category: 'INTRADAY_BOOST', signalDate: { gte: dayStart, lte: dayEnd } },
        select: { id: true, symbol: true, direction: true, entryPrice: true, stopPrice: true, t1Price: true, t2Price: true, entryType: true, status: true }
    });

    console.log('══════════════════════════════════════════');
    console.log('BEFORE FIX — Current March 2 IB Signals:');
    console.log('══════════════════════════════════════════');
    for (const s of current) {
        console.log(`  ${s.symbol} ${s.direction} ${s.entryType} | Entry=₹${Number(s.entryPrice)} Stop=₹${Number(s.stopPrice)} T1=₹${s.t1Price ? Number(s.t1Price) : 'N/A'} T2=₹${s.t2Price ? Number(s.t2Price) : 'N/A'} | Status=${s.status}`);
    }

    console.log(`\nTotal: ${current.length} signals`);

    // Step 2: Delete them
    const deleted = await prisma.v5Signal.deleteMany({
        where: { category: 'INTRADAY_BOOST', signalDate: { gte: dayStart, lte: dayEnd } }
    });
    console.log(`\n✅ Deleted ${deleted.count} signals`);

    // Step 3: Re-run signal generation with fixed logic
    console.log('\n══════════════════════════════════════════');
    console.log('RE-GENERATING with fixed stop logic...');
    console.log('══════════════════════════════════════════');

    const cs = require('./services/confirmationService.cjs');
    const result = await cs.confirmIntradaySignals(date);
    console.log('\nGeneration result:', JSON.stringify(result, null, 2));

    // Step 4: Show new signals
    const newSignals = await prisma.v5Signal.findMany({
        where: { category: 'INTRADAY_BOOST', signalDate: { gte: dayStart, lte: dayEnd } },
        select: { id: true, symbol: true, direction: true, entryPrice: true, stopPrice: true, t1Price: true, t2Price: true, entryType: true, status: true }
    });

    console.log('\n══════════════════════════════════════════');
    console.log('AFTER FIX — New March 2 IB Signals:');
    console.log('══════════════════════════════════════════');
    for (const s of newSignals) {
        console.log(`  ${s.symbol} ${s.direction} ${s.entryType} | Entry=₹${Number(s.entryPrice)} Stop=₹${Number(s.stopPrice)} T1=₹${s.t1Price ? Number(s.t1Price) : 'N/A'} T2=₹${s.t2Price ? Number(s.t2Price) : 'N/A'} | Status=${s.status}`);
    }
    console.log(`\nTotal: ${newSignals.length} signals`);

    // Step 5: Compare LT specifically
    const ltBefore = current.find(s => s.symbol === 'LT');
    const ltAfter = newSignals.find(s => s.symbol === 'LT');

    if (ltBefore && ltAfter) {
        console.log('\n══════════════════════════════════════════');
        console.log('LT COMPARISON:');
        console.log('══════════════════════════════════════════');
        console.log(`  BEFORE: Entry=₹${Number(ltBefore.entryPrice)} Stop=₹${Number(ltBefore.stopPrice)} T1=₹${ltBefore.t1Price ? Number(ltBefore.t1Price) : 'N/A'} T2=₹${ltBefore.t2Price ? Number(ltBefore.t2Price) : 'N/A'} Risk=₹${Math.abs(Number(ltBefore.entryPrice) - Number(ltBefore.stopPrice)).toFixed(1)}`);
        console.log(`  AFTER:  Entry=₹${Number(ltAfter.entryPrice)} Stop=₹${Number(ltAfter.stopPrice)} T1=₹${ltAfter.t1Price ? Number(ltAfter.t1Price) : 'N/A'} T2=₹${ltAfter.t2Price ? Number(ltAfter.t2Price) : 'N/A'} Risk=₹${Math.abs(Number(ltAfter.entryPrice) - Number(ltAfter.stopPrice)).toFixed(1)}`);
    }

    await prisma.$disconnect();
}

retest().catch(e => { console.error('ERROR:', e); process.exit(1); });
