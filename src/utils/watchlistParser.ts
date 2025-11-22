interface ParsedRow {
    symbol: string;
    ltp: number | null;
    date: string | null;
}

export interface ParseResult {
    rows: ParsedRow[];
    errors: string[];
}

const SYMBOL_HEADERS = ['symbol', 'ticker', 'stock', 'stockname', 'instrument'];
const LTP_HEADERS = ['ltp', 'price', 'entry', 'lastprice'];
const DATE_HEADERS = ['date', 'entrydate', 'time'];

function cleanSymbol(raw: string): string {
    if (!raw) return '';
    return raw.trim().toUpperCase().replace(/\.NS$|-EQ$/, '');
}

export function parseWatchlist(textContent: string): ParseResult {
    const lines = textContent.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return { rows: [], errors: ['File is empty.'] };

    const uniqueRows = new Map<string, ParsedRow>();
    const errors: string[] = [];
    const delimiter = /[,;\t]/;
    
    const header = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    let symbolIndex = SYMBOL_HEADERS.reduce((acc, val) => header.indexOf(val) > -1 ? header.indexOf(val) : acc, -1);
    let ltpIndex = LTP_HEADERS.reduce((acc, val) => header.indexOf(val) > -1 ? header.indexOf(val) : acc, -1);
    let dateIndex = DATE_HEADERS.reduce((acc, val) => header.indexOf(val) > -1 ? header.indexOf(val) : acc, -1);

    const hasHeader = symbolIndex !== -1;
    if (!hasHeader) symbolIndex = 0; // Assume first column is symbol if no header

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const today = new Date().toISOString().slice(0, 10);

    for (const line of dataLines) {
        const parts = line.split(delimiter);
        const symbol = cleanSymbol(parts[symbolIndex]);
        if (!symbol) continue;

        const ltpRaw = ltpIndex > -1 ? parts[ltpIndex] : null;
        const ltp = ltpRaw ? parseFloat(ltpRaw.replace(/,/g, '')) : null;
        
        const dateRaw = dateIndex > -1 ? parts[dateIndex] : null;
        // Basic date validation/formatting
        const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : today;

        // Deduplicate by symbol, keeping the latest entry
        uniqueRows.set(symbol, { symbol, ltp: ltp, date: date });
    }

    if (uniqueRows.size === 0) {
        errors.push("No valid stock symbols could be extracted.");
    }

    return { rows: Array.from(uniqueRows.values()), errors };
}
