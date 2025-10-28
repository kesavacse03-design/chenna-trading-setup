export function normalizeSymbol(input: string): string {
  if (!input) return '';
  // Uppercase, remove spaces and non-alphanumeric (allow dot and dash)
  return input.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
}

/**
 * validateSymbol checks localStorage for key 'CTS_INSTRUMENTS'.
 * The stored value is expected to be JSON array of objects with a `symbol` property.
 */
export function validateSymbol(symbol: string): boolean {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('CTS_INSTRUMENTS') : null;
    if (!raw) return false;
    const instruments = JSON.parse(raw);
    if (!Array.isArray(instruments)) return false;
    const norm = normalizeSymbol(symbol);
    return instruments.some((it: any) => {
      if (!it) return false;
      const s = (it.symbol || it.trading_symbol || it.ticker || '').toString();
      return normalizeSymbol(s) === norm;
    });
  } catch (e) {
    return false;
  }
}
export type ParsedEntry = {
  symbol: string;
  date?: string;
  category: string;
  raw: string;
};

/**
 * Parse watchlist plain text into structured entries.
 * Expected format:
 * # CATEGORY_NAME
 * SYMBOL DATE
 *
 */
export function parseWatchlist(text: string): ParsedEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: ParsedEntry[] = [];
  let currentCategory = 'UNSPECIFIED';

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      // category header
      currentCategory = line.replace(/^#+\s*/, '').trim();
      continue;
    }

    // expect: SYMBOL [date_or_id]
    const parts = line.split(/\s+/);
    if (parts.length === 0) continue;
    const symbol = parts[0].toUpperCase();
    const date = parts.length > 1 ? parts.slice(1).join(' ') : undefined;

    entries.push({ symbol, date, category: currentCategory, raw: rawLine });
  }

  return entries;
}

