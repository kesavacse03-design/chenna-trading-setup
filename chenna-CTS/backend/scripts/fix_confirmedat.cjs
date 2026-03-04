// Quick fix: set confirmedAt on today's signals that don't have it
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    // Find today's signals missing confirmedAt
    const updated = await p.v5Signal.updateMany({
        where: {
            signalDate: new Date('2026-02-27T00:00:00Z'),
            confirmedAt: null
        },
        data: {
            confirmedAt: new Date() // Set to current time
        }
    });
    console.log(`Updated ${updated.count} signals with confirmedAt`);

    // Verify
    const sigs = await p.v5Signal.findMany({
        where: { signalDate: new Date('2026-02-27T00:00:00Z') },
        select: { symbol: true, confirmedAt: true, status: true, direction: true, confidenceScore: true },
        orderBy: { confidenceScore: 'desc' }
    });
    console.log(`\nAll ${sigs.length} signals:`);
    sigs.forEach(s => {
        const time = s.confirmedAt ? new Date(s.confirmedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : 'null';
        console.log(`  ${s.symbol.padEnd(12)} ${(s.direction || '?').padEnd(6)} score:${s.confidenceScore} confirmedAt:${time} ${s.status}`);
    });

    await p.$disconnect();
})();
