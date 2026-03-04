
const { generateIntradaySignalsV21 } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');

async function debugHighPoweredBacktest() {
    console.log('--- DEBUG START: HIGH_POWERED_STOCKS 1-Min Backtest (2026-02-09) ---');

    // Force date to 2026-02-09
    const targetDate = '2026-02-09';

    try {
        // Run V2.1 Signal Generation with verbose logging enabled (if supported)
        // or capture standard output
        const result = await generateIntradaySignalsV21('HIGH_POWERED_STOCKS', targetDate, 'AUTO', true);

        console.log('\n--- SUMMARY ---');
        console.log(`Total Stocks Scanned: ${result.stats.totalStocks}`);
        console.log(`Signals Generated: ${result.signals.length}`);

        if (result.signals.length > 0) {
            console.log('--- SIGNALS FOUND ---');
            result.signals.forEach(s => {
                console.log(`✅ ${s.symbol} at ${s.entryTime}: Entry ${s.entryPrice}, Target ${s.targetPrice}`);
            });
        } else {
            console.log('❌ NO SIGNALS FOUND.');
        }

        // Proof: Random Failures
        // Ideally we need to see WHY stocks failed. 
        // The generate function prints huge logs if we could see them.
        // But since we can't see "console.log" from inside unless we capture it or read return.
        // The return object contains stats but not individual failure reasons for all stocks.
        // However, the function logs to console. So running this script will SHOW the logs in terminal.
        // I will rely on the terminal output to pick "proof".

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    }
}

if (require.main === module) {
    debugHighPoweredBacktest()
        .then(() => prisma.$disconnect())
        .catch(e => { console.error(e); prisma.$disconnect(); });
}
