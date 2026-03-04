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

async function makeRequestWithUrlObj(label, urlStr) {
    return new Promise((resolve) => {
        const token = getAccessToken();
        if (!token) return resolve();

        console.log(`\n[${label}] Parsing URL: ${urlStr}`);
        const urlObj = new URL(urlStr);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'User-Agent': 'Node.js/PriceService' // Same as PriceService
            }
        };

        console.log(`[${label}] Requesting path: ${options.path}`);

        const req = https.request(options, (res) => {
            console.log(`[${label}] Status: ${res.statusCode}`);
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                console.log(`[${label}] Body Start: ${data.substring(0, 100)}`);
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`[${label}] Error: ${e.message} (${e.code})`);
            resolve();
        });

        req.end();
    });
}

async function main() {
    console.log('--- Debugging URL Object Usage ---');
    const key = 'NSE_EQ|INE466L01038';
    const encodedKey = encodeURIComponent(key);
    const url = `https://api.upstox.com/v2/historical-candle/intraday/${encodedKey}/1minute`;

    await makeRequestWithUrlObj('URL_OBJ_TEST', url);
}

main();
