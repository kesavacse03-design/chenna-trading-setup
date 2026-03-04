
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3001/api/backtest/run';

async function runTest(name, payload) {
    console.log(`\n--- TESTING: ${name} ---`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.status === 'success') {
            console.log('✅ SUCCESS');
            console.log('Strategy:', data.strategy);
            console.log('Version:', data.version || data.strategyVersion);
            console.log('Trades:', data.results.trades || data.results.totalTrades);
            console.log('P&L:', data.results.totalPnL || data.results.totalReturn);

            // Validation
            if (name.includes('1-Minute') && data.version?.includes('V2.1')) {
                console.log('VALIDATION: Correctly used V2.1 Engine');
            } else if (name.includes('1-Day') && data.version?.includes('DAILY')) {
                console.log('VALIDATION: Correctly used Daily Engine');
            } else {
                console.log('WARNING: Engine mismatch!');
            }
        } else {
            console.log('❌ FAILED:', data.message);
        }
    } catch (e) {
        console.error('ERROR:', e.message);
    }
}

async function verify() {
    // Test 1: 1-Minute Mode (Feb 9 2026) -> Should use V2.1 (COMBO_SPEED)
    await runTest('1-Minute Precision (Feb 9)', {
        category: 'INTRADAY_BOOST',
        startDate: '2026-02-09',
        endDate: '2026-02-09',
        capital: 100000,
        dataMode: '1minute'
    });

    // Test 2: 1-Day Mode (Dec 2025) -> Should use Daily Strategy
    await runTest('1-Day Historical (Dec 2025)', {
        category: 'INTRADAY_BOOST',
        startDate: '2025-12-01',
        endDate: '2025-12-31',
        capital: 100000,
        dataMode: '1day'
    });
}

verify();
