const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.join(__dirname, '../backend/strategy/input');
const CACHE_DIR = path.join(__dirname, '../backend/strategy/cache');

// Ensure cache dir exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Date range: 2 years back to now
const toDate = new Date();
const fromDate = new Date();
fromDate.setFullYear(fromDate.getFullYear() - 2);
const toStr = toDate.toISOString().split('T')[0];
const fromStr = fromDate.toISOString().split('T')[0];
const interval = 'day';

function csvToCache(csvPath, symbol) {
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.trim().split('\n');

    // Skip header
    const dataLines = lines.slice(1);

    const ohlcv = dataLines.map(line => {
        const [date, open, high, low, close, volume] = line.split(',');
        return {
            date: date.trim(),
            open: parseFloat(open),
            high: parseFloat(high),
            low: parseFloat(low),
            close: parseFloat(close),
            volume: parseInt(volume) || 0
        };
    }).filter(c => !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close));

    const cacheData = {
        savedAt: new Date().toISOString(),
        symbol: symbol,
        from: fromStr,
        to: toStr,
        interval: interval,
        ohlcv: ohlcv
    };

    // Cache filename format: SYMBOL_FROM_TO_INTERVAL.json
    const cacheFilename = `${symbol}_${fromStr}_${toStr}_${interval}.json`;
    const cachePath = path.join(CACHE_DIR, cacheFilename);

    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
    console.log(`Converted ${symbol}: ${ohlcv.length} candles -> ${cachePath}`);
}

// Convert all CSV files
const csvFiles = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.csv'));

console.log(`Found ${csvFiles.length} CSV files to convert.`);

for (const csvFile of csvFiles) {
    const symbol = path.basename(csvFile, '.csv');
    const csvPath = path.join(INPUT_DIR, csvFile);
    csvToCache(csvPath, symbol);
}

console.log('Conversion complete!');
