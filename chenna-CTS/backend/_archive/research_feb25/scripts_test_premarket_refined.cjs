// Test PRE_MARKET strategy refinements
const { backtest, CONFIG } = require('../services/labs/preMarketStrategy.cjs');

async function testRefinedStrategy() {
    console.log('═'.repeat(60));
    console.log('PRE_MARKET STRATEGY REFINEMENT TEST');
    console.log('═'.repeat(60));

    console.log('\nCONFIG REFINEMENTS Applied:');
    console.log(`  - Excluded Stocks: ${CONFIG.excludedStocks.join(', ')}`);
    console.log(`  - Gap Range: ${CONFIG.minGapPercent}% to ${CONFIG.maxGapPercent}%`);
    console.log(`  - Min Body Below OR: ${CONFIG.minBodyBelowOR * 100}%`);
    console.log(`  - Stop Above OR: ${CONFIG.stopAboveORPercent}%`);
    console.log('');

    // Run backtest for Dec 2025 - Feb 2026
    const startDate = '2025-12-01';
    const endDate = '2026-02-03';

    console.log(`Running backtest: ${startDate} to ${endDate}`);
    console.log('═'.repeat(60));

    const results = await backtest(startDate, endDate);

    console.log('\n' + '═'.repeat(60));
    console.log('FINAL RESULTS');
    console.log('═'.repeat(60));
    console.log(`Total Trades: ${results.stats.totalTrades}`);
    console.log(`Win Rate: ${results.stats.winRate.toFixed(1)}%`);
    console.log(`Winners: ${results.stats.winners}`);
    console.log(`Losers: ${results.stats.losers}`);
    console.log(`Gap Fills (Target Hit): ${results.stats.gapFills}`);
    console.log(`Avg Win: +${results.stats.avgWin.toFixed(2)}%`);
    console.log(`Avg Loss: ${results.stats.avgLoss.toFixed(2)}%`);

    // Calculate expected value
    const winProb = results.stats.winRate / 100;
    const loseProb = 1 - winProb;
    const ev = (winProb * results.stats.avgWin) + (loseProb * results.stats.avgLoss);
    console.log(`Expected Value: ${ev.toFixed(3)}% per trade`);

    // Trade details
    console.log('\n' + '═'.repeat(60));
    console.log('TRADE LOG');
    console.log('═'.repeat(60));

    results.trades.forEach((t, i) => {
        const outcome = t.outcome === 'WIN' ? '✓' : '✗';
        console.log(`${i + 1}. ${t.signalDate} ${t.symbol.padEnd(12)} Gap: +${t.gap.percent}% → ${t.exitReason.padEnd(10)} ${outcome} ${t.pnlPercent.toFixed(2)}%`);
    });

    process.exit(0);
}

testRefinedStrategy().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
