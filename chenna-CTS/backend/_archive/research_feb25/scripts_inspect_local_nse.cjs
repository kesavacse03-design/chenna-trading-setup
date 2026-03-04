const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../../NSE.json'); // Adjust path to root

console.log(`Reading ${filePath}...`);

try {
    // Read first 1MB just to get a sample, or stream it. 
    // JSON parse might fail on partial data, so let's try to read whole file if size permits.
    // NSE.json is usually 20-50MB. Safe to read in Node.
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(rawData);

    console.log(`Total items: ${data.length}`);

    // Find RELIANCE
    const reliance = data.find(d => d.trading_symbol === 'RELIANCE' && d.instrument_type === 'EQ');

    if (reliance) {
        console.log('Found RELIANCE:');
        console.log(JSON.stringify(reliance, null, 2));
    } else {
        console.log('RELIANCE not found.');
    }

} catch (e) {
    console.error('Error:', e.message);
}
