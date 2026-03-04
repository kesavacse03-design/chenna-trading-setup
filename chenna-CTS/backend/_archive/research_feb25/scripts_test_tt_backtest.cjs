// Test TimeTravelBacktesterV2 for PRE_MARKET
const TimeTravelBacktesterV2 = require('../strategy/timeTravelBacktesterV2.cjs');

async function testTTBacktester() {
    console.log('═'.repeat(60));
    console.log('TIME-TRAVEL BACKTESTER V2 TEST - PRE_MARKET');
    console.log('═'.repeat(60));

    const backtester = new TimeTravelBacktesterV2();

    console.log('Running Time-Travel backtest for PRE_MARKET...\n');

    try {
        const results = await backtester.run('PRE_MARKET', { autoCache: false });

        console.log('\n' + '═'.repeat(60));
        console.log('RESULTS SUMMARY');
        console.log('═'.repeat(60));

        if (results.top3 && results.top3.length > 0) {
            console.log('\nTop 3 Strategy Variants:');
            results.top3.forEach((r, i) => {
                console.log(`\n${i + 1}. ${r.variant.name}`);
                console.log(`   Quality Score: ${r.qualityScore.toFixed(2)}`);
                console.log(`   Win Rate: ${r.metrics.winRate.toFixed(1)}%`);
                console.log(`   Trades: ${r.trades.length}`);
                console.log(`   Expectancy: ${r.metrics.expectancy.toFixed(2)}%`);
                console.log(`   Avg Win: +${r.metrics.avgWin?.toFixed(2) || 0}%`);
                console.log(`   Avg Loss: ${r.metrics.avgLoss?.toFixed(2) || 0}%`);
            });
        } else {
            console.log('No qualifying strategies found.');
        }

        console.log('\nTotal variants tested:', results.allResults?.length || 0);

    } catch (error) {
        console.error('Error:', error.message);
    }

    process.exit(0);
}

testTTBacktester().catch(console.error);
