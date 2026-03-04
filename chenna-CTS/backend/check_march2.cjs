// Quick check: Show current March 2 IB signals after the fix was applied
const prisma = require('./lib/prisma.cjs');

async function check() {
    const dayStart = new Date('2026-03-02T00:00:00Z');
    const dayEnd = new Date('2026-03-02T23:59:59Z');

    const signals = await prisma.v5Signal.findMany({
        where: { category: 'INTRADAY_BOOST', signalDate: { gte: dayStart, lte: dayEnd } },
        select: { symbol: true, direction: true, entryPrice: true, stopPrice: true, t1Price: true, t2Price: true, entryType: true, status: true }
    });

    console.log('March 2 IB Signals (current state):');
    console.log('Symbol  | Dir   | Type    | Entry   | Stop    | T1      | T2      | Risk   | Status');
    console.log('--------+-------+---------+---------+---------+---------+---------+--------+--------');
    for (const s of signals) {
        const entry = Number(s.entryPrice);
        const stop = Number(s.stopPrice);
        const risk = Math.abs(entry - stop).toFixed(1);
        const t1 = s.t1Price ? Number(s.t1Price).toFixed(1) : 'N/A';
        const t2 = s.t2Price ? Number(s.t2Price).toFixed(1) : 'N/A';
        console.log(`${s.symbol.padEnd(8)}| ${s.direction.padEnd(6)}| ${(s.entryType || '-').padEnd(8)}| ${entry.toFixed(1).padStart(7)} | ${stop.toFixed(1).padStart(7)} | ${t1.padStart(7)} | ${t2.padStart(7)} | ${risk.padStart(6)} | ${s.status}`);
    }
    console.log(`\nTotal: ${signals.length} signals`);

    await prisma.$disconnect();
}

check().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
