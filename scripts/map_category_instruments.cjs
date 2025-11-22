const fs = require('fs');
const path = require('path');

const SYMBOLS_FILE = path.join(__dirname, '../tmp/category_symbols.txt');
const OUTPUT_FILE = path.join(__dirname, '../tmp/category_instruments.json');
const MISSING_LOG = path.join(__dirname, '../tmp/missing_instruments.log');
const NSE_FILE = path.join(__dirname, '../.data/NSE.json/NSE.json');

async function main() {
    console.log('Reading symbols from:', SYMBOLS_FILE);
    if (!fs.existsSync(SYMBOLS_FILE)) {
        console.error('Symbols file not found');
        process.exit(1);
    }

    const content = fs.readFileSync(SYMBOLS_FILE, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const targetSymbols = new Set();

    // Parse "SYMBOL DATE" format
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 0) {
            targetSymbols.add(parts[0].toUpperCase());
        }
    }

    console.log(`Found ${targetSymbols.size} unique symbols to map.`);

    console.log('Loading instruments from:', NSE_FILE);
    if (!fs.existsSync(NSE_FILE)) {
        console.error('NSE instruments file not found at', NSE_FILE);
        process.exit(1);
    }

    let instruments = [];
    try {
        const fileContent = fs.readFileSync(NSE_FILE, 'utf8');
        instruments = JSON.parse(fileContent);
    } catch (e) {
        console.error('Failed to parse NSE.json:', e.message);
        process.exit(1);
    }

    const symbolMap = {}; // Symbol -> Instrument Key

    for (const instr of instruments) {
        // Check various fields for symbol
        const sym = (instr.trading_symbol || instr.tradingsymbol || instr.symbol || '').toUpperCase();
        const key = instr.instrument_key || instr.instrument_token || instr.key;

        if (sym && key && targetSymbols.has(sym)) {
            // Prefer NSE Equity if possible, or just take the first match
            if (!symbolMap[sym] || (instr.segment === 'NSE_EQ' || instr.exchange_token)) {
                symbolMap[sym] = key;
            }
        }
    }

    const result = {};
    const missing = [];

    for (const sym of targetSymbols) {
        if (symbolMap[sym]) {
            result[sym] = symbolMap[sym];
        } else {
            missing.push(sym);
        }
    }

    console.log(`Mapped ${Object.keys(result).length} symbols.`);
    console.log(`Missing ${missing.length} symbols.`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log('Wrote mappings to:', OUTPUT_FILE);

    if (missing.length > 0) {
        fs.writeFileSync(MISSING_LOG, missing.join('\n'));
        console.log('Wrote missing symbols to:', MISSING_LOG);
    } else {
        if (fs.existsSync(MISSING_LOG)) fs.unlinkSync(MISSING_LOG);
    }
}

main().catch(err => console.error(err));
