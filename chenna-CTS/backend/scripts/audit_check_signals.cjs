const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    // 1. Check what the getTodaySignals service actually returns
    const dashboardService = require('../services/dashboardService.cjs');
    const signals = await dashboardService.getTodaySignals();
    console.log('Dashboard getTodaySignals() result:');
    console.log('  PENDING:', signals.PENDING?.length || 0);
    console.log('  CONFIRMED:', signals.CONFIRMED?.length || 0);
    console.log('  EXPIRED:', signals.EXPIRED?.length || 0);
    console.log('  EXECUTED:', signals.EXECUTED?.length || 0);

    // 2. Check what latestSignal date is
    const latestSignal = await p.v5Signal.findFirst({
        orderBy: { signalDate: 'desc' }
    });
    console.log('\nLatest signal date:', latestSignal?.signalDate?.toISOString());

    // 3. Get ALL signals from that date
    if (latestSignal) {
        const allSigs = await p.v5Signal.findMany({
            where: { signalDate: latestSignal.signalDate },
            orderBy: { confidenceScore: 'desc' }
        });
        console.log(`\nAll ${allSigs.length} signals for ${latestSignal.signalDate.toISOString().split('T')[0]}:`);
        for (const s of allSigs.slice(0, 10)) {
            console.log(`  ${s.symbol.padEnd(15)} | status: ${s.status.padEnd(20)} | score: ${s.confidenceScore} | dir: ${s.direction}`);
        }

        // Check unique statuses
        const statuses = [...new Set(allSigs.map(s => s.status))];
        console.log('\nUnique statuses found:', statuses);
    }

    await p.$disconnect();
})();
