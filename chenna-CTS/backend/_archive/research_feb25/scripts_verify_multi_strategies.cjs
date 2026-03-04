const path = require('path');
const fs = require('fs');

const multiResStrategy = require('../strategies/multiResistanceBoStrategy.cjs');
const multiSupStrategy = require('../strategies/multiSupportBoLongStrategy.cjs');

const RES_DATA = path.join(__dirname, '..', 'results', 'multi_res_data.json');
const SUP_DATA = path.join(__dirname, '..', 'results', 'multi_sup_data.json');

async function testStrategy(name, strategy, dataFile) {
    console.log(`\nTesting ${name}...`);
    if (!fs.existsSync(dataFile)) {
        console.log(`Data file not found: ${dataFile}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const symbols = Object.keys(data);
    let trades = 0;
    let skips = 0;

    for (const symbol of symbols) {
        const stock = data[symbol]; // stock object

        // Data prep (Sort!)
        const daily = (stock.daily || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const weekly = (stock.weekly || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const nifty = (stock.nifty || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Signal Idx
        const signalDateStr = new Date(stock.addedDate).toISOString().split('T')[0];
        const signalIdx = daily.findIndex(c => c.timestamp.startsWith(signalDateStr));
        if (signalIdx === -1 || signalIdx < 20) continue;

        const pastDaily = daily.slice(0, signalIdx + 1);

        // Run Strategy
        const output = await strategy.checkSignal({ symbol }, pastDaily, weekly, nifty);

        if (output) {
            if (output.signal === 'BUY') {
                trades++;
                console.log(`  [BUY] ${symbol}: ${output.reason}`);
            } else {
                skips++;
                console.log(`  [SKIP] ${symbol}: ${output.reason}`);
            }
        } else {
            // console.log(`  [NULL] ${symbol}`);
        }
    }
    console.log(`Result: ${trades} Buys, ${skips} Skips out of ${symbols.length} stocks.`);
}

async function main() {
    await testStrategy('MULTI_RESISTANCE_BO', multiResStrategy, RES_DATA);
    await testStrategy('MULTI_SUPPORT_BO', multiSupStrategy, SUP_DATA);
}

main().catch(console.error);
