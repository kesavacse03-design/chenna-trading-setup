
const { generateIntradaySignalsV21, simulateIntradayTradeV21 } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');

// Mock getIntradayStocks to return just specific stocks to bypass DB/Network bulk issues
const strategyModule = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');

// We can't easily mock the internal function. 
// But we can create a category 'TEST_BATCH' in DB? No, too slow.
// We will try running 'INTRADAY_BOOST' again but hoping for a lucky connection?
// Better: We rely on the fact that generateIntradaySignalsV21 fetches stocks.
// If we can't change that, we can't force a single stock.
// UNLESS we use a mode that filters inside? No.

// Wait, I can monkey-patch getIntradayStocks if I really want to.
// But simpler: just try running for 'INTRADAY_BOOST' again. The 0 stocks might be a temporary glitch.
// And I will print verbose logs.

async function tryAgain() {
    console.log('--- RETRYING COMBO_SPEED (Feb 9) ---');
    try {
        const res = await generateIntradaySignalsV21('INTRADAY_BOOST', '2026-02-09', 'COMBO_SPEED', true);
        console.log(`Stocks Found: ${res.stats.totalStocks}`);
        console.log(`Signals: ${res.signals.length}`);

        for (const s of res.signals) {
            const trade = await simulateIntradayTradeV21(s, '2026-02-09', { EXIT_TIME: '15:15' });
            console.log(`  -> ${s.symbol} @ ${s.entryTime}: ${trade.outcome} (${trade.pnlPercent}%)`);
        }
    } catch (e) { console.log(e); }
}

if (require.main === module) {
    tryAgain()
        .then(() => prisma.$disconnect())
        .catch(e => { console.error(e); prisma.$disconnect(); });
}
