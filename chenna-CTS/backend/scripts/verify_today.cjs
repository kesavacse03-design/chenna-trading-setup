const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const sigs = await p.v5Signal.findMany({
        where: { signalDate: new Date('2026-02-27T00:00:00Z') },
        orderBy: { confidenceScore: 'desc' },
        select: {
            symbol: true, direction: true, confidenceScore: true, confidenceTier: true,
            entryPrice: true, stopPrice: true, t1Price: true, t2Price: true,
            status: true, entryType: true, signalClose: true, suggestedStop: true
        }
    });
    const out = sigs.map(s => ({
        sym: s.symbol,
        dir: s.direction || '?',
        score: s.confidenceScore,
        tier: s.confidenceTier,
        entry: Number(s.entryPrice || s.signalClose || 0).toFixed(1),
        stop: Number(s.stopPrice || s.suggestedStop || 0).toFixed(1),
        t1: Number(s.t1Price || 0).toFixed(1),
        status: s.status,
        type: s.entryType || '-'
    }));
    console.log(JSON.stringify(out, null, 2));
    await p.$disconnect();
})();
