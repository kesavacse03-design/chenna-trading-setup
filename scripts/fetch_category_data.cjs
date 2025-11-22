const fs = require('fs');
const path = require('path');
const { UpstoxAdapter } = require('../backend/strategy/dataAdapter.cjs');

const INSTRUMENTS_FILE = path.join(__dirname, '../tmp/category_instruments.json');
const OUTPUT_DIR = path.join(__dirname, '../backend/strategy/input');
const CACHE_DIR = path.join(__dirname, '../backend/strategy/cache');
const MISSING_LOG = path.join(__dirname, '../tmp/missing_instruments.log');

// Ensure output dirs exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const BATCH_SIZE = 3;
const MAX_RETRIES = 2;
const PAUSE_BETWEEN_BATCHES_MS = 1500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(adapter, params, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await adapter.fetch(params);
            if (result && (Array.isArray(result) || (result.ok && result.data))) {
                return result;
            }
            // If result is explicitly not ok, throw to trigger retry
            throw new Error(result ? (result.error || 'Unknown error') : 'Empty result');
        } catch (e) {
            if (attempt === retries) throw e;
            const backoff = 1000 * Math.pow(2, attempt);
            console.log(`Retry ${attempt + 1}/${retries} for ${params.symbol} after ${backoff}ms...`);
            await sleep(backoff);
        }
    }
}

async function main() {
    if (!fs.existsSync(INSTRUMENTS_FILE)) {
        console.error('Instruments file not found:', INSTRUMENTS_FILE);
        process.exit(1);
    }

    const mappings = JSON.parse(fs.readFileSync(INSTRUMENTS_FILE, 'utf8'));
    const symbols = Object.keys(mappings);

    console.log(`Found ${symbols.length} symbols to fetch.`);

    const adapter = new UpstoxAdapter();

    // Date range: 2 years back
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 2);

    const toStr = toDate.toISOString().split('T')[0];
    const fromStr = fromDate.toISOString().split('T')[0];
    const interval = 'day';

    console.log(`Fetching data from ${fromStr} to ${toStr}`);

    const failedSymbols = [];
    let mappedCount = 0;

    // Batch processing
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)}: ${batch.join(', ')}`);

        const promises = batch.map(async (sym) => {
            const key = mappings[sym];
            try {
                const result = await fetchWithRetry(adapter, {
                    symbol: key,
                    from: fromStr,
                    to: toStr,
                    interval: interval
                });

                let candles;
                if (Array.isArray(result)) {
                    candles = result;
                } else if (result && result.ok && Array.isArray(result.data)) {
                    candles = result.data;
                } else if (result && result.data && Array.isArray(result.data.candles)) {
                    candles = result.data.candles;
                } else {
                    throw new Error('Invalid data format');
                }

                if (!Array.isArray(candles) || candles.length === 0) {
                    throw new Error('No candles returned');
                }

                // Normalize candles
                const normalizedCandles = candles.map(c => {
                    let date, open, high, low, close, volume;
                    if (Array.isArray(c)) {
                        [date, open, high, low, close, volume] = c;
                    } else {
                        ({ date, open, high, low, close, volume } = c);
                        date = date || c.timestamp;
                    }
                    return {
                        date: new Date(date).toISOString(),
                        open: Number(open),
                        high: Number(high),
                        low: Number(low),
                        close: Number(close),
                        volume: Number(volume)
                    };
                }).sort((a, b) => new Date(a.date) - new Date(b.date));

                // 1. Save CSV
                const csvRows = ['date,open,high,low,close,volume'];
                normalizedCandles.forEach(c => {
                    csvRows.push(`${c.date},${c.open},${c.high},${c.low},${c.close},${c.volume}`);
                });
                fs.writeFileSync(path.join(OUTPUT_DIR, `${sym}.csv`), csvRows.join('\n'));

                // 2. Save JSON Cache
                const cacheData = {
                    savedAt: new Date().toISOString(),
                    symbol: sym,
                    from: fromStr,
                    to: toStr,
                    interval: interval,
                    ohlcv: normalizedCandles
                };
                const cacheFilename = `${sym}_${fromStr}_${toStr}_${interval}.json`;
                fs.writeFileSync(path.join(CACHE_DIR, cacheFilename), JSON.stringify(cacheData, null, 2));

                console.log(`Saved ${sym}: ${normalizedCandles.length} rows`);
                mappedCount++;

            } catch (e) {
                console.error(`Failed ${sym}: ${e.message}`);
                failedSymbols.push(sym);
            }
        });

        await Promise.all(promises);

        if (i + BATCH_SIZE < symbols.length) {
            console.log(`Pausing for ${PAUSE_BETWEEN_BATCHES_MS}ms...`);
            await sleep(PAUSE_BETWEEN_BATCHES_MS);
        }
    }

    if (failedSymbols.length > 0) {
        fs.writeFileSync(MISSING_LOG, failedSymbols.join('\n'));
        console.log(`Failed symbols written to ${MISSING_LOG}`);
    }

    console.log('Fetch complete.');
    console.log(`Mapped: ${mappedCount}/${symbols.length}`);
    console.log(`Failed: ${failedSymbols.join(', ') || 'None'}`);
}

main().catch(console.error);
