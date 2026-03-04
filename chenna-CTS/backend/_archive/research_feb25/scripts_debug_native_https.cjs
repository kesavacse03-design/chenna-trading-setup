const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.resolve(__dirname, '../auth/tokens.json');

function getAccessToken() {
    try {
        const data = fs.readFileSync(TOKEN_PATH, 'utf8');
        const tokens = JSON.parse(data);
        return tokens.access_token;
    } catch (error) {
        console.error('Failed to load token:', error.message);
        return null;
    }
}

async function makeRequestGeneric(label, pathStr) {
    return new Promise((resolve) => {
        const token = getAccessToken();
        if (!token) return resolve();

        const options = {
            hostname: 'api.upstox.com', path: pathStr, method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        };
        console.log(`\n[${label}] Requesting: ${pathStr}`);
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                console.log(`[${label}] Status: ${res.statusCode}`);
                console.log(`[${label}] First 500 chars: ${data.substring(0, 500)}`);
                resolve();
            });
        });
        req.on('error', e => { console.error(e); resolve(); });
        req.end();
    });
}

async function main() {
    console.log('--- Debugging Live Data (PERSISTENT & 360ONE) ---');
    const keyPersistent = 'NSE_EQ|INE262H01021';
    const key360 = 'NSE_EQ|INE466L01038';

    // Test LTP (Lightweight) first
    console.log('\n--- TEST 1: LTP (Last Traded Price) ---');
    await makeRequestGeneric('LTP PERSISTENT', `/v2/market-quote/ltp?instrument_key=${encodeURIComponent(keyPersistent)}`);
    // await makeRequestGeneric('LTP 360ONE', `/v2/market-quote/ltp?instrument_key=${encodeURIComponent(key360)}`);

    // Test Intraday (Heavy)
    console.log('\n--- TEST 2: Intraday Candles ---');
    await makeRequestGeneric('Candles PERSISTENT', `/v2/historical-candle/intraday/${encodeURIComponent(keyPersistent)}/1minute`);
}
main();
