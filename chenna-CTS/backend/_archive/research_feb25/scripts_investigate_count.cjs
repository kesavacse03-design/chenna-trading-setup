const http = require('http');

const options = {
    hostname: 'localhost', port: 3001,
    path: '/api/categories/SHORT_TERM_SWING_BO_DOWN/stocks',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const r = JSON.parse(data);
        console.log(`API returned ok: ${r.ok}`);
        console.log(`Total items in stocks array: ${r.stocks?.length}`);

        // Unique symbols
        const symbols = new Set(r.stocks?.map(s => s.symbol));
        console.log(`Unique symbols: ${symbols.size}`);

        // Show first 10
        console.log(`\nFirst 10 returned:`);
        for (const s of (r.stocks || []).slice(0, 10)) {
            console.log(`  ${s.symbol} | date: ${s.date} | instrumentKey: ${s.instrumentKey || 'NULL'}`);
        }

        // Group by date to see the pattern
        const byDate = {};
        for (const s of r.stocks || []) {
            const d = s.date || 'NULL';
            byDate[d] = (byDate[d] || 0) + 1;
        }

        // Most recent date
        const dates = Object.keys(byDate).sort();
        console.log(`\nMost recent dates:`);
        for (const d of dates.slice(-5)) {
            console.log(`  ${d}: ${byDate[d]} stocks`);
        }
    });
});

req.on('error', (e) => console.error('Failed:', e.message));
req.end();
