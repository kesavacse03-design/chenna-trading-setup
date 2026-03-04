const { generateCategorySignals } = require('../services/labs/signalGeneratorV2.cjs');

(async () => {
    console.log('Testing signal generation for SHORT_TERM_SWING_BO_UP on 2026-02-09...');

    const result = await generateCategorySignals(
        'SHORT_TERM_SWING_BO_UP',
        new Date('2026-02-09T00:00:00.000+05:30'),
        500000,
        true // backtestMode
    );

    console.log(`\n=== RESULTS ===`);
    console.log(`Stocks checked: ${result.summary.totalStocksChecked}`);
    console.log(`Signals generated: ${result.signals.length}`);
    console.log(`Signals skipped: ${result.skipReport.length}`);

    if (result.signals.length > 0) {
        console.log(`\n=== GENERATED SIGNALS ===`);
        result.signals.forEach(s => {
            console.log(`  ${s.symbol.padEnd(12)} Tier:${s.tier} RSI:${s.technicals?.rsi} Reason:${s.reason}`);
        });
    }

    console.log(`\n=== SKIP REASONS SUMMARY ===`);
    const reasons = {};
    result.skipReport.forEach(r => {
        const key = r.reason.split(':')[0];
        reasons[key] = (reasons[key] || 0) + 1;
    });
    Object.entries(reasons).forEach(([k, v]) => console.log(`  ${k}: ${v} stocks`));

    process.exit(0);
})();
