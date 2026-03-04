const fs = require('fs');
const path = require('path');
const ltSwingBoDown = require('../strategies/ltSwingBoDownLongStrategy.cjs');
const { calculateIntelligentStop, calculateTrailingStop } = require('../services/stopLossCalculator.cjs');

const MAX_HOLD_DAYS = 10;
const TRAIL_PCT = 0.03;
const TRAIL_ACTIVATION = 0.015;
const BREAKEVEN_PCT = 0.02;

const DATA_FILE = path.join(__dirname, '../results/deep_analysis_data.json'); // Reusing the same data file for now if it contains sufficient symbols

async function runVerification() {
    console.log('═'.repeat(70));
    console.log('  TESTING: LT_SWING_BO_DOWN');
    console.log('═'.repeat(70));

    const dataMap = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : {};
    const symbols = Object.keys(dataMap);
    const trades = [];

    for (const symbol of symbols) {
        const stockData = dataMap[symbol];
        if (!stockData.daily) continue;

        const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const addedDate = stockData.addedDate.split('T')[0];
        const signalIdx = daily.findIndex(c => c.timestamp.startsWith(addedDate));

        if (signalIdx === -1 || signalIdx < 50) continue; // LT requires more data

        let weekly = (stockData.weekly || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const signalTime = new Date(addedDate).getTime();
        const pastWeekly = weekly.filter(w => new Date(w.timestamp).getTime() <= signalTime);
        const pastDaily = daily.slice(0, signalIdx + 1);

        // Run V2 strategy logic
        const signal = await ltSwingBoDown.checkSignal(symbol, pastDaily, pastWeekly, []);
        if (!signal || signal.signal !== 'BUY') continue;

        const entryCandle = daily[signalIdx + 1];
        if (!entryCandle) continue;

        const entryPrice = entryCandle.open;

        const atrCalc = calculateIntelligentStop({
            entryPrice,
            candles: pastDaily,
            atrMultiplier: 2.0,
            swingLookback: 10,
            rrMultiple: 2.5
        });

        console.log('CHOLAFIN JS - atrCalc:', JSON.stringify(atrCalc));
        trades.push({
            symbol,
            entryPrice,
            stopPrice: atrCalc.stopPrice,
            targetPrice: atrCalc.targetPrice,
            tier: signal.tier,
            reason: signal.reason
        });
    }

    console.log(`Ran over ${symbols.length} symbols. Found ${trades.length} trades.`);
    fs.writeFileSync('lt_trades.json', JSON.stringify(trades, null, 2));
}

runVerification().catch(console.error);
