const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../results/deep_analysis_st_up_data.json');

function calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;
    let gains = 0, losses = 0;
    // Log for debug if needed
    // Calculate RSI step by step
    for (let i = 1; i <= period; i++) {
        const change = candles[candles.length - i].close - candles[candles.length - i - 1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + (avgGain / avgLoss)));
}

function calculateSMA(candles, period) {
    if (candles.length < period) return null;
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[candles.length - 1 - i].close;
    }
    return sum / period;
}

const targets = ['MARUTI', 'MOTHERSON', 'ULTRACEMCO', 'DALBHARAT', 'TATASTEEL']; // Pick some known ones

function verify() {
    console.log('VERIFYING ST_SWING_BO_UP DATA...');
    if (!fs.existsSync(DATA_FILE)) { console.log('No Data File'); return; }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    // Check MARUTI first specifically
    const checkList = Object.keys(data).filter(s => targets.includes(s) || s === 'MARUTI').slice(0, 5);
    // If targets not in file, just pick first 5
    if (checkList.length === 0) checkList.push(...Object.keys(data).slice(0, 5));

    checkList.forEach(symbol => {
        const stockData = data[symbol];
        if (!stockData || !stockData.daily) return;

        // SORT
        const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const addedDate = stockData.addedDate.split('T')[0];

        let idx = -1;
        for (let i = 0; i < daily.length; i++) {
            if (daily[i].timestamp.startsWith(addedDate)) {
                idx = i; break;
            }
        }
        if (idx === -1) { console.log(`${symbol}: Signal Date ${addedDate} NOT FOUND`); return; }

        const day0 = daily[idx];
        const priors = daily.slice(0, idx + 1);

        const sma50 = calculateSMA(priors, 50);
        const rsi = calculateRSI(priors, 14);

        console.log(`\n=== ${symbol} ===`);
        console.log(`Signal Date: ${addedDate}`);
        console.log(`Close: ${day0.close}`);
        console.log(`SMA50: ${sma50 ? sma50.toFixed(2) : 'N/A'}`);
        console.log(`Trend: ${day0.close > sma50 ? 'UP' : 'DOWN'}`);
        console.log(`RSI(14): ${rsi.toFixed(2)}`);

        // Show last 14 changes for RSI verification
        if (symbol === 'MARUTI') {
            console.log('MARUTI Last 14 Changes:');
            for (let k = 14; k >= 1; k--) {
                const c = priors[priors.length - k];
                const prev = priors[priors.length - k - 1];
                if (prev) {
                    const chg = c.close - prev.close;
                    console.log(`  ${c.timestamp.split('T')[0]}: ${c.close} (Chg: ${chg.toFixed(2)})`);
                }
            }
        }
    });
}

verify();
