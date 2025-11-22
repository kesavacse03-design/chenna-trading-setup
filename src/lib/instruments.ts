// Helper to load instrument master from backend API

export type Instrument = {
  symbol: string;
  tradingSymbol?: string;
  name?: string;
  exchange?: string;
  segment?: string;
  instrumentKey?: string;
  instrumentType?: string;
  isin?: string;
  lotSize?: number;
  tickSize?: number;
  sector?: string;
  isActive?: boolean;
};

let cachedInstruments: Instrument[] = [];
let lastFetch = 0;
const CACHE_DURATION = 3600000; // 1 hour
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Load instruments from backend API
 */
export async function loadInstruments(): Promise<Instrument[]> {
  try {
    // Return cached if still fresh
    if (cachedInstruments.length > 0 && Date.now() - lastFetch < CACHE_DURATION) {
      return cachedInstruments;
    }

    // Fetch all active instruments from backend
    const res = await fetch(`${API_BASE}/api/instruments/search?q=&limit=10000`);
    if (!res.ok) {
      console.error('[Instruments] API fetch failed:', res.statusText);
      return cachedInstruments; // Return stale cache
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      cachedInstruments = data;
      lastFetch = Date.now();
      console.log(`[Instruments] Loaded ${data.length} instruments from API`);
      return data;
    }

    console.warn('[Instruments] API response not an array');
    return cachedInstruments;
  } catch (error) {
    console.error('[Instruments] Failed to load instruments from API:', error);
    return cachedInstruments; // Return stale cache on error
  }
}

/**
 * Search for instruments by query
 */
export async function searchInstruments(query: string, limit = 20): Promise<Instrument[]> {
  try {
    const res = await fetch(`${API_BASE}/api/instruments/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function suggestSymbols(query: string, list: Instrument[], max = 8) {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  // Strict primary equity: letters-only, length <= 12
  const isPrimary = (s: string) => /^[A-Z]{1,12}$/.test(s);
  const excludeTokens = ['FUT', 'PE', 'CE', 'OPT', 'ETF', 'FUND', 'MF', 'NFO', 'IDX', 'DX', 'OIL', 'STK', 'AUT'];
  const isNoisy = (s: string, name?: string) => {
    const combined = (s + ' ' + (name || '')).toUpperCase();
    for (const t of excludeTokens) if (combined.includes(t)) return true;
    return false;
  };

  // Build map of symbol -> best instrument (prefer NSE)
  const best = new Map<string, Instrument>();
  for (const it of list) {
    const sym = it.symbol;
    if (!isPrimary(sym)) continue;
    if (isNoisy(sym, it.name)) continue;
    const exch = (it.exchange || '').toUpperCase();
    if (exch !== 'NSE' && exch !== 'BSE') continue;
    const existing = best.get(sym);
    if (!existing) best.set(sym, it);
    else {
      if ((existing.exchange || '').toUpperCase() !== 'NSE' && (it.exchange || '').toUpperCase() === 'NSE') {
        best.set(sym, it);
      }
    }
  }
  const candidates = Array.from(best.values());

  // helper levenshtein
  function levenshtein(a: string, b: string) {
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    const dp: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
    for (let i = 0; i <= al; i++) dp[i][0] = i;
    for (let j = 0; j <= bl; j++) dp[0][j] = j;
    for (let i = 1; i <= al; i++) {
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[al][bl];
  }

  const symbolPrefix: Instrument[] = [];
  const namePrefix: Instrument[] = [];
  const fuzzy: { it: Instrument; score: number }[] = [];

  for (const it of candidates) {
    const sym = it.symbol;
    const nameUp = (it.name || '').toUpperCase();
    if (sym === q || sym.startsWith(q)) { symbolPrefix.push(it); continue; }
    if (nameUp.startsWith(q)) { namePrefix.push(it); continue; }
    const score = levenshtein(q, sym);
    if (score <= 2) fuzzy.push({ it, score });
  }

  symbolPrefix.sort((a, b) => { if (a.symbol === q) return -1; if (b.symbol === q) return 1; return b.symbol.length - a.symbol.length; });
  namePrefix.sort((a, b) => a.symbol.localeCompare(b.symbol));
  fuzzy.sort((x, y) => x.score - y.score || x.it.symbol.localeCompare(y.it.symbol));

  const ordered = [...symbolPrefix, ...namePrefix, ...fuzzy.map(f => f.it)];
  return ordered.slice(0, Math.max(0, Math.min(max, 8)));
}

export function suggestBuckets(query: string, list: Instrument[], max = 8) {
  const q = query.trim().toUpperCase();
  if (!q) return { symbolPrefix: [], namePrefix: [], fuzzy: [] };

  const isPrimary = (s: string) => /^[A-Z]{1,12}$/.test(s);
  const excludeTokens = ['FUT', 'PE', 'CE', 'OPT', 'ETF', 'AUTO', 'FUND', 'MF', 'NFO', 'IDX', 'DX', 'OIL', 'STK'];
  const isNoisy = (s: string, name?: string) => {
    const combined = (s + ' ' + (name || '')).toUpperCase();
    for (const t of excludeTokens) if (combined.includes(t)) return true;
    return false;
  };
  const best = new Map<string, Instrument>();
  for (const it of list) {
    const sym = it.symbol;
    const exch = (it.exchange || '').toUpperCase();
    if (!isPrimary(sym)) continue;
    if (isNoisy(sym, it.name)) continue;
    if (exch !== 'NSE' && exch !== 'BSE') continue;
    const existing = best.get(sym);
    if (!existing) best.set(sym, it);
    else if ((existing.exchange || '').toUpperCase() !== ' NSE' && (it.exchange || '').toUpperCase() === 'NSE') best.set(sym, it);
  }
  const candidates = Array.from(best.values());
  function levenshtein(a: string, b: string) {
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    const dp: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
    for (let i = 0; i <= al; i++) dp[i][0] = i;
    for (let j = 0; j <= bl; j++) dp[0][j] = j;
    for (let i = 1; i <= al; i++) {
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[al][bl];
  }
  const symbolPrefix: Instrument[] = [];
  const namePrefix: Instrument[] = [];
  const fuzzy: { it: Instrument; score: number }[] = [];
  for (const it of candidates) {
    const sym = it.symbol;
    const nameUp = (it.name || '').toUpperCase();
    if (sym === q || sym.startsWith(q)) { symbolPrefix.push(it); continue; }
    if (nameUp.startsWith(q)) { namePrefix.push(it); continue; }
    const score = levenshtein(q, sym);
    if (score <= 2) fuzzy.push({ it, score });
  }
  symbolPrefix.sort((a, b) => { if (a.symbol === q) return -1; if (b.symbol === q) return 1; return b.symbol.length - a.symbol.length; });
  namePrefix.sort((a, b) => a.symbol.localeCompare(b.symbol));
  fuzzy.sort((x, y) => x.score - y.score || x.it.symbol.localeCompare(y.it.symbol));
  return { symbolPrefix: symbolPrefix.slice(0, max), namePrefix: namePrefix.slice(0, max), fuzzy: fuzzy.map(f => f.it).slice(0, max) };
}
