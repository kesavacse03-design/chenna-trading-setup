const prisma = require('./lib/prisma.cjs');

async function check() {
    const signals = await prisma.v5Signal.findMany({
        where: { category: 'INTRADAY_BOOST' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            symbol: true,
            entryPrice: true,
            stopPrice: true,
            t1Price: true,
            t2Price: true,
            direction: true,
            status: true,
            signalDate: true,
            entryType: true,
            category: true
        }
    });

    console.log('=== INTRADAY_BOOST Signals (latest 5) ===');
    if (signals.length === 0) {
        console.log('NO INTRADAY_BOOST signals found. Checking all signals...');
        const all = await prisma.v5Signal.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { id: true, symbol: true, category: true, entryPrice: true, t1Price: true, t2Price: true, direction: true, status: true }
        });
        console.log(JSON.stringify(all, null, 2));
    } else {
        for (const s of signals) {
            console.log(`  ${s.symbol} | Entry: ${s.entryPrice} | Stop: ${s.stopPrice} | T1: ${s.t1Price} | T2: ${s.t2Price} | Dir: ${s.direction} | Status: ${s.status} | Type: ${s.entryType}`);
        }
    }

    await prisma.$disconnect();
}

check().catch(e => { console.error('ERR:', e.message); process.exit(1); });
