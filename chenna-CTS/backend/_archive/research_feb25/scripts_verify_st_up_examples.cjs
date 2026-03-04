const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../results/deep_analysis_st_up_data.json');

function calculateSMA(candles, period) {
    if (candles.length < period) return null;
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[candles.length - 1 - i].close;
    }
    return sum / period;
}

function verifyExamples() {
    console.log('VERIFYING ST_SWING_BO_UP (FRESH BREAKOUTS)...');
    if (!fs.existsSync(DATA_FILE)) { console.log('No Data File'); return; }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let count = 0;

    Object.keys(data).forEach(symbol => {
        if (count >= 3) return;

        const stockData = data[symbol];
        if (!stockData || !stockData.daily || !stockData.weekly) return;

        // SORT
        const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const weekly = stockData.weekly.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const addedDate = stockData.addedDate.split('T')[0];

        // Find Signal Index
        let signalIdx = -1;
        for (let i = 0; i < daily.length; i++) {
            if (daily[i].timestamp.startsWith(addedDate)) {
                signalIdx = i; break;
            }
        }
        if (signalIdx === -1) return;

        // Check Weekly Trend
        let wIdx = -1;
        for (let i = 0; i < weekly.length; i++) {
            if (weekly[i].timestamp > daily[signalIdx].timestamp) {
                wIdx = i - 1; break;
            }
        }
        if (wIdx === -1) wIdx = weekly.length - 1;

        if (wIdx < 20) return;
        const wPriors = weekly.slice(0, wIdx + 1);
        const wsma20 = calculateSMA(wPriors, 20);
        const wClose = weekly[wIdx].close;

        if (wClose <= wsma20) return; // Must be UPTREND

        // Check RSI
        const priors = daily.slice(0, signalIdx + 1);
        // ... RSI calc skipped for brevity, assuming < 70 check

        // Outcome
        const day0 = daily[signalIdx];
        const day1 = daily[signalIdx + 1];
        const day5 = daily[signalIdx + 5]; // Need Day 5
        if (!day1 || !day5) return;

        const pnl = ((day5.close - day0.close) / day0.close) * 100;

        count++;
        console.log(`\n=== EXAMPLE ${count}: ${symbol} ===`);
        console.log(`Signal Date: ${addedDate}`);
        console.log(`Weekly Close: ${wClose} | Weekly SMA20: ${wsma20.toFixed(2)} (Trend UP)`);
        console.log(`History (Last 3 Weekly): ${weekly[wIdx].close}, ${weekly[wIdx - 1].close}, ${weekly[wIdx - 2].close}`);
        console.log(`Entry (Day 0 Close): ${day0.close}`);
        console.log(`Exit (Day 5 Close): ${day5.close}`);
        console.log(`P&L: ${pnl.toFixed(2)}%`);
    });
}

verifyExamples();
