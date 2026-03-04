const fs = require('fs');
const targetDateStr = '2026-02-23';
const sym = 'INDUSINDBK';
const raw1 = JSON.parse(fs.readFileSync(`cache/1minute/${sym}_master.json`, 'utf8'));
const dayCandles = raw1.filter(c => String(c.timestamp || c.date).split('T')[0] === targetDateStr)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

let candles5m = [];
for (let ms = new Date(`${targetDateStr}T09:15:00+05:30`).getTime();
    ms <= new Date(`${targetDateStr}T15:25:00+05:30`).getTime();
    ms += 5 * 60 * 1000) {

    const bucket = dayCandles.filter(c => {
        const t = new Date(c.timestamp).getTime();
        return t >= ms && t < ms + (5 * 60 * 1000);
    });

    if (bucket.length > 0) {
        let bH = -Infinity, bL = Infinity, v = 0;
        bucket.forEach(c => {
            if (parseFloat(c.high) > bH) bH = parseFloat(c.high);
            if (parseFloat(c.low) < bL) bL = parseFloat(c.low);
            v += parseFloat(c.volume || 0);
        });
        const localD = new Date(ms + (5.5 * 60 * 60 * 1000));
        const timeStrIST = String(localD.getUTCHours()).padStart(2, '0') + ':' + String(localD.getUTCMinutes()).padStart(2, '0');
        candles5m.push({
            timeStr: timeStrIST,
            open: parseFloat(bucket[0].open),
            high: bH,
            low: bL,
            close: parseFloat(bucket[bucket.length - 1].close)
        });
    }
}

console.log("5-min candles for INDUS (09:15 - 10:15):");
candles5m.slice(0, 13).forEach(c => console.log(c.timeStr, 'H:', c.high, 'L:', c.low, 'C:', c.close, 'O:', c.open));

let orh = -Infinity, orl = Infinity;
for (let i = 0; i < 6; i++) {
    const c = candles5m[i];
    if (c.high > orh) orh = c.high;
    if (c.low < orl) orl = c.low;
}
console.log(`\nOR bounds (first 6 bars): High ${orh}, Low ${orl}`);

for (let i = 6; i < candles5m.length && i <= 33; i++) {
    const c = candles5m[i];
    if (c.close < orl) {
        console.log(`BREAKOUT SHORT at index ${i} (${c.timeStr}): close ${c.close} < ${orl}`);
        console.log(`Stop would be High of this candle: ${c.high} vs OR Low: ${orl} vs Pine Pine STOP 927.72`);
        break;
    }
}
