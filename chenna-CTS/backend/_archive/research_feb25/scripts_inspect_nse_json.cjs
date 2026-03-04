const fs = require('fs');
const path = require('path');

const NSE_FILE_PATH = path.resolve(__dirname, '../../../NSE (4).json/NSE (4).json');
console.log(`Reading ${NSE_FILE_PATH}...`);

const rawData = fs.readFileSync(NSE_FILE_PATH, 'utf-8');
const instruments = JSON.parse(rawData);

const kotak = instruments.find(i => i.trading_symbol === 'KOTAKBANK');
if (kotak) {
    console.log('Found KOTAKBANK:', kotak);
} else {
    console.log('KOTAKBANK not found in NSE.json');
    // Search for partial match
    const partial = instruments.find(i => i.trading_symbol.includes('KOTAK'));
    if (partial) {
        console.log('Found partial KOTAK:', partial);
    }
}
