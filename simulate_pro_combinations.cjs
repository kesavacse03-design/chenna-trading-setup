
const { generateIntradaySignalsV21, simulateIntradayTradeV21 } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');

const SCENARIOS = [
    {
        name: 'COMBO_SPEED',
        desc: 'Fast Mover (Min Wait 5m, Vol 1.5x)',
        config: { modeName: 'COMBO_SPEED', MIN_WAIT: 5, MAX_WAIT: 60, VOLUME: 1.5 }
    },
    {
        name: 'COMBO_LATE',
        desc: 'Late Bloomer (Max Wait 240m, Vol 1.5x)',
        config: { modeName: 'COMBO_LATE', MIN_WAIT: 15, MAX_WAIT: 240, VOLUME: 1.5 }
    }
    // COMBO_PRO removed for now to focus on these two
];

async function runProSimulation() {
    console.log('--- STARTING PRO TRADER COMBINATION SIMULATION ---');
    console.log('Targeting: INTRADAY_BOOST & HIGH_POWERED_STOCKS');
    const dates = ['2026-02-09', '2026-02-06'];
    const categories = ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'];

    for (const scenario of SCENARIOS) {
        console.log(`\n\n════════════════════════════════════════════════════════════`);
        console.log(`Running Scenario: ${scenario.name} (${scenario.desc})`);
        console.log(`════════════════════════════════════════════════════════════`);

        for (const date of dates) {
            console.log(`\n  Date: ${date}`);
            for (const cat of categories) {
                try {
                    // We pass the scenario name as the 'mode'
                    const res = await generateIntradaySignalsV21(cat, date, scenario.name, true);

                    if (res.signals.length > 0) {
                        console.log(`    [${cat}] Found ${res.signals.length} Signals:`);
                        let totalPnL = 0;
                        let wins = 0;
                        for (const s of res.signals) {
                            const trade = await simulateIntradayTradeV21(s, date, { EXIT_TIME: '15:15' });
                            console.log(`      -> ${s.symbol} @ ${s.entryTime}: ${trade.outcome} (${trade.pnlPercent}%)`);
                            totalPnL += parseFloat(trade.pnlPercent || 0);
                            if (trade.outcome === 'WIN') wins++;
                        }
                        console.log(`      > Scenario P&L: ${totalPnL.toFixed(2)}% | Win Rate: ${wins}/${res.signals.length}`);
                    } else {
                        console.log(`    [${cat}] No Signals.`);
                    }
                } catch (e) {
                    console.log(`Error in ${cat}: ${e.message}`);
                }
            }
        }
    }
}

if (require.main === module) {
    runProSimulation()
        .then(() => prisma.$disconnect())
        .catch(e => { console.error(e); prisma.$disconnect(); });
}
