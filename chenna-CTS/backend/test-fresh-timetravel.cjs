/**
 * Fresh Time-Travel Test Script
 * Tests the NUCLEAR inline endpoint
 */

const fetch = require('node-fetch');

console.log('\n🧪 Testing Fresh Time-Travel System\n');
console.log('='.repeat(60));

async function testFreshSystem() {
    try {
        console.log('📤 Calling NUCLEAR endpoint...\n');

        const response = await fetch('http://localhost:3001/api/strategy/time-travel-backtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryKey: 'DOWNSIDE_LOM_SWING' })
        });

        console.log(`Status: ${response.status} ${response.statusText}\n`);

        if (!response.ok) {
            const error = await response.text();
            console.error('❌ Error Response:', error);
            return;
        }

        const result = await response.json();

        console.log('✅ SUCCESS!\n');
        console.log('='.repeat(60));
        console.log('RESULTS:');
        console.log('='.repeat(60));

        console.log(`\n📊 Stats:`);
        console.log(`   Variants Tested: ${result.stats?.totalLogicsTested || 'N/A'} ${result.stats?.totalLogicsTested === 30 ? '✅' : '❌ Should be 30!'}`);
        console.log(`   Stocks Processed: ${result.stats?.totalStocks || 'N/A'}`);
        console.log(`   Time Elapsed: ${result.stats?.timeElapsed || 'N/A'}`);

        console.log(`\n🏆 Top 3 Strategies:`);
        if (result.top3 && result.top3.length > 0) {
            result.top3.forEach((s, i) => {
                console.log(`\n   ${i + 1}. ${s.logic}`);
                console.log(`      Score: ${s.score}`);
                console.log(`      Win Rate: ${s.metrics.winRate}% ${s.metrics.winRate > 0 ? '✅' : '❌'}`);
                console.log(`      Trades: ${s.metrics.trades} ${s.metrics.trades > 0 ? '✅' : '❌'}`);
            });
        } else {
            console.log('   ❌ No strategies returned');
        }

        console.log(`\n💾 V1 Strategy:`);
        if (result.v1Strategy) {
            console.log(`   ID: ${result.v1Strategy.id || 'N/A'}`);
            console.log(`   Description: ${result.v1Strategy.description || 'N/A'}`);
            console.log(`   Accuracy: ${result.v1Strategy.expectedMetrics?.accuracy || 'N/A'}`);
            console.log(`   Expectancy: ${result.v1Strategy.expectedMetrics?.expectancy || 'N/A'}`);
            console.log(`   Trades: ${result.v1Strategy.expectedMetrics?.trades || 'N/A'}`);
        } else {
            console.log('   ❌ No V1 strategy returned');
        }

        console.log('\n' + '='.repeat(60));
        console.log('TEST SUMMARY:');
        console.log('='.repeat(60));

        const checks = {
            'Endpoint responded': response.ok,
            'Using V2 (30 variants)': result.stats?.totalLogicsTested === 30,
            'Has top 3 strategies': result.top3?.length >= 3,
            'Strategies have trades': result.top3?.[0]?.metrics?.trades > 0,
            'Win rates > 0%': result.top3?.[0]?.metrics?.winRate > 0,
            'V1 strategy generated': !!result.v1Strategy,
            'V1 has ID': !!result.v1Strategy?.id
        };

        let passed = 0;
        let failed = 0;

        console.log('\n');
        Object.entries(checks).forEach(([check, result]) => {
            console.log(`${result ? '✅' : '❌'} ${check}`);
            if (result) passed++;
            else failed++;
        });

        console.log(`\n📊 Score: ${passed}/${Object.keys(checks).length} checks passed\n`);

        if (failed === 0) {
            console.log('🎉 ALL TESTS PASSED! System is working!\n');
        } else {
            console.log(`⚠️  ${failed} check(s) failed. Review issues above.\n`);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

testFreshSystem();
