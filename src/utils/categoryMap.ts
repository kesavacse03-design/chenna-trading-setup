// src/utils/categoryMap.ts
// Normalization and canonical mapping utilities for watchlist categories
// Utility: normalize and map category strings to canonical keys
import { CATEGORY_CANONICAL_MAP, PREPOPULATED_WATCHLIST } from '../constants';

// Build a set of canonical category keys from PREPOPULATED_WATCHLIST (these are the authoritative canonical keys)
const CANONICAL_KEYS: Set<string> = (() => {
  try {
    const keys: string[] = [];
    for (const p of Object.keys(PREPOPULATED_WATCHLIST || {})) {
      keys.push(...Object.keys((PREPOPULATED_WATCHLIST as any)[p] || {}));
    }
    return new Set(keys.map(k => k.toString()));
  } catch {
    return new Set();
  }
})();

// Normalization per requirements: trim, lowercase for keying, collapse non-alnum -> underscore, trim underscores
export function normalizeToken(raw: string): string {
  return (raw || '')
    .toString()
    .trim()
    // unify dash characters
    .replace(/[–—−]/g, '-')
    .toLowerCase()
    // replace any sequence of non-alphanumeric characters with a single underscore
    .replace(/[^a-z0-9]+/g, '_')
    // collapse multiple underscores
    .replace(/_+/g, '_')
    // trim leading/trailing underscores
    .replace(/^_+|_+$/g, '');
}

// Map an arbitrary raw string to a canonical key (one of PREPOPULATED_WATCHLIST keys) where possible.
export function mapToCanonical(raw: string): string {
  const token = normalizeToken(raw);
  const compact = token.replace(/_/g, '');
  // 1) explicit map for known variants (keys in CATEGORY_CANONICAL_MAP are normalized tokens -> canonicalKey)
  if (CATEGORY_CANONICAL_MAP[compact]) return CATEGORY_CANONICAL_MAP[compact];
  if (CATEGORY_CANONICAL_MAP[token]) return CATEGORY_CANONICAL_MAP[token];
  // 2) if token (transformed to uppercase underscore form) matches canonical key, return canonical
  // check both underscore and compact uppercase forms
  const tokenUpper = token.replace(/_/g, '_').toUpperCase();
  if (CANONICAL_KEYS.has(tokenUpper)) return tokenUpper;
  // 3) try compact uppercase
  const compactUpper = compact.toUpperCase();
  if (CANONICAL_KEYS.has(compactUpper)) return compactUpper;
  // 4) fallback: return tokenUpper as best-effort key
  return tokenUpper || 'UNMAPPED';
}

export function normalizeAndMapCategory(raw: string): { categoryKey: string; categoryRaw: string } {
  const categoryRaw = (raw || '').toString();
  const categoryKey = mapToCanonical(categoryRaw) || 'UNMAPPED';
  return { categoryKey, categoryRaw };
}

// Provide alias with the exact name requested by callers: mapToCanonicalKey
export const mapToCanonicalKey = mapToCanonical;

// Human-friendly canonical display titles for headers (derive from PREPOPULATED_WATCHLIST keys)
export const CANONICAL_DISPLAY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  try {
    for (const page of Object.keys(PREPOPULATED_WATCHLIST || {})) {
      const pageObj = (PREPOPULATED_WATCHLIST as any)[page] || {};
      for (const k of Object.keys(pageObj)) {
        // Convert underscore keys to spaced title-case-ish text
        out[k] = k.replace(/_/g, ' ');
      }
    }
  } catch (_) {}
  return out;
})();

// LocalStorage helpers and migration/attach utilities (single canonical place)
const LS_KEY = 'cts_stocks';

export function readLocalStocks(): any[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function writeLocalStocks(items: any[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch (e) { /* ignore */ }
}

export function resolveCategory(rawCategory?: string | null) {
  const raw = rawCategory ?? '';
  const normalized = normalizeToken(raw);
  const mappedKey = mapToCanonical(raw) || null;
  const display = mappedKey ? (CANONICAL_KEYS.has(mappedKey) ? mappedKey : mappedKey) : 'UNMAPPED';
  return { raw, normalized, mappedKey, display };
}

export function attachCategoryMetaToItem(item: any) {
  const rawCandidate = item.categoryRaw ?? item.category ?? item.rawCategory ?? '';
  const { mappedKey } = resolveCategory(rawCandidate);
  const out = { ...item };
  out.categoryRaw = rawCandidate || out.categoryRaw || out.category || '';
  if (mappedKey) out.categoryKey = mappedKey;
  return out;
}

export function migrateLocalStorageAddCategoryMeta() {
  const items = readLocalStocks();
  if (!items || !items.length) return { migrated: 0, items: [] };
  let migrated = 0;
  const out = items.map((it: any) => {
    const copy = { ...it };
    const rawCandidate = copy.categoryRaw ?? copy.category ?? copy.rawCategory ?? '';
    const res = resolveCategory(rawCandidate);
    const mappedKey = res.mappedKey;
    if (!copy.categoryRaw) copy.categoryRaw = rawCandidate || copy.category || '';
    // targeted fix: legacy TOP_LEVEL_STOCKS entries that were actually High Powered Stocks
    const norm = normalizeToken(rawCandidate);
    const looksHighPowered = (
      norm === 'high_powered_stocks' || norm === 'highpoweredstocks' ||
      norm === 'high_power_stocks' || norm === 'highpowerstocks' ||
      norm === 'high_powered_stock' || norm === 'highpoweredstock'
    );
    if (copy.categoryKey === 'TOP_LEVEL_STOCKS' && looksHighPowered) {
      copy.categoryKey = 'HIGH_POWERED_STOCKS';
      migrated++;
    } else if (!copy.categoryKey || copy.categoryKey !== mappedKey) {
      copy.categoryKey = mappedKey ?? copy.categoryKey;
      migrated++;
    }
    return copy;
  });
  writeLocalStocks(out);
  console.info('[categoryMap] migration done, migrated=', migrated, 'total=', out.length);
  return { migrated, items: out };
}

export function diagnosticMappingSummary(limit = 10) {
  const items = readLocalStocks();
  const sample = items.slice(0, limit).map((it: any) => {
    const rawCandidate = it.categoryRaw ?? it.category ?? '';
    const r = resolveCategory(rawCandidate);
    return { symbol: it.stockName ?? it.symbol ?? it.ticker ?? '', date: it.date ?? '', categoryRaw: rawCandidate, normalized: r.normalized, mappedKey: r.mappedKey ?? 'UNMAPPED', display: r.display ?? 'UNMAPPED', id: it.id ?? null, flags: { __pendingSync: !!it.__pendingSync, __pendingDelete: !!it.__pendingDelete } };
  });
  const unmapped = sample.filter(s => s.mappedKey === 'UNMAPPED').map(s => s.categoryRaw);
  return { sample, unmappedUnique: Array.from(new Set(unmapped)) };
}

// Trailing React useEffect fragments removed — file-level utilities only
