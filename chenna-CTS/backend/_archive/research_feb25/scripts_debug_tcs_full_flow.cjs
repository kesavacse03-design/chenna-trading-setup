const { generateIntradaySignalsV21 } = require('../services/labs/intradayStrategyV2_1.cjs');
const prisma = require('../lib/prisma.cjs');

async function debugTCSFlow() {
    console.log('--- DEBUG TCS FULL FLOW ---');
    try {
        const { signals } = await generateIntradaySignalsV21('INTRADAY_BOOST', '2026-02-05', 'RELAXED', true);
        console.log(`\nSignals Generated: ${signals.length}`);
        const tcs = signals.find(s => s.symbol === 'TCS');
        if (tcs) {
            console.log('✅ TCS SIGNAL FOUND:', tcs);
        } else {
            console.log('❌ TCS SIGNAL MISSING');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

debugTCSFlow();
