const fetch = require('node-fetch');

async function testDirectAPI() {
    console.log('\n🧪 Testing Time-Travel API Directly\n');

    try {
        console.log('📤 Sending request to http://localhost:3001/api/strategy/time-travel-backtest');

        const response = await fetch('http://localhost:3001/api/strategy/time-travel-backtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryKey: 'DOWNSIDE_LOM_SWING' })
        });

        console.log(`📥 Status: ${response.status} ${response.statusText}\n`);

        const text = await response.text();

        if (response.ok) {
            const data = JSON.parse(text);
            console.log('✅ SUCCESS!');
            console.log('Top 3:', data.top3 ? data.top3.length : 'N/A');
            console.log('V1 Strategy:', data.v1Strategy ? data.v1Strategy.id : 'N/A');
        } else {
            console.log('❌ ERROR Response:');
            console.log(text);
        }

    } catch (error) {
        console.error('❌ Request Failed:', error.message);
        console.error(error.stack);
    }
}

testDirectAPI();
