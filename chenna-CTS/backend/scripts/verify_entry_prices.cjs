const { generateCategorySignals } = require('../services/labs/signalGeneratorV2.cjs');

(async () => {
    console.log('Testing signal generation for TATATECH on Jan 7...');

    // Simulate Jan 7
    let result = await generateCategorySignals(
        'SHORT_TERM_SWING_BO_UP',
        new Date('2026-01-07T00:00:00.000+05:30'),
        500000,
        true // backtestMode
    );

    const tata = result.signals.find(s => s.symbol === 'TATATECH');
    if (tata) {
        console.log(`✅ TATATECH Signal Generated:`);
        console.log(`   Signal Price: ${tata.price || tata.entryPrice}`);
        console.log(`   RSI: ${tata.technicals?.rsi}`);
    } else {
        console.log(`❌ TATATECH missed on Jan 7. Skip reasons:`);
        const skipped = result.skipReport.find(s => s.symbol === 'TATATECH');
        console.log(`   Reason: ${skipped?.reason}`);
    }

    console.log('\nTesting signal generation for PETRONET on Feb 18...');

    result = await generateCategorySignals(
        'SHORT_TERM_SWING_BO_UP',
        new Date('2026-02-18T00:00:00.000+05:30'),
        500000,
        true // backtestMode
    );

    const petro = result.signals.find(s => s.symbol === 'PETRONET');
    if (petro) {
        console.log(`✅ PETRONET Signal Generated:`);
        console.log(`   Signal Price: ${petro.price || petro.entryPrice}`);
        console.log(`   RSI: ${petro.technicals?.rsi}`);
    } else {
        console.log(`❌ PETRONET missed on Feb 18. Skip reasons:`);
        const skipped = result.skipReport.find(s => s.symbol === 'PETRONET');
        console.log(`   Reason: ${skipped?.reason}`);
    }

    process.exit(0);
})();
