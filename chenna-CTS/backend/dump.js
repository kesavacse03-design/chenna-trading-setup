const fs = require('fs');
const dataMap = JSON.parse(fs.readFileSync('d:/chenna-trading-system-dashboard/chenna-CTS/backend/results/deep_analysis_data.json'));

let targetSym = Object.keys(dataMap).find(k => k.includes('CHOLA'));
if (!targetSym) {
    console.log("CHOLA NOT FOUND IN deep_analysis_data.json");
    targetSym = Object.keys(JSON.parse(fs.readFileSync('d:/chenna-trading-system-dashboard/chenna-CTS/backend/results/deep_analysis_st_up_data.json'))).find(k => k.includes('CHOLA'));
    if (!targetSym) process.exit(1);
    console.log("Found in UP_FILE:", targetSym);
} else {
    console.log("Found in DOWN_FILE:", targetSym);
}

const stockData = dataMap[targetSym];
const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
const addedDate = stockData.addedDate.split('T')[0];
const signalIdx = daily.findIndex(c => c.timestamp.startsWith(addedDate));
const pastDaily = daily.slice(0, signalIdx + 1);
const entryCandle = daily[signalIdx + 1];

const { calculateIntelligentStop } = require('d:/chenna-trading-system-dashboard/chenna-CTS/backend/services/stopLossCalculator.cjs');
const atrCalc = calculateIntelligentStop({
    entryPrice: entryCandle.open,
    candles: pastDaily,
    atrMultiplier: 2.0,
    swingLookback: 10,
    rrMultiple: 2.5
});

console.log("entryCandle.open:", entryCandle.open);
console.log("pastDaily last candle close:", pastDaily[pastDaily.length - 1].close);
console.log("ATR CALC:", JSON.stringify(atrCalc, null, 2));
