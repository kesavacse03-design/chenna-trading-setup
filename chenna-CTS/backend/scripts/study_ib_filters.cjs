const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

function load30mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const byDay = {};
        for (const c of raw) {
            const parts = String(c.timestamp || c.date).split('T');
            const d = parts[0];
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push(c);
        }
        return byDay;
    } catch (e) { return null; }
}

function loadDayCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_DAY, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        return raw.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            close: parseFloat(c.close),
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            volume: parseFloat(c.volume)
        })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return null; }
}

async function extract626Setups() {
    const records = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } },
        include: { stock: true }
    });

    const activeHPS = await prisma.stockCategory.findMany({
        where: { category: { key: 'HIGH_POWERED_STOCKS' } },
        include: { stock: true }
    });

    const hpsMap = {}; // date -> array of symbols
    for (const r of activeHPS) {
        if (!r.addedDate) continue;
        const d = r.addedDate.toISOString().split('T')[0];
        if (!hpsMap[d]) hpsMap[d] = new Set();
        hpsMap[d].add(r.stock.symbol);
    }

    // Group exactly by the day they were ADDED (Day 0) as our 626 pool
    const byDate = {};
    for (const r of records) {
        if (!r.addedDate) continue;
        const d = r.addedDate.toISOString().split('T')[0];
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(r.stock);
    }

    const validDates = Object.keys(byDate).sort();

    // Data structures for the 3 Analyses
    const stats = {
        totalSetups: 0,
        dualLists: { total: 0, wins: 0 },
        singleLists: { total: 0, wins: 0 },
        priceBands: {
            '<100': { total: 0, wins: 0 },
            '100-300': { total: 0, wins: 0 },
            '300-500': { total: 0, wins: 0 },
            '500-1000': { total: 0, wins: 0 },
            '1000-2000': { total: 0, wins: 0 },
            '2000-5000': { total: 0, wins: 0 },
            '>5000': { total: 0, wins: 0 }
        },
        expiryImpact: {
            'Monday': { total: 0, wins: 0 },
            'Tuesday': { total: 0, wins: 0 },
            'Wednesday': { total: 0, wins: 0 },
            'Thursday': { total: 0, wins: 0 },
            'Friday': { total: 0, wins: 0 },
            'Monthly_Expiry': { total: 0, wins: 0 }, // Last Thursday of month
            'Weekly_Expiry': { total: 0, wins: 0 }
        }
    };

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const date of validDates) {
        const stocks = byDate[date];
        const dateObj = new Date(date);
        const dayName = daysOfWeek[dateObj.getDay()];

        // Find if this is the last Thursday of the month
        const nextWeek = new Date(dateObj);
        nextWeek.setDate(dateObj.getDate() + 7);
        const isMonthlyExpiry = dayName === 'Thursday' && nextWeek.getMonth() !== dateObj.getMonth();

        for (const stock of stocks) {
            const sym = stock.symbol;
            const isDual = hpsMap[date] && hpsMap[date].has(sym);

            const data30 = load30mCache(sym);
            if (!data30 || !data30[date]) continue;
            const candles = data30[date];
            if (candles.length < 5) continue;

            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;

            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i <= 5 && i < candles.length; i++) {
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }
            if (bIdx === -1) continue; // No breakout

            const bCandle = candles[bIdx];
            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);
            let entryType = 'RUNNER', entryPrice = 0;

            if (bIdx + 1 >= candles.length) continue;
            entryPrice = parseFloat(candles[bIdx + 1].open);

            const trueRisk = Math.max(Math.abs(entryPrice - baseStop), entryPrice * 0.005);
            const targetT1 = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;

            let result = 'LOSS';
            let touchedOR = false, piercedIntra = false;

            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);

                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) { touchedOR = true; entryPrice = orh; if (cl <= baseStop) piercedIntra = true; }
                } else {
                    if (!touchedOR && ch >= orl) { touchedOR = true; entryPrice = orl; if (ch >= baseStop) piercedIntra = true; }
                }
            }

            if (touchedOR && piercedIntra) {
                // Instantly stopped out intra-candle padding
            } else {
                if (touchedOR) entryPrice = sType === 'LONG' ? orh : orl;
                else entryPrice = parseFloat(candles[bIdx + 1].open);

                const t1 = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;
                for (let i = bIdx + 1; i < candles.length; i++) {
                    const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                    if (sType === 'LONG') {
                        if (cl <= baseStop) { result = 'LOSS'; break; }
                        if (ch >= t1) { result = 'WIN'; break; }
                    } else {
                        if (ch >= baseStop) { result = 'LOSS'; break; }
                        if (cl <= t1) { result = 'WIN'; break; }
                    }
                }
            }

            const isWin = result === 'WIN';
            stats.totalSetups++;

            // 1. Dual Overlap Analysis
            if (isDual) {
                stats.dualLists.total++;
                if (isWin) stats.dualLists.wins++;
            } else {
                stats.singleLists.total++;
                if (isWin) stats.singleLists.wins++;
            }

            // 2. Price Band Analysis
            let pb = '';
            if (boPrice < 100) pb = '<100';
            else if (boPrice <= 300) pb = '100-300';
            else if (boPrice <= 500) pb = '300-500';
            else if (boPrice <= 1000) pb = '500-1000';
            else if (boPrice <= 2000) pb = '1000-2000';
            else if (boPrice <= 5000) pb = '2000-5000';
            else pb = '>5000';

            stats.priceBands[pb].total++;
            if (isWin) stats.priceBands[pb].wins++;

            // 3. Expiry Impact Analysis
            stats.expiryImpact[dayName].total++;
            if (isWin) stats.expiryImpact[dayName].wins++;

            if (dayName === 'Thursday') {
                if (isMonthlyExpiry) {
                    stats.expiryImpact['Monthly_Expiry'].total++;
                    if (isWin) stats.expiryImpact['Monthly_Expiry'].wins++;
                } else {
                    stats.expiryImpact['Weekly_Expiry'].total++;
                    if (isWin) stats.expiryImpact['Weekly_Expiry'].wins++;
                }
            }
        }
    }

    // Print Results
    console.log(`\n=== ANALYSIS 1: DUAL-CATEGORY OVERLAP EDGE ===`);
    console.log(`Dual-Listed (IB + HPS):`);
    console.log(`  - Total Setups: ${stats.dualLists.total}`);
    console.log(`  - T1 Hit Rate: ${((stats.dualLists.wins / stats.dualLists.total) * 100 || 0).toFixed(1)}%`);
    console.log(`Single-Listed (IB Only):`);
    console.log(`  - Total Setups: ${stats.singleLists.total}`);
    console.log(`  - T1 Hit Rate: ${((stats.singleLists.wins / stats.singleLists.total) * 100 || 0).toFixed(1)}%`);
    console.log(`CONCLUSION: ${((stats.dualLists.wins / stats.dualLists.total) * 100) > ((stats.singleLists.wins / stats.singleLists.total) * 100) ? 'DUAL CATEGORY STOCKS PERFORM BETTER' : 'DUAL CATEGORY PROVIDES NO EDGE'}`);

    console.log(`\n=== ANALYSIS 2: PRICE RANGE PERFORMANCE ===`);
    const rOrder = ['<100', '100-300', '300-500', '500-1000', '1000-2000', '2000-5000', '>5000'];
    for (const r of rOrder) {
        const d = stats.priceBands[r];
        console.log(`Price ${r.padEnd(9)}: ${String(d.total).padEnd(4)} setups | T1 WR: ${((d.wins / (d.total || 1)) * 100).toFixed(1)}%`);
    }

    console.log(`\n=== ANALYSIS 3: F&O EXPIRY IMPACT ===`);
    const dOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    for (const r of dOrder) {
        const d = stats.expiryImpact[r];
        console.log(`${r.padEnd(9)}: ${String(d.total).padEnd(4)} setups | WR: ${((d.wins / (d.total || 1)) * 100).toFixed(1)}%`);
    }
    console.log(`   -- Expiry Breakdown --`);
    console.log(`   Monthly Expiry (Last Thu) : ${stats.expiryImpact['Monthly_Expiry'].total} setups | WR: ${((stats.expiryImpact['Monthly_Expiry'].wins / (stats.expiryImpact['Monthly_Expiry'].total || 1)) * 100).toFixed(1)}%`);
    console.log(`   Weekly Expiry (Other Thu) : ${stats.expiryImpact['Weekly_Expiry'].total} setups | WR: ${((stats.expiryImpact['Weekly_Expiry'].wins / (stats.expiryImpact['Weekly_Expiry'].total || 1)) * 100).toFixed(1)}%`);

}

extract626Setups().then(() => prisma.$disconnect());
