const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const upsideLom = require('../services/labs/upsideLomIntraStrategy.cjs');
const { generateIntradaySignalsV21 } = require('../services/labs/intradayStrategyV2_1.cjs');

async function verify() {
    try {
        console.log('🚀 Verifying Intraday Strategies...');

        // 1. Get a Date with Data
        const sample = await prisma.ohlcvCache.findFirst({
            where: { interval: '1minute' },
            orderBy: { createdAt: 'desc' }
        });

        if (!sample) {
            console.error('❌ No 1-minute data found in cache. Cannot verify.');
            process.exit(1);
        }

        const dateStr = sample.fromDate.toISOString().split('T')[0];
        const symbol = sample.symbol;
        console.log(`📅 using Date: ${dateStr}, Symbol: ${symbol}`);

        // 2. Verify UPSIDE_LOM_INTRA
        console.log('\n--- 1. Testing UPSIDE_LOM_INTRA ---');
        const candles5min = await upsideLom.get5MinCandles(symbol, dateStr);
        console.log(`Fetched ${candles5min.length} 5-min candles.`);

        if (candles5min.length > 20) {
            const signal = await upsideLom.generateSignal(symbol, candles5min, candles5min[candles5min.length - 1].timestamp);
            if (signal) {
                console.log('✅ UPSIDE_LOM Signal Generated:', JSON.stringify(signal, null, 2));
            } else {
                console.log('ℹ️ No UPSIDE_LOM Signal (Reason: Conditions not met, but execution successful).');
            }
        } else {
            console.warn('⚠️ Not enough data for LOM verify.');
        }

        // 3. Verify INTRADAY_BOOST (V2.1)
        console.log('\n--- 2. Testing INTRADAY_BOOST (V2.1) ---');
        // Mock custom stock input
        const customStocks = [{ symbol, instrumentKey: '' }]; // instrumentKey will be fetched if empty? 
        // V2.1 fetches instrument key from DB if missing.

        const result = await generateIntradaySignalsV21('INTRADAY_BOOST', dateStr, 'STRICT', true, customStocks);
        console.log(`V2.1 Result Stats:`, result.stats);
        if (result.signals.length > 0) {
            console.log('✅ V2.1 Signals:', result.signals);
        } else {
            console.log('ℹ️ No V2.1 Signals found (Execution successful).');
        }

        console.log('\n✅ Intraday Backtest Engine Verification Complete.');
        await prisma.$disconnect();
        process.exit(0);

    } catch (e) {
        console.error('❌ Verification Failed:', e);
        await prisma.$disconnect();
        process.exit(1);
    }
}

verify();
