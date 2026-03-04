/**
 * Debug: Why is confirmation returning 0 signals for today?
 * Check every condition the confirmation service checks.
 */
const path = require('path');
const fs = require('fs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');
const TARGET = '2026-02-27';
const TEST_SYMS = ['IRCTC', 'MANKIND', 'COLPAL', 'UNIONBANK', 'MPHASIS'];

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
            const t = parts[1]?.substring(0, 8) || '00:00:00';
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push({ ...c, timeStr: t });
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

for (const sym of TEST_SYMS) {
    console.log(`\n=== ${sym} ===`);

    // 1. Check 30m cache
    const data30 = load30mCache(sym);
    if (!data30) {
        console.log('  30m cache: NULL (file missing)');
        continue;
    }
    const dates30 = Object.keys(data30).sort();
    console.log(`  30m cache: ${dates30.length} days | has ${TARGET}: ${!!data30[TARGET]}`);
    if (data30[TARGET]) {
        console.log(`    Today candles: ${data30[TARGET].length}`);
        console.log(`    First candle: time=${data30[TARGET][0]?.timeStr}, O=${data30[TARGET][0]?.open}, H=${data30[TARGET][0]?.high}, L=${data30[TARGET][0]?.low}`);
    }

    // 2. Check daily cache
    const dataDay = loadDayCache(sym);
    if (!dataDay) {
        console.log('  Daily cache: NULL (file missing)');
        continue;
    }
    const datesDay = dataDay.map(c => c.date);
    const lastDay = datesDay[datesDay.length - 1];
    const todayIdx = dataDay.findIndex(c => c.date === TARGET);
    console.log(`  Daily cache: ${dataDay.length} days | latest: ${lastDay} | has ${TARGET}: ${todayIdx >= 0}`);

    if (todayIdx >= 0) {
        const t = dataDay[todayIdx];
        console.log(`    Today daily: O=${t.open} H=${t.high} L=${t.low} C=${t.close}`);
        if (todayIdx >= 1) {
            const prev = dataDay[todayIdx - 1];
            console.log(`    Prev daily: date=${prev.date} C=${prev.close}`);
        }
    }

    // 3. Check if candles meet minimum count
    if (data30[TARGET] && data30[TARGET].length >= 5) {
        console.log('  ✅ Has >=5 candles for confirmation (breakout check possible)');
    } else if (data30[TARGET]) {
        console.log(`  ⚠️  Only ${data30[TARGET].length} candles — need at least 5 for breakout (candles 1-5 checked after OR)`);
    }
}

// Also check NIFTY
console.log('\n=== NIFTY50 ===');
const niftyPath = path.join(__dirname, '../cache/day/NIFTY50_2020-01-01_2026-12-31.json');
if (fs.existsSync(niftyPath)) {
    const niftyRaw = JSON.parse(fs.readFileSync(niftyPath, 'utf8'));
    if (niftyRaw.data) {
        const niftyData = niftyRaw.data.map(c => ({ date: String(c.timestamp || c.date).split('T')[0], close: parseFloat(c.close) })).sort((a, b) => a.date.localeCompare(b.date));
        const nIdx = niftyData.findIndex(c => c.date === TARGET);
        const latestDate = niftyData[niftyData.length - 1].date;
        console.log(`  Dates: ${niftyData.length} | latest: ${latestDate} | has ${TARGET}: ${nIdx >= 0}`);
        if (nIdx === -1) console.log('  ❌ NIFTY missing for today — this alone would block scoring but NOT signal gen');
    }
} else {
    console.log(`  ❌ NIFTY file missing at ${niftyPath}`);
}
