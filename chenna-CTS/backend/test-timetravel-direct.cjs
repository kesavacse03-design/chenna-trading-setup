const TimeTravelBacktesterV2 = require('./strategy/timeTravelBacktesterV2.cjs');
const backtestService = require('./services/backtestResultsService.cjs');

async function test() {
    try {
        console.log('🧪 Testing Time-Travel Backtest...');

        const bacht = new TimeTravelBacktesterV2();
        const result = await bacht.run('DOWNSIDE_LOM_SWING');

        console.log('✅ Backtest completed!');
        console.log('Stats:', result.stats);

        console.log('\n🧪 Testing save results...');
        const saved = await backtestService.saveTimeTravelResults('DOWNSIDE_LOM_SWING', result);
        console.log('✅ Results saved:', saved.csvPath);

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error('Stack:', error.stack);
    }
}

test();
