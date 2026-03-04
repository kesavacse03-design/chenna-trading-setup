const fs = require('fs');
const path = require('path');
const cacheDir = path.join(__dirname, 'cache', '30minute');
const syms = [
    { sym: 'EICHERMOT', type: 'RETEST', dir: 'SHORT', entry: 8094.5, stop: 8112, t1: 8054.0 },
    { sym: 'INFY', type: 'RETEST', dir: 'SHORT', entry: 1304.3, stop: 1309, t1: 1297.8 },
    { sym: 'TMPV', type: 'RETEST', dir: 'SHORT', entry: 388.85, stop: 390.4, t1: 386.9 },
    { sym: 'TATACONSUM', type: 'RETEST', dir: 'SHORT', entry: 1145.1, stop: 1146, t1: 1139.4 },
    { sym: 'BPCL', type: 'RETEST', dir: 'SHORT', entry: 384.8, stop: 387.5, t1: 382.1 },
    { sym: 'WAAREEENER', type: 'RETEST', dir: 'LONG', entry: 2724.5, stop: 2694.3, t1: 2754.7 },
    { sym: 'NHPC', type: 'RETEST', dir: 'SHORT', entry: 75.55, stop: 75.76, t1: 75.17 },
    { sym: 'VOLTAS', type: 'RETEST', dir: 'LONG', entry: 1555.5, stop: 1539.5, t1: 1571.5 },
    { sym: 'COLPAL', type: 'RUNNER', dir: 'SHORT', entry: 2263.6, stop: 2279.1, t1: 2248.1 },
    { sym: 'TORNTPOWER', type: 'RETEST', dir: 'LONG', entry: 1580, stop: 1569.4, t1: 1590.6 },
    { sym: 'UNIONBANK', type: 'RETEST', dir: 'LONG', entry: 202.78, stop: 200.95, t1: 204.61 },
    { sym: 'PREMIERENE', type: 'RUNNER', dir: 'LONG', entry: 734.45, stop: 724.4, t1: 744.5 }
];

const targetDate = '2026-02-27';

console.log('FEB 27 AUDIT RESULTS');
console.log('====================');
console.log('Total signals: 12');
console.log('Signals with 1-min data: 0');
console.log('Signals WITHOUT 1-min data: 12');
console.log('');
console.log('Manual 30-min Verification for ' + targetDate + ':');

syms.forEach(s => {
    const p = path.join(cacheDir, s.sym + '_master.json');
    if (!fs.existsSync(p)) return;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const dayCandles = raw.filter(c => String(c.timestamp || c.date).split('T')[0] === targetDate).map(c => ({
        time: String(c.timestamp || c.date).split('T')[1].substring(0, 5),
        high: parseFloat(c.high),
        low: parseFloat(c.low)
    }));

    if (dayCandles.length === 0) return;

    let t1Hit = false;
    let stopHit = false;
    let t1Time = null;
    let stopTime = null;

    // start checking after 09:45 (the first 30 min candle is the OR)
    const evalCandles = dayCandles.filter(c => c.time > '09:45');

    for (let c of evalCandles) {
        if (s.dir === 'SHORT') {
            if (!stopHit && c.high >= s.stop) { stopHit = true; stopTime = c.time; }
            if (!t1Hit && c.low <= s.t1) { t1Hit = true; t1Time = c.time; }
        } else {
            if (!stopHit && c.low <= s.stop) { stopHit = true; stopTime = c.time; }
            if (!t1Hit && c.high >= s.t1) { t1Hit = true; t1Time = c.time; }
        }
        if (t1Hit && stopHit) break; // both hit in same or different candles
    }

    let outcome = 'UNKNOWN';
    if (t1Hit && !stopHit) outcome = 'T1_HIT (WINNER)';
    else if (stopHit && !t1Hit) outcome = 'STOP_HIT (LOSER)';
    else if (t1Hit && stopHit) {
        if (t1Time < stopTime) outcome = 'T1_HIT (WINNER)';
        else if (stopTime < t1Time) outcome = 'STOP_HIT (LOSER)';
        else outcome = 'BOTH IN SAME CANDLE';
    } else outcome = 'NO_DATA (EOD CLOSE)';

    console.log(`\n${s.sym} ${s.dir} ${s.type} | Entry: ${s.entry} | Stop: ${s.stop} | T1: ${s.t1}`);
    console.log(`  T1 Hit? ${t1Hit} (at ${t1Time})`);
    console.log(`  Stop Hit? ${stopHit} (at ${stopTime})`);
    console.log(`  -> Final 30-min Outcome: ${outcome}`);
});
