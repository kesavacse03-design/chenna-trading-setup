// Debug UNIONBANK instrument key + test intraday fetch
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const TOKENS = path.join(__dirname, '../auth/tokens.json');

(async () => {
    const stock = await p.stock.findFirst({ where: { symbol: 'UNIONBANK' }, select: { symbol: true, instrumentKey: true } });
    console.log('DB record:', JSON.stringify(stock));

    const token = JSON.parse(fs.readFileSync(TOKENS, 'utf8')).access_token;
    const instKey = encodeURIComponent(stock.instrumentKey);
    const url = `https://api.upstox.com/v2/historical-candle/intraday/${instKey}/30minute`;
    console.log('URL:', url);

    const res = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
    console.log('Status:', res.status);
    const data = await res.json();

    if (data.data?.candles?.length) {
        console.log('Candles:', data.data.candles.length);
        data.data.candles.forEach(c => console.log(' ', c[0], 'O:', c[1], 'H:', c[2], 'L:', c[3], 'C:', c[4]));
    } else {
        console.log('No candles!');
        console.log('Response:', JSON.stringify(data).substring(0, 300));
    }

    // Now check: does the cleanKey match?
    const cleanKey = 'UNIONBANK'.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachePath = path.join(__dirname, '../cache/30minute', cleanKey + '_master.json');
    console.log('\nCache path:', cachePath);
    console.log('Exists:', fs.existsSync(cachePath));

    // Try reading and checking the merge
    if (fs.existsSync(cachePath)) {
        const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        console.log('Cache entries:', raw.length);
        // Check if any entry matches today
        const todayEntries = raw.filter(c => String(c.timestamp || c.date).split('T')[0] === '2026-02-27');
        console.log('Today entries in cache:', todayEntries.length);
    }

    await p.$disconnect();
})();
