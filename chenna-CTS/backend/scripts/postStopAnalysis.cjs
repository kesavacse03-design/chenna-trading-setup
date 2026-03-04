const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');

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
            const t = parts[1].substring(0, 8);
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push({ ...c, timeStr: t });
        }
        return byDay;
    } catch (e) { return null; }
}

async function main() {
    console.log("=== POST-STOP ANALYSIS ===");
    const signals = await prisma.v5Signal.findMany({
        where: {
            category: 'INTRADAY_BOOST',
            confidenceScore: { gte: 60 },
            status: 'STOPPED',
            signalDate: {
                gte: new Date('2026-02-19T00:00:00.000Z'),
                lte: new Date('2026-03-02T23:59:59.999Z')
            }
        }
    });

    console.log(`Found ${signals.length} high-score STOPPED signals between Feb 19 and March 2.`);

    let totalAnalyzed = 0;
    let hitT1Eventually = 0;
    const csvRows = [];

    for (const sig of signals) {
        const sym = sig.symbol;
        const sigDateStr = sig.signalDate.toISOString().split('T')[0];

        const c30 = load30mCache(sym);
        if (!c30 || !c30[sigDateStr]) {
            console.log(`[Missing Data] ${sym} on ${sigDateStr}`);
            continue;
        }

        const candles = c30[sigDateStr];
        const t1 = parseFloat(sig.t1Price);
        const sl = parseFloat(sig.stopPrice);
        const dir = sig.direction;

        let minPrice = Infinity;
        let maxPrice = -Infinity;
        let dayClose = 0;

        let stopHitTime = null;
        let hitT1AfterStop = 'NO';
        let maxFavorable = 0; // Absolute points
        let entryHitTime = null; // approximate

        const entryPrice = parseFloat(sig.entryPrice || sig.breakoutLevel);

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const h = parseFloat(c.high);
            const l = parseFloat(c.low);
            dayClose = parseFloat(c.close); // will end up as last candle's close

            if (h > maxPrice) maxPrice = h;
            if (l < minPrice) minPrice = l;

            // Very basic approximation for Entry Hit Time
            if (!entryHitTime) {
                if (dir === 'LONG' && h >= entryPrice) entryHitTime = c.timeStr;
                if (dir === 'SHORT' && l <= entryPrice) entryHitTime = c.timeStr;
            }

            if (!stopHitTime && entryHitTime) { // only count stop after entry
                if (dir === 'LONG' && l <= sl) stopHitTime = c.timeStr;
                if (dir === 'SHORT' && h >= sl) stopHitTime = c.timeStr;
            }

            if (stopHitTime) {
                // Look for T1 AFTER stop hit
                if (dir === 'LONG' && h >= t1) hitT1AfterStop = 'YES';
                if (dir === 'SHORT' && l <= t1) hitT1AfterStop = 'YES';
            }

            // Max Favorable calculation
            if (entryHitTime) {
                if (dir === 'LONG') {
                    if (h - entryPrice > maxFavorable) maxFavorable = h - entryPrice;
                } else {
                    if (entryPrice - l > maxFavorable) maxFavorable = entryPrice - l;
                }
            }
        }

        const maxFavPct = entryPrice ? ((maxFavorable / entryPrice) * 100).toFixed(2) + '%' : '0%';

        csvRows.push([
            sym,
            sigDateStr,
            dir,
            sig.entryType || 'UNKNOWN',
            sig.confidenceScore,
            entryPrice,
            sl,
            t1,
            stopHitTime || 'NOT_HIT(ERR)',
            hitT1AfterStop,
            maxFavPct,
            dayClose
        ].join(','));

        totalAnalyzed++;
        if (hitT1AfterStop === 'YES') hitT1Eventually++;
    }

    console.log("Symbol,Date,Direction,Type,Score,Entry,Stop,T1,StopHitTime,T1AfterStop,MaxFavorableRatio,DayClose");
    console.log(csvRows.join('\n'));

    if (totalAnalyzed > 0) {
        const pct = ((hitT1Eventually / totalAnalyzed) * 100).toFixed(1);
        console.log(`\n=== RESULTS ===`);
        console.log(`Total signals analyzed: ${totalAnalyzed}`);
        console.log(`Trades that eventually hit T1: ${hitT1Eventually}`);
        console.log(`Percentage: ${pct}% of stopped trades eventually hit T1.`);
    }
}

main().catch(console.error).finally(() => process.exit(0));
