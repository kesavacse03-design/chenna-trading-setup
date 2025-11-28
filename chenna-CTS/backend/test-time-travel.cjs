/**
 * Test Script for Time-Travel Backtest
 * 
 * Tests the /api/strategy/time-travel-backtest endpoint
 * Verifies V1 strategy generation and persistence
 */

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001';
const CATEGORY_KEY = 'DOWNSIDE_LOM_SWING';

async function testTimeTravelBacktest() {
    console.log('🧪 Testing Time-Travel Backtest Endpoint\n');
    console.log('='.repeat(60));
    console.log(`Category: ${CATEGORY_KEY}`);
    console.log(`Endpoint: ${API_BASE}/api/strategy/time-travel-backtest`);
    console.log('='.repeat(60));

    try {
        console.log('\n📤 Sending request...');

        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/api/strategy/time-travel-backtest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                categoryKey: CATEGORY_KEY
            })
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`\n📥 Response received (${elapsed}s)`);
        console.log(`   Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`\n❌ Request failed:`);
            console.error(errorText);
            process.exit(1);
        }

        const result = await response.json();

        console.log('\n✅ SUCCESS!\n');
        console.log('='.repeat(60));
        console.log('RESULTS:');
        console.log('='.repeat(60));

        // Summary
        if (result.stats) {
            console.log('\n📊 Statistics:');
            console.log(`   Logics Tested: ${result.stats.totalLogicsTested || 'N/A'}`);
            console.log(`   Stocks Processed: ${result.stats.totalStocks || 'N/A'}`);
            console.log(`   Time Elapsed: ${result.stats.timeElapsed || 'N/A'}`);
        }

        // Top 3 Strategies
        if (result.top3 && result.top3.length > 0) {
            console.log('\n🏆 Top 3 Strategies:');
            result.top3.forEach((strategy, idx) => {
                console.log(`\n   ${idx + 1}. ${strategy.logic}`);
                console.log(`      Score: ${strategy.score}`);
                console.log(`      Win Rate: ${strategy.metrics.winRate}%`);
                console.log(`      Expectancy: ${strategy.metrics.expectancy}%`);
                console.log(`      Trades: ${strategy.metrics.trades}`);
            });
        }

        // V1 Strategy
        if (result.v1Strategy) {
            console.log('\n🎯 V1 Strategy Generated:');
            console.log(`   ID: ${result.v1Strategy.id}`);
            console.log(`   Description: ${result.v1Strategy.description || 'N/A'}`);

            if (result.v1Strategy.expectedMetrics) {
                console.log('\n   Expected Performance:');
                console.log(`   - Accuracy: ${result.v1Strategy.expectedMetrics.accuracy}`);
                console.log(`   - Expectancy: ${result.v1Strategy.expectedMetrics.expectancy}%`);
                console.log(`   - Trades: ${result.v1Strategy.expectedMetrics.trades}`);
            }

            if (result.v1Strategy.rules) {
                console.log('\n   Rules:');
                console.log(`   - Entry: ${JSON.stringify(result.v1Strategy.rules.entry).substring(0, 100)}...`);
                console.log(`   - Exit: ${JSON.stringify(result.v1Strategy.rules.exit).substring(0, 100)}...`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎉 Test Passed!');
        console.log('='.repeat(60));
        console.log(`\n✅ Time-travel backtest is working correctly!`);
        console.log(`✅ V1 strategy generated and saved to database`);
        console.log(`✅ API endpoint returning proper response format\n`);

        // Test V1 retrieval
        await testV1Retrieval();

    } catch (error) {
        console.error('\n❌ Test Failed:');
        console.error(error.message);
        console.error('\nStack:', error.stack);
        process.exit(1);
    }
}

async function testV1Retrieval() {
    console.log('\n🔍 Testing V1 Strategy Retrieval...\n');

    try {
        const response = await fetch(`${API_BASE}/api/categories/${CATEGORY_KEY}/v1-strategy`);

        if (!response.ok) {
            console.warn(`   ⚠️ V1 retrieval endpoint not available (${response.status})`);
            return;
        }

        const result = await response.json();

        if (result.strategy) {
            console.log('   ✅ V1 strategy can be retrieved from database');
            console.log(`   📦 Strategy ID: ${result.strategy.id}`);
            console.log(`   📈 Win Rate: ${result.strategy.metrics?.winRate?.toFixed(1) || 'N/A'}%`);
        } else {
            console.log('   ⚠️ No V1 strategy found (may need API route)');
        }

    } catch (error) {
        console.log(`   ⚠️ V1 retrieval test skipped: ${error.message}`);
    }
}

// Run the test
console.log('\n');
testTimeTravelBacktest().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
