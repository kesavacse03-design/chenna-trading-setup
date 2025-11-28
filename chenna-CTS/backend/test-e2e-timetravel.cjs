/**
 * End-to-End Test for Time-Travel Backtest System
 * Tests frontend button → backend → CSV export flow
 */

const fetch = require('node-fetch');

async function testTimeTravelSystem() {
    console.log(`❌ Time-travel failed: ${response.status}`);
    const error = await response.text();
    console.log('Error:', error);
    return false;
}

const result = await response.json();
console.log('✅ Time-travel completed');

// Test 3: Verify results structure
console.log('\n3️⃣ Verifying results...');
const checks = [
    { name: 'Has top 3 strategies', pass: result.top3?.length >= 3 },
    { name: 'Has V1 strategy', pass: !!result.v1Strategy },
    { name: 'V1 has ID', pass: !!result.v1Strategy?.id },
    { name: 'Has stats', pass: !!result.stats },
    { name: 'Tested strategies', pass: result.stats?.totalLogicsTested > 0 },
];

checks.forEach(c => {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
});

const allPassed = checks.every(c => c.pass);

if (!allPassed) {
    console.log('\n❌ Some checks failed - need fixes');
    return false;
}

console.log('\n✅ All checks passed!');
console.log(`\n📊 Results:`);
console.log(`   Strategies tested: ${result.stats.totalLogicsTested}`);
console.log(`   Stocks processed: ${result.stats.totalStocks}`);
console.log(`   V1 Strategy ID: ${result.v1Strategy.id}`);

return true;

    } catch (error) {
    console.log('\n❌ Test failed with error:', error.message);
    return false;
}
}

// Run test
testTimeTravelSystem().then(success => {
    console.log('\n' + '='.repeat(60));
    if (success) {
        console.log('🎉 SYSTEM IS WORKING! Ready for enhancements.\n');
        process.exit(0);
    } else {
        console.log('⚠️ SYSTEM NEEDS FIXES. Address issues above first.\n');
        process.exit(1);
    }
});
