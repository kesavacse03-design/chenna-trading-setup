const fetch = require('node-fetch');

async function testFullResponse() {
    console.log('\n🧪 Testing Time-Travel with Full Response Details\n');

    try {
        const response = await fetch('http://localhost:3001/api/strategy/time-travel-backtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryKey: 'DOWNSIDE_LOM_SWING' })
        });

        console.log(`Status: ${response.status}\n`);

        const result = await response.json();

        console.log('='.repeat(60));
        console.log('FULL RESPONSE:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(result, null, 2));
        console.log('='.repeat(60));

        console.log('\n📊 Response Analysis:');
        console.log(`  ok: ${result.ok}`);
        console.log(`  categoryKey: ${result.categoryKey}`);
        console.log(`  top3 count: ${result.top3 ? result.top3.length : 'undefined'}`);
        console.log(`  v1Strategy exists: ${result.v1Strategy ? 'YES' : 'NO'}`);

        if (result.v1Strategy) {
            console.log(`  v1Strategy.id: ${result.v1Strategy.id}`);
            console.log(`  v1Strategy.description: ${result.v1Strategy.description}`);
        } else {
            console.log('\n❌ V1 STRATEGY IS UNDEFINED!');
        }

        if (result.top3 && result.top3.length > 0) {
            console.log('\n🏆 Top 3 Strategies:');
            result.top3.forEach((s, i) => {
                console.log(`  ${i + 1}. ${s.logic}`);
                console.log(`     Score: ${s.score}, WinRate: ${s.metrics.winRate}%, Trades: ${s.metrics.trades}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

testFullResponse();
