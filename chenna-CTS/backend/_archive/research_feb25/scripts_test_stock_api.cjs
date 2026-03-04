const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001';
const CATEGORY_KEY = 'TEST_CATEGORY_API';

async function testApi() {
    console.log('🚀 Testing Stock Management API...');

    // 1. Push Stocks
    console.log('\n📤 Pushing stocks...');
    const payload = {
        stocks: [
            { symbol: 'RELIANCE', name: 'Reliance Industries' },
            { symbol: 'TCS', name: 'Tata Consultancy Services' },
            { symbol: 'INFY', name: 'Infosys' }
        ]
    };

    try {
        const res = await fetch(`${BASE_URL}/api/categories/${CATEGORY_KEY}/stocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log('Response:', data);
        if (!data.ok) throw new Error(data.error);
    } catch (e) {
        console.error('❌ Push failed:', e.message);
        process.exit(1);
    }

    // 2. Fetch Stocks
    console.log('\n📥 Fetching stocks...');
    try {
        const res = await fetch(`${BASE_URL}/api/categories/${CATEGORY_KEY}/stocks`);
        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (!data.ok) throw new Error(data.error);
        if (data.stocks.length !== 3) throw new Error(`Expected 3 stocks, got ${data.stocks.length}`);

        console.log('✅ API Test Passed!');
    } catch (e) {
        console.error('❌ Fetch failed:', e.message);
        process.exit(1);
    }
}

testApi();
