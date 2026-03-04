const fs = require('fs');
const path = require('path');

const targetDate = '2026-02-23';
const symbols = ['INDUSINDBK', 'HAL'];

console.log(`=== OR Granularity Audit (${targetDate}) ===\n`);

symbols.forEach(sym => {
    console.log(`\n================= ${sym} =================`);
    const p1 = path.join(__dirname, 'cache', '1minute', `${sym}_master.json`);
    if (!fs.existsSync(p1)) {
        console.log(`No 1-min cache found for ${sym}`);
        return;
    }

    const raw1 = JSON.parse(fs.readFileSync(p1, 'utf8'));
    const dayCandles = raw1.filter(c => {
        const d = String(c.timestamp || c.date).split('T')[0];
        return d === targetDate;
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Extract 09:15 to 09:44 for the OR calculation
    const orCandles1m = dayCandles.filter(c => {
        const t = String(c.timestamp || c.date).split('T')[1].substring(0, 5);
        return t >= '09:15' && t < '09:45';
    });

    if (orCandles1m.length === 0) {
        console.log(`No 1-min OR candles found for ${sym}`);
        return;
    }

    // Calculate 30-min OR High/Low (aggregation of 09:15 to 09:44)
    let orHigh30m = -Infinity;
    let orLow30m = Infinity;
    for (const c of orCandles1m) {
        if (parseFloat(c.high) > orHigh30m) orHigh30m = parseFloat(c.high);
        if (parseFloat(c.low) < orLow30m) orLow30m = parseFloat(c.low);
    }

    console.log(`[30-Min OR] (9:15 - 9:45) -> High: ${orHigh30m}, Low: ${orLow30m}`);

    // Calculate 5-min OR High/Low (Pine Script behavior)
    // In Pine on a 5-min chart, the OR runs from 09:15 to 09:45 (6 bars)
    // The bars are 09:15, 09:20, 09:25, 09:30, 09:35, 09:40
    console.log(`\n[5-Min Candles inside OR window]:`);
    const bars5m = [];
    for (let currentMs = new Date(`${targetDate}T09:15:00+05:30`).getTime();
        currentMs < new Date(`${targetDate}T09:45:00+05:30`).getTime();
        currentMs += 5 * 60 * 1000) {
        const c1mForBar = orCandles1m.filter(c => {
            const timeMs = new Date(c.timestamp).getTime();
            return timeMs >= currentMs && timeMs < currentMs + (5 * 60 * 1000);
        });

        if (c1mForBar.length > 0) {
            let bHigh = -Infinity, bLow = Infinity;
            c1mForBar.forEach(c => {
                if (parseFloat(c.high) > bHigh) bHigh = parseFloat(c.high);
                if (parseFloat(c.low) < bLow) bLow = parseFloat(c.low);
            });
            const d = new Date(currentMs);
            const timeLabel = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; // simple HH:mm UTC, shift back since timestamp is already parsed
            // Use ISO string to get Local time manually
            const timeStrIST = new Date(currentMs).toISOString().split('T')[1].substring(0, 5);
            bars5m.push({ time: timeStrIST, high: bHigh, low: bLow });
            console.log(`  ${timeStrIST}: High=${bHigh}, Low=${bLow}`);
        }
    }

    // The OR bounds using 5-min candles are aggregated exactly the same way as 1-min, 
    // EXCEPT that Pine script's high/low might use High/Low differently on charting vs raw data 
    // Or perhaps Pine uses 9:15 to 9:45 "bar close" meaning up to 9:50? Pine scripts on 5-min run exactly until 09:45 bar resolves.

    // Let's print the Pine Target Values:
    if (sym === 'INDUSINDBK') {
        console.log(`\nTarget Pine RETEST SHORT Entry = 923.1`);
        console.log(`Target Pine Stop = 927.72`);
    } else if (sym === 'HAL') {
        console.log(`\nTarget Pine RUNNER SHORT Entry = 4050`);
        console.log(`Target Pine Stop = 4071.5`);
    }

    // Also fetch the true 30-min cache single candle to compare
    const p30 = path.join(__dirname, 'cache', '30minute', `${sym}_master.json`);
    if (fs.existsSync(p30)) {
        const raw30 = JSON.parse(fs.readFileSync(p30, 'utf8'));
        const orCandle30m = raw30.find(c => {
            const dt = String(c.timestamp || c.date).split('T');
            return dt[0] === targetDate && dt[1].startsWith('09:15');
        });
        if (orCandle30m) {
            console.log(`\n[Actual 30-min cache used by CTS]: High=${orCandle30m.high}, Low=${orCandle30m.low}`);
        }
    }
});
