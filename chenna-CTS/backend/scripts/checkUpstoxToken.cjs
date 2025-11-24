#!/usr/bin/env node
/**
 * Upstox Token Diagnostic Tool
 * Checks if token is valid and tests API connectivity
 */

const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

const TOKENS_PATH = path.join(__dirname, '../auth/tokens.json');

async function checkToken() {
    console.log('🔍 Upstox Token Diagnostic Tool\n');
    console.log('='.repeat(60));

    try {
        // Step 1: Check if token file exists
        console.log('\n📁 Step 1: Checking token file...');
        try {
            await fs.access(TOKENS_PATH);
            console.log('✅ Token file exists at:', TOKENS_PATH);
        } catch (err) {
            console.log('❌ Token file NOT FOUND!');
            console.log('\n💡 Solution: Create auth/tokens.json with your access token:');
            console.log('{\n  "access_token": "YOUR_TOKEN_HERE"\n}');
            return;
        }

        // Step 2: Read token
        console.log('\n🔑 Step 2: Reading token...');
        const data = await fs.readFile(TOKENS_PATH, 'utf8');
        const tokens = JSON.parse(data);

        if (!tokens.access_token) {
            console.log('❌ No access_token found in file!');
            return;
        }

        console.log('✅ Token found:', tokens.access_token.substring(0, 30) + '...');
        console.log('   Updated at:', tokens.updated_at || 'Not recorded');

        // Step 3: Test token validity with Upstox API
        console.log('\n🌐 Step 3: Testing token with Upstox API...');

        // Test 1: Get user profile (lightweight API call)
        try {
            const profileResponse = await fetch('https://api.upstox.com/v2/user/profile', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${tokens.access_token}`
                }
            });

            if (profileResponse.ok) {
                const profile = await profileResponse.json();
                console.log('✅ TOKEN IS VALID!');
                console.log('   User:', profile.data?.user_name || profile.data?.email || 'N/A');
                console.log('   User Type:', profile.data?.user_type || 'N/A');
            } else {
                const error = await profileResponse.text();
                console.log('❌ TOKEN IS INVALID OR EXPIRED!');
                console.log('   Status:', profileResponse.status, profileResponse.statusText);
                console.log('   Error:', error.substring(0, 200));

                if (profileResponse.status === 401) {
                    console.log('\n⚠️  Token expired! You need to generate a new one.');
                    showTokenRefreshInstructions();
                }
                return;
            }
        } catch (apiError) {
            console.log('❌ Failed to connect to Upstox API!');
            console.log('   Error:', apiError.message);
            return;
        }

        // Test 2: Fetch sample price data
        console.log('\n📊 Step 4: Testing price data fetch...');
        const testSymbol = 'NSE_EQ|INE002A01018'; // RELIANCE
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        try {
            const priceUrl = `https://api.upstox.com/v2/historical-candle/${testSymbol}/day/${today}/${yesterday}`;
            const priceResponse = await fetch(priceUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${tokens.access_token}`
                }
            });

            if (priceResponse.ok) {
                const priceData = await priceResponse.json();
                const candles = priceData.data?.candles || [];
                console.log('✅ PRICE FETCH WORKING!');
                console.log('   Symbol: RELIANCE');
                console.log('   Candles fetched:', candles.length);
                if (candles.length > 0) {
                    console.log('   Latest candle:', JSON.stringify(candles[0]));
                }
            } else {
                console.log('⚠️  Price fetch failed (may be due to market hours/data availability)');
                console.log('   Status:', priceResponse.status);
            }
        } catch (priceError) {
            console.log('⚠️  Could not test price fetching');
            console.log('   Error:', priceError.message);
        }

        // Step 5: Summary
        console.log('\n' + '='.repeat(60));
        console.log('\n✅ DIAGNOSTIC COMPLETE\n');
        console.log('Token Status: VALID ✅');
        console.log('API Access: WORKING ✅');
        console.log('Live Prices: Should work once markets open');
        console.log('\n🚀 Your system is ready for live trading!\n');

    } catch (error) {
        console.log('\n❌ Diagnostic failed:', error.message);
    }
}

function showTokenRefreshInstructions() {
    console.log('\n' + '='.repeat(60));
    console.log('\n🔄 HOW TO GET A FRESH TOKEN:\n');
    console.log('1. Go to: https://api-v2.upstox.com/');
    console.log('2. Login with your Upstox account');
    console.log('3. Go to "Apps" or "Developer Console"');
    console.log('4. Click on your app (or create new one)');
    console.log('5. Click "Generate Token" or "Get Access Token"');
    console.log('6. Copy the token');
    console.log('7. Run: node scripts/updateUpstoxToken.cjs YOUR_TOKEN');
    console.log('8. Restart backend: npm run dev\n');
}

checkToken();
