const { generateCategorySignals } = require('../services/labs/signalGeneratorV2.cjs');

(async () => {
    console.log('Testing signal generation for MULTI_SUPPORT_BO on 2026-01-07...');

    // Using a known busy day from earlier analysis to see filters working (Jan 7 had ~14 signals originally)
    const result = await generateCategorySignals(
        'MULTI_SUPPORT_BO',
        new Date('2026-01-07T00:00:00.000+05:30'),
        500000,
        true // backtestMode
    );

    console.log(`\n=== RESULTS ===`);
    console.log(`Stocks checked: ${result.summary.totalStocksChecked}`);
    console.log(`Signals generated: ${result.signals.length} (Max allowed: 3)`);
    console.log(`Signals skipped: ${result.skipReport.length}`);

    console.log(`\n=== GENERATED SIGNALS ===`);
    result.signals.forEach(s => {
        console.log(`  ${s.symbol.padEnd(12)} Tier:${s.tier} RSI:${s.technicals?.rsi} Vol:${s.technicals?.volumeRatio}x EMA50:${s.technicals?.ema50.toFixed(1)} PrcVsEma:${s.technicals?.priceVsEma50}% Reason:${s.reason}`);
    });

    console.log(`\n=== SKIP REASONS SUMMARY ===`);
    const reasons = {};
    result.skipReport.forEach(r => {
        const key = r.reason.split(':')[0]; // group by core reason
        reasons[key] = (reasons[key] || 0) + 1;
    });
    Object.entries(reasons).forEach(([k, v]) => console.log(`  ${k}: ${v} stocks`));

    console.log(`\n=== TOP 5 SKIPS ===`);
    result.skipReport.slice(0, 5).forEach(r => console.log(`  ${r.symbol}: ${r.reason}`));

    process.exit(0);
})();
