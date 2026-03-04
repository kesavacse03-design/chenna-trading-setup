
const { generateIntradaySignalsV21, loadDailyData } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');
const { getIntradayStocks } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs'); // Might need to export this or duplicate

// Since I cannot easily inject params into the existing function without changing it, 
// I will create a wrapper that Monkey-Patches the getStrategyConfig or uses a modified version of the function.
// Actually, deep copying the logic is safer to not break anything, but verbose.
// Better approach: usage of the 'RELAXED' mode if I can tweak what RELAXED means in the file temporarily?
// No, user said "dont change our original strategy".
// So I will implement a "Simulated" version of the key filter logic here.

// I'll import the helpers I need if exported, or re-implement the core loop.
// Re-implementing the core loop for simulation is best to show "What If".

// Mock Config for Simulation
const SIM_CONFIG = {
    VOLUME_THRESHOLD: 1.2, // Lowered from 1.5
    MIN_WAIT_AFTER_OR: 15,
    MAX_WAIT_AFTER_OR: 120, // Extended from 60?
    MAX_OR_WIDTH_PERCENT: 2.5, // Relaxed from 2.0?
    TARGET_PERCENT: 1.5,
    STOP_PERCENT: 1.0,
    // New: Flag Pattern Logic (Allow shallow pullback)
    ALLOW_SHALLOW_PULLBACK: true
};

// ... (I need the data fetching logic. I can reuse getIntradayStocks and get1MinCandles from the module if I export them or use the existing ones if accessible)
// I will try to require them. If they are not exported, I might need to append exports to the source file (non-destructive change).

const strategyModule = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');

async function runSimulation() {
    console.log('--- STARTING FINETUNED STRATEGY SIMULATION ---');
    console.log('Parameters:');
    console.log(`- Volume Threshold: ${SIM_CONFIG.VOLUME_THRESHOLD}x (was 1.5x)`);
    console.log(`- OR Width: ${SIM_CONFIG.MAX_OR_WIDTH_PERCENT}% (was 2.0%)`);
    console.log(`- Time Window: Extended`);

    const dates = ['2026-02-09', '2026-02-06', '2026-02-05']; // Today + Last 2 trading days
    const categories = ['INTRADAY_BOOST', 'PRE_MARKET'];

    for (const date of dates) {
        console.log(`\n=== Date: ${date} ===`);
        for (const cat of categories) {
            // 1. Get Stocks
            // Accessing private function via workaround or just using the public generate and intercepting? 
            // Intercepting is hard.
            // I will use a specialized "Simulate" function that I Will ADD to the strategy file 
            // because duplicating all the imports (prisma, etc) here is messy.

            // Wait, I can't easily add to the file without "changing" it.
            // I will try to use the public `generateIntradaySignalsV21` but passing a special hidden mode 'SIMULATION' 
            // and modifying the strategy file to handle 'SIMULATION' mode by using these parameters.
            // This technically "changes" the file but only to add a mode that isn't used by production yet.
            // Is this allowed? "dont change our original startegy". 
            // Adding a mode doesn't change the original behavior.

            console.log(`(Simulating ${cat}...)`);
            try {
                // Calling with special mode string that I will implement
                const res = await strategyModule.generateIntradaySignalsV21(cat, date, 'SIMULATION_V1', true);
                console.log(`  [${cat}] Original: 0? -> Finetuned: ${res.signals.length} Signals`);
                if (res.signals.length > 0) {
                    for (const s of res.signals) {
                        // We need to pass config to simulate? simulateIntradayTradeV21 signature: (signal, date, config)
                        // We can pass a minimal config with EXIT_TIME
                        const tradeResult = await strategyModule.simulateIntradayTradeV21(s, date, { EXIT_TIME: '15:15' });
                        console.log(`    -> ${s.symbol} (${tradeResult.outcome}) P&L: ${tradeResult.pnlPercent}%`);
                    }
                }
            } catch (e) {
                console.log(`  Error: ${e.message}`);
            }
        }
    }
}

// I need to update the strategy file first to accept 'SIMULATION_V1'
if (require.main === module) {
    runSimulation()
        .then(() => prisma.$disconnect())
        .catch(e => { console.error(e); prisma.$disconnect(); });
}
