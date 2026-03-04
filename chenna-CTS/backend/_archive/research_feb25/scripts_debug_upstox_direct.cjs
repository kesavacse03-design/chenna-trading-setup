const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '../auth/tokens.json');

async function getAccessToken() {
    try {
        const data = await fs.readFile(TOKEN_PATH, 'utf8');
        const tokens = JSON.parse(data);
        return tokens.access_token;
    } catch (error) {
        console.error('Failed to load token:', error);
        return null;
    }
}

async function testFetch(label, key, encode) {
    const token = await getAccessToken();
    if (!token) return;

    const from = '2026-02-05';
    const to = '2026-02-06';
    const interval = '1minute';

    // Construct URL
    const keyPart = encode ? encodeURIComponent(key) : key;
    const url = `https://api.upstox.com/v2/historical-candle/${keyPart}/${interval}/${to}/${from}`;

    console.log(`\n[${label}] Fetching: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        console.log(`[${label}] Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`[${label}] Response: ${text.substring(0, 200)}...`);

    } catch (err) {
        console.error(`[${label}] Error: ${err.message} (${err.code})`);
    }
}

async function main() {
    console.log('--- Debugging Upstox URL Encoding ---');

    // Test Case 1: Raw ISIN only (No Pipe)
    await testFetch('ISIN Only', 'INE002A01018', false);

    // Test Case 2: Raw Token only (No Pipe)
    await testFetch('Token Only', '2885', false);

    // Test Case 3: Encoded Pipe (Confirm 400)
    await testFetch('Encoded Token Full', 'NSE_EQ|2885', true);
}

main();
