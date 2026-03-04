const fs = require('fs');
const path = require('path');
const { calculateIntelligentStop } = require('../services/stopLossCalculator.cjs');

async function test() {
    const DATA_FILE = path.join(__dirname, '../results/deep_analysis_data.json');
    const dataMap = JSON.parse(fs.readFileSync(DATA_FILE));

    // Find the symbol that actually generated a trade
    let targetTrade = null;
    let targetSymbol = '';

    for (const sym of Object.keys(dataMap)) {
        const stockData = dataMap[sym];
        if (!stockData || !stockData.daily) continue;

        const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const addedDate = stockData.addedDate.split('T')[0];
        const signalIdx = daily.findIndex(c => c.timestamp.startsWith(addedDate));

        if (signalIdx < 50 || signalIdx === -1) continue;

        const entryPrice = daily[signalIdx + 1].open;
        const pastDaily = daily.slice(0, signalIdx + 1);

        const atrCalc = calculateIntelligentStop({
            entryPrice,
            candles: pastDaily,
            atrMultiplier: 2.0,
            swingLookback: 10,
            rrMultiple: 2.5
        });

        if (atrCalc.stopPrice > entryPrice) {
            targetTrade = pastDaily;
            targetSymbol = sym;

            fs.writeFileSync('chola_debug.json', JSON.stringify({
                symbol: sym,
                entryPrice,
                signalDay: pastDaily[pastDaily.length - 1],
                atrCalc
            }, null, 2));
            console.log(`Found buggy stop for ${sym}. Dumped. ${atrCalc.stopPrice} > ${entryPrice}`);
            return;
        }
    }
}
test().catch(console.error);
