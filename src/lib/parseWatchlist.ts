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

export default parseWatchlist;
