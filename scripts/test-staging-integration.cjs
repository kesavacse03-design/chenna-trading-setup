#!/usr/bin/env node

// Test staging integration for Upstox order adapter
// Usage: node scripts/test-staging-integration.cjs

const { UpstoxOrderAdapter } = require('../backend/strategy/upstoxOrderAdapter.cjs');

async function testStagingIntegration() {
  console.log('🧪 Testing Staging Integration...\n');

  // Set staging environment
  process.env.UPSTOX_ENV = 'staging';
  process.env.DRY_RUN = '1'; // Start with dry run
  process.env.UPSTOX_ACCESS_TOKEN = 'test-staging-token';

  const adapter = new UpstoxOrderAdapter();

  console.log(`🌍 Environment: ${adapter.isStaging ? 'staging' : 'production'}`);
  console.log(`🔒 Dry Run: ${adapter.dryRun ? 'enabled' : 'disabled'}`);
  console.log(`🔑 Token: ${adapter.accessToken ? 'set' : 'not set'}\n`);

  try {
    // Test 1: Dry run order submission
    console.log('Test 1: Dry run order submission');
    const order = {
      side: 'buy',
      qty: 10,
      type: 'market',
      symbol: 'TEST_STOCK',
      price: 100
    };

    const fill = await adapter.submit(order, [], { close: 100 });
    console.log('✅ Dry run result:', JSON.stringify(fill, null, 2));

    // Test 2: Token validation
    console.log('\nTest 2: Token validation');
    const token = await adapter.ensureToken();
    console.log('✅ Token obtained:', token.substring(0, 10) + '...');

    // Test 3: Real API call (will fail with test token, but tests connectivity)
    console.log('\nTest 3: API connectivity test (expecting auth failure)');
    const realAdapter = new UpstoxOrderAdapter(); // Create new adapter after env change
    realAdapter.dryRun = false; // Force disable dry run

    try {
      await realAdapter.submit(order);
    } catch (error) {
      if (error.message.includes('auth') || error.message.includes('token') || error.message.includes('401')) {
        console.log('✅ Expected auth failure - staging API reachable');
      } else {
        console.log('⚠️  Unexpected error:', error.message);
      }
    }

    console.log('\n🎉 Staging integration tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testStagingIntegration();
