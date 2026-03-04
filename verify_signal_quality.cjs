
const { backtestIntradayV21 } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');

async function verify() {
    console.log('--- VERIFYING SIGNAL QUALITY FILTER ---');

    // Use a recent date where we likely have data
    // Or use a date known to have signals.
    // I'll try '2025-02-14' (Friday) or similar if available, or just today if market open.
    // The user had '2026-02-09' in previous tests. 
    // I'll use a date range.

    // NOTE: This runs the internal function, not the API.

    try {
        const result = await backtestIntradayV21('INTRADAY_BOOST', '2026-02-01', '2026-02-15');

        console.log('\n--- RESULTS ---');
        console.log(`Total Trades: ${result.totalTrades}`);

        if (result.trades.length > 0) {
            const sample = result.trades[0];
            console.log('\n--- SAMPLE TRADE ---');
            console.log('Symbol:', sample.symbol);
            console.log('Confidence:', sample.confidence);
            console.log('Quality Score:', sample.qualityScore);
            console.log('Quality Factors:', JSON.stringify(sample.qualityFactors, null, 2));
            console.log('Warnings:', sample.warnings);

            if (sample.qualityScore !== undefined) {
                console.log('✅ Quality Score present');
            } else {
                console.error('❌ Quality Score MISSING');
            }
        } else {
            console.warn('⚠️ No trades found to verify signal structure.');
        }

        console.log('\n--- CONFIDENCE METRICS ---');
        if (result.confidenceMetrics) {
            console.table(result.confidenceMetrics);
            console.log('✅ Confidence Metrics present');
        } else {
            console.error('❌ Confidence Metrics MISSING');
        }

    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
