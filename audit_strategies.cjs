
const { generateIntradaySignalsV21 } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');

async function runAudit() {
    console.log('--- STARTING STRATEGY AUDIT ---');

    const categories = ['INTRADAY_BOOST', 'PRE_MARKET'];
    const today = '2026-02-09';

    // 1. Detailed Audit for TODAY (Feb 9)
    for (const cat of categories) {
        console.log(`\n=== 1. Detailed Audit: ${cat} (Today: ${today}) ===`);
        try {
            const result = await generateIntradaySignalsV21(cat, today, 'AUTO', true);
            console.log(`> Scanned: ${result.stats.totalStocks}`);
            console.log(`> Signals: ${result.signals.length}`);

            if (result.signals.length === 0) {
                console.log(`> ❌ NO SIGNALS generated. Check detailed logs above for reasons.`);
            } else {
                result.signals.forEach(s => console.log(`> ✅ Signal: ${s.symbol} @ ${s.entryTime} (${s.outcome || 'PENDING'})`));
            }

        } catch (e) {
            console.error(`Error auditing ${cat}:`, e.message);
        }
    }

    // 2. 7-Day Backtest Overview
    console.log('\n=== 2. 7-Day Backtest Overview (Feb 2 - Feb 9) ===');
    const dates = [
        '2026-02-02', '2026-02-03', '2026-02-04',
        '2026-02-05', '2026-02-06' // Skip weekend checks simplified
    ];

    for (const cat of categories) {
        console.log(`\n--- Backtesting ${cat} (Last Week) ---`);
        let totalSignals = 0;
        let wins = 0;

        for (const d of dates) {
            try {
                // Suppress detailed logs for weekly run, just need stats
                // Note: generateIntradaySignalsV21 logs to console by default. 
                // We'll just read the summary output.
                const res = await generateIntradaySignalsV21(cat, d, 'AUTO', true);
                const daySignals = res.signals.length;
                const dayWins = res.signals.filter(s => s.outcome === 'WIN').length;

                totalSignals += daySignals;
                wins += dayWins;

                console.log(`  Date ${d}: ${daySignals} Signals, ${dayWins} Wins`);
            } catch (e) {
                console.log(`  Date ${d}: Error (${e.message})`);
            }
        }
        console.log(`> Total for Week: ${totalSignals} Signals, ${wins} Wins`);
    }

}

if (require.main === module) {
    runAudit()
        .then(() => prisma.$disconnect())
        .catch(e => { console.error(e); prisma.$disconnect(); });
}
