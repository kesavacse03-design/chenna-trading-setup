// Test Upstox API Connection
const fs = require('fs');
const path = require('path');

async function testUpstoxAPI() {
    const expiry = new Date(payload.exp * 1000);
    const now = new Date();

    console.log(`  Token expires: ${expiry.toISOString()}`);
    console.log(`  Current time: ${now.toISOString()}`);

    if (now > expiry) {
        console.log('  ❌ TOKEN EXPIRED!\n');
        return false;
    } else {
        console.log(`  ✓ Token valid for ${Math.floor((expiry - now) / 1000 / 60 / 60)} hours\n`);
    }

    // 2. Test API endpoint
    console.log('Testing Upstox API...');

    const fetch = (await import('node-fetch')).default;

    // Test with a simple instrument (Reliance)
    const instrumentKey = 'NSE_EQ|INE002A01018';
    const toDate = '2025-11-22';
    const fromDate = '2025-11-21';

    const url = `https://api.upstox.com/v2/historical-candle/${instrumentKey}/day/${toDate}/${fromDate}`;

    console.log(`URL: ${url}`);
    console.log('Making request...\n');

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${tokens.access_token}`
        }
    });

    console.log(`Response status: ${response.status} ${response.statusText}`);

    if (response.ok) {
        const data = await response.json();
        console.log('✓ API Working!');
        console.log(`  Candles received: ${data.data?.candles?.length || 0}`);
        if (data.data?.candles?.length > 0) {
            console.log('  Sample candle:', data.data.candles[0]);
        }
        return true;
    } else {
        const errorText = await response.text();
        console.log('❌ API Error:');
        console.log(`  Status: ${response.status}`);
        console.log(`  Response: ${errorText}`);
        return false;
    }

} catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error type:', error.code || error.name);
    console.error('Full error:', error);
    return false;
}
}

testUpstoxAPI()
    .then(success => {
        if (success) {
            console.log('\n✅ Upstox API is working correctly!');
            process.exit(0);
        } else {
            console.log('\n❌ Upstox API test failed!');
            console.log('\nPossible issues:');
            console.log('1. Access token expired or invalid');
            console.log('2. Network/firewall blocking Upstox');
            console.log('3. Upstox API maintenance');
            console.log('4. Need to refresh token from Upstox console');
            process.exit(1);
        }
    });
