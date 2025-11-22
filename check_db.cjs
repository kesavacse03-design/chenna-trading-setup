const http = require('http');

http.get('http://localhost:3001/api/stocks', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const stocks = JSON.parse(data);
            console.log('Raw Response Length:', Array.isArray(stocks) ? stocks.length : 'Not an array');
            if (Array.isArray(stocks)) {
                console.log('--- Database Content (Flat List) ---');
                console.log(`Total Stocks: ${stocks.length}`);
                if (stocks.length > 0) {
                    console.log('Sample:', JSON.stringify(stocks.slice(0, 3), null, 2));
                }
                console.log('------------------------------------');
            } else {
                console.log('Response:', JSON.stringify(stocks, null, 2));
            }
        } catch (e) {
            console.error('Error parsing JSON:', e);
        }
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
