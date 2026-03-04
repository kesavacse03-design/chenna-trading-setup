const fetch = require('node-fetch');

async function main() {
    console.log('[Check] Downloading NSE.json...');
    const url = 'https://assets.upstox.com/feed/instruments/NSE.json';

    try {
        const response = await fetch(url);
        const data = await response.json();

        console.log(`[Check] Total instruments: ${data.length}`);

        const reliance = data.find(d => d.trading_symbol === 'RELIANCE' && d.instrument_type === 'EQ');

        if (reliance) {
            console.log('\n[Check] Found RELIANCE:');
            console.log(JSON.stringify(reliance, null, 2));
        } else {
            console.log('[Check] RELIANCE not found!');
        }

        // Also check one that works if we knew one (e.g. SBIN)
        const sbin = data.find(d => d.trading_symbol === 'SBIN' && d.instrument_type === 'EQ');
        if (sbin) {
            console.log('\n[Check] Found SBIN:');
            console.log(JSON.stringify(sbin, null, 2));
        }

    } catch (e) {
        console.error('[Check] Error:', e.message);
    }
}

main();
