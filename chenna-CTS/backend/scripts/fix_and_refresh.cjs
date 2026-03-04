/**
 * Force manual fix for stocks whose intraday data isn't being saved.
 * Then run the full refresh again.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const TOKENS = path.join(__dirname, '../auth/tokens.json');
const CACHE_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DAY = path.join(__dirname, '../cache/day');

function toISTDateString(d) {
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split('T')[0];
}

async function fetchIntraday(instrumentKey) {
    const token = JSON.parse(fs.readFileSync(TOKENS, 'utf8')).access_token;
    const url = `https://api.upstox.com/v2/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/30minute`;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
            if (!res.ok) return [];
            const data = await res.json();
            if (data.status !== 'success' || !data.data?.candles?.length) return [];
            return data.data.candles.map(c => ({
                timestamp: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
            })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        } catch (e) {
            if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
            return [];
        }
    }
    return [];
}

(async () => {
    const today = toISTDateString(new Date());
    console.log(`Fixing cache for ${today}...\n`);

    // Get ALL IB stocks
    const ibCats = await p.stockCategory.findMany({
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: { gte: new Date(today + 'T00:00:00Z'), lt: new Date(new Date(today + 'T00:00:00Z').getTime() + 86400000) }
        },
        include: { stock: true }
    });
    const stocks = ibCats.map(r => r.stock).filter(s => s && s.instrumentKey);
    console.log(`${stocks.length} IB stocks`);

    let fixed30m = 0, fixedDay = 0, apicalls = 0;

    for (const stock of stocks) {
        const sym = stock.symbol;
        const cleanKey = sym.replace(/[^a-zA-Z0-9_-]/g, '_');
        const cache30Path = path.join(CACHE_30M, `${cleanKey}_master.json`);
        const cacheDayPath = path.join(CACHE_DAY, `${cleanKey}_master.json`);

        // Check if today already in 30m cache
        let existing30 = [];
        if (fs.existsSync(cache30Path)) {
            existing30 = JSON.parse(fs.readFileSync(cache30Path, 'utf8'));
        }
        const hasTodayIn30m = existing30.some(c => String(c.timestamp || c.date).split('T')[0] === today);

        if (hasTodayIn30m) continue; // Already good

        // Fetch fresh
        const candles = await fetchIntraday(stock.instrumentKey);
        apicalls++;
        if (candles.length === 0) {
            console.log(`  ${sym}: no intraday candles`);
            continue;
        }

        // Force append to 30m cache
        const merged30 = [...existing30, ...candles];
        // Dedup by timestamp
        const uniq = {};
        for (const c of merged30) { uniq[c.timestamp] = c; }
        const final30 = Object.values(uniq).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        fs.writeFileSync(cache30Path, JSON.stringify(final30));
        fixed30m++;

        // Also create/update daily candle
        const dailyCandle = {
            timestamp: today + 'T00:00:00+05:30',
            open: candles[0].open,
            high: Math.max(...candles.map(c => c.high)),
            low: Math.min(...candles.map(c => c.low)),
            close: candles[candles.length - 1].close,
            volume: candles.reduce((s, c) => s + (c.volume || 0), 0)
        };

        let existingDay = [];
        if (fs.existsSync(cacheDayPath)) {
            existingDay = JSON.parse(fs.readFileSync(cacheDayPath, 'utf8'));
        }
        existingDay = existingDay.filter(c => String(c.timestamp || c.date).split('T')[0] !== today);
        existingDay.push(dailyCandle);
        existingDay.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));
        fs.writeFileSync(cacheDayPath, JSON.stringify(existingDay));
        fixedDay++;

        console.log(`  ${sym}: ${candles.length} candles → 30m cache (${final30.length} total) + daily`);
        await new Promise(r => setTimeout(r, 250));
    }

    console.log(`\nFixed: ${fixed30m} 30m caches, ${fixedDay} daily caches | API: ${apicalls}`);

    // Verify UNIONBANK
    const ubPath = path.join(CACHE_30M, 'UNIONBANK_master.json');
    if (fs.existsSync(ubPath)) {
        const raw = JSON.parse(fs.readFileSync(ubPath, 'utf8'));
        const todayCount = raw.filter(c => String(c.timestamp).split('T')[0] === today).length;
        console.log(`\nUNIONBANK verification: ${todayCount} candles for today (total: ${raw.length})`);
    }

    // Now run confirmation
    console.log('\n--- Running confirmation ---');
    await p.v5Signal.deleteMany({ where: { signalDate: new Date(today + 'T00:00:00Z'), category: 'INTRADAY_BOOST' } });

    const cs = require('../services/confirmationService.cjs');
    const result = await cs.confirmIntradaySignals(today);
    console.log(`Result: triggered=${result.triggered}, expired=${result.expired}`);

    // Show signals
    const sigs = await p.v5Signal.findMany({
        where: { signalDate: new Date(today + 'T00:00:00Z') },
        orderBy: { confidenceScore: 'desc' },
        select: { symbol: true, direction: true, confidenceScore: true, confidenceTier: true, status: true, entryType: true, entryPrice: true, stopPrice: true, t1Price: true }
    });

    console.log(`\n=== TODAY'S SIGNALS (${today}) ===`);
    console.log(`Total: ${sigs.length} | Confirmed: ${sigs.filter(s => s.status === 'CONFIRMED').length} | Expired: ${sigs.filter(s => s.status === 'EXPIRED').length}\n`);
    console.log(JSON.stringify(sigs.map(s => ({
        sym: s.symbol, dir: s.direction, score: s.confidenceScore, tier: s.confidenceTier,
        entry: Number(s.entryPrice || 0).toFixed(1), stop: Number(s.stopPrice || 0).toFixed(1),
        t1: Number(s.t1Price || 0).toFixed(1), status: s.status, type: s.entryType || '-'
    })), null, 2));

    await p.$disconnect();
})();
