/**
 * END-TO-END TIME-TRAVEL DIAGNOSTIC
 * 
 * This will test the COMPLETE flow from frontend to backend
 */

console.log('\n🔍 END-TO-END TIME-TRAVEL DIAGNOSTIC\n');
console.log('='.repeat(60));

// Test 1: Can we reach the backend?
console.log('\nTest 1: Backend Connectivity...');

const fetch = require('node-fetch');

async function testEndpoints() {
    const tests = [
        {
            name: 'Health Check',
            url: 'http://localhost:3001/health'
        },
        {
            name: 'Time-Travel (OLD endpoint)',
            url: 'http://localhost:3001/api/strategy/time-travel-backtest',
            method: 'POST',
            body: { categoryKey: 'DOWNSIDE_LOM_SWING' }
        },
        {
            name: 'Time-Travel V2 (NEW endpoint)',
            url: 'http://localhost:3001/api/backtest/time-travel-v2',
            method: 'POST',
            body: { categoryKey: 'DOWNSIDE_LOM_SWING' }
        }
    ];

    for (const test of tests) {
        console.log(`\n  Testing: ${test.name}`);
        console.log(`  URL: ${test.url}`);

        try {
            const options = {
                method: test.method || 'GET',
                headers: { 'Content-Type': 'application/json' }
            };

            if (test.body) {
                options.body = JSON.stringify(test.body);
            }

            const response = await fetch(test.url, options);

            console.log(`  Status: ${response.status} ${response.statusText}`);

            if (response.status === 200) {
                const data = await response.json();

                if (test.name.includes('Time-Travel')) {
                    if (data.ok || data.success) {
                        console.log(`  ✅ SUCCESS`);
                        console.log(`  Response has: ${Object.keys(data).join(', ')}`);

                        if (data.stats) {
                            console.log(`  Total Logics: ${data.stats.totalLogicsTested || 'N/A'}`);
                        }
                        if (data.data) {
                            console.log(`  Tested Variants: ${data.data.testedVariants || 'N/A'}`);
                        }
                    } else {
                        console.log(`  ❌ Response ok/success is false`);
                    }
                } else {
                    console.log(`  ✅ Endpoint reachable`);
                }
            } else {
                const text = await response.text();
                console.log(`  ❌ Error: ${text.substring(0, 100)}`);
            }

        } catch (error) {
            console.log(`  ❌ Failed: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSTIC COMPLETE');
    console.log('='.repeat(60));

    console.log('\n📋 RECOMMENDATIONS:');
    console.log('1. Check which endpoint returned data');
    console.log('2. Update frontend to use working endpoint');
    console.log('3. Verify backend console shows request logs\n');
}

testEndpoints().catch(console.error);
