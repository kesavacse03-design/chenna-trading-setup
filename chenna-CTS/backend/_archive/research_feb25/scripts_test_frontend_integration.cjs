// Test script to verify stock management API integration
// Usage: node test_frontend_integration.cjs
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001';
const TEST_CATEGORY = 'HIGH_POWERED_STOCKS';

async function testIntegration() {
    console.log('🧪 Testing Stock Management API Integration...\n');

    // Test 1: Save stocks to a category
    console.log(`📤 Step 1: Saving 3 stocks to ${TEST_CATEGORY}...`);
    const savePayload = {
        stocks: [
            { symbol: 'RELIANCE', name: 'RELIANCE INDUSTRIES LTD', listedDate: '2025-11-20' },
            { symbol: 'TCS', name: 'TATA CONSULTANCY SERV LT', listedDate: '2025-11-20' },
            { symbol: 'INFY', name: 'INFOSYS LIMITED', listedDate: '2025-11-20' }
        ]
    };

    const saveResp = await fetch(`${API_BASE}/api/categories/${TEST_CATEGORY}/stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savePayload)
    });

    const saveData = await saveResp.json();
    console.log('Response:', JSON.stringify(saveData, null, 2));

    if (!saveData.ok) {
        console.log('❌ Save failed!');
        return;
    }
    console.log(`✅ Saved ${saveData.count} stocks\n`);

    // Test 2: Retrieve stocks
    console.log(`📥 Step 2: Retrieving stocks from ${TEST_CATEGORY}...`);
    const getResp = await fetch(`${API_BASE}/api/categories/${TEST_CATEGORY}/stocks`);
    const getData = await getResp.json();

    console.log('Response:', JSON.stringify(getData, null, 2));
    console.log(`\n✅ Retrieved ${getData.stocks?.length || 0} stocks`);

    // Verify
    const expectedSymbols = ['RELIANCE', 'TCS', 'INFY'];
    const actualSymbols = (getData.stocks || []).map(s => s.symbol);
    const allFound = expectedSymbols.every(s => actualSymbols.includes(s));

    if (allFound) {
        console.log('\n🎉 Integration Test PASSED!');
        console.log('✅ Frontend can now save stocks to database');
        console.log('✅ Frontend can retrieve stocks from database');
    } else {
        console.log('\n⚠️  Some stocks missing:', expectedSymbols.filter(s => !actualSymbols.includes(s)));
    }
}

testIntegration().catch(err => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
});
