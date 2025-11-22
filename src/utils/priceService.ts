// Lightweight price service: batching, per-group intervals, caching, and simple queue
import * as api from '../api';

type PriceEntry = { price: number; ts: string };

const cache: Record<string, PriceEntry> = {};

// configuration
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// per-group state
const groups: Record<string, { intervalMs: number; symbols: Set<string>; enabled: boolean; timer?: any; failureCount?: number }> = {};

// simple queue to spread requests
const requestQueue: string[][] = [];
let running = false;

function enqueueBatch(symbols: string[]) {
  requestQueue.push(symbols);
  processQueue();
}

async function processQueue() {
  if (running) return;
  running = true;
  while (requestQueue.length) {
    const batch = requestQueue.shift()!;
    try {
      const res = await api.getPrices(batch);
      for (const s of Object.keys(res)) {
        cache[s] = { price: res[s].price, ts: res[s].timestamp } as PriceEntry;
      }
    } catch (e) {
      console.warn('[priceService] batch fetch failed', e);
    }
    // small delay between batches to avoid bursts
    await new Promise(r => setTimeout(r, 250));
  }
  running = false;
}

export function getCachedPrice(symbol: string): PriceEntry | null {
  return cache[symbol] || null;
}

export function registerGroup(groupKey: string, symbols: string[], intervalMs?: number) {
  if (!groups[groupKey]) groups[groupKey] = { intervalMs: intervalMs ?? DEFAULT_INTERVAL_MS, symbols: new Set(), enabled: true, failureCount: 0 };
  const g = groups[groupKey];
  for (const s of symbols) g.symbols.add(s);
  scheduleGroup(groupKey);
}

export function updateGroupSymbols(groupKey: string, symbols: string[]) {
  if (!groups[groupKey]) groups[groupKey] = { intervalMs: DEFAULT_INTERVAL_MS, symbols: new Set(), enabled: true, failureCount: 0 };
  groups[groupKey].symbols = new Set(symbols);
}

export function setGroupInterval(groupKey: string, intervalMs: number) {
  if (!groups[groupKey]) groups[groupKey] = { intervalMs, symbols: new Set(), enabled: true, failureCount: 0 };
  groups[groupKey].intervalMs = intervalMs;
  scheduleGroup(groupKey);
}

export function setGroupEnabled(groupKey: string, enabled: boolean) {
  if (!groups[groupKey]) groups[groupKey] = { intervalMs: DEFAULT_INTERVAL_MS, symbols: new Set(), enabled, failureCount: 0 };
  groups[groupKey].enabled = enabled;
  if (!enabled && groups[groupKey].timer) { clearTimeout(groups[groupKey].timer); groups[groupKey].timer = undefined; }
  if (enabled) scheduleGroup(groupKey);
}

function scheduleGroup(groupKey: string) {
  const g = groups[groupKey];
  if (!g || !g.enabled) return;
  if (g.timer) clearTimeout(g.timer);
  g.timer = setTimeout(async () => {
    // batch symbols and enqueue
    const syms = Array.from(g.symbols);
    if (syms.length) enqueueBatch(syms);
    scheduleGroup(groupKey);
  }, g.intervalMs ?? DEFAULT_INTERVAL_MS);
}

export function refreshGroupNow(groupKey: string) {
  const g = groups[groupKey];
  if (!g || !g.enabled) return;
  const syms = Array.from(g.symbols);
  if (syms.length) enqueueBatch(syms);
}

export function clearCache() { for (const k of Object.keys(cache)) delete cache[k]; }

export default { registerGroup, updateGroupSymbols, setGroupInterval, setGroupEnabled, refreshGroupNow, getCachedPrice, clearCache };
