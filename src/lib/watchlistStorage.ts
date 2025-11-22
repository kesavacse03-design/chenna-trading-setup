import { WatchlistRow } from '../types/watchlist';
import { AssignedExample, BacktestResult, CategoryMetrics, StrategySnapshotV1 } from '../types';

const KEY = 'cts:watchlist:manual-import:v1';
const KEY_V1_SNAPSHOT = 'cts_v1_strategy_snapshots';
const KEY_ASSIGNED_EXAMPLES = 'cts_assigned_examples';
const KEY_BACKTEST_RESULTS = 'cts_backtest_results';
const KEY_CATEGORY_METRICS = 'cts_category_metrics';
const KEY_AUDIT_TRAIL = 'cts_audit_trail';

function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function writeJson<T>(key: string, value: T) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

export function saveWatchlist(rows: WatchlistRow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch (e) {
    console.error('saveWatchlist failed', e);
    throw e;
  }
}

export function loadWatchlist(): WatchlistRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistRow[];
    return parsed;
  } catch (e) {
    console.error('loadWatchlist failed', e);
    return [];
  }
}

export function clearWatchlist() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

// --- Strategy V1 snapshot ---
export function saveV1Snapshot(s: StrategySnapshotV1) {
  const map = readJson<Record<string, StrategySnapshotV1>>(KEY_V1_SNAPSHOT, {});
  if (map[s.categoryKey]?.immutable) return; // immutable once set
  map[s.categoryKey] = s;
  writeJson(KEY_V1_SNAPSHOT, map);
}
export function getV1Snapshot(categoryKey: string): StrategySnapshotV1 | null {
  const map = readJson<Record<string, StrategySnapshotV1>>(KEY_V1_SNAPSHOT, {});
  return map[categoryKey] || null;
}

// --- Assigned examples ---
export function listAssignedExamples(categoryKey: string): AssignedExample[] {
  const all = readJson<AssignedExample[]>(KEY_ASSIGNED_EXAMPLES, []);
  return all.filter(e => e.categoryKey === categoryKey);
}
export function addAssignedExamples(examples: AssignedExample[]) {
  const all = readJson<AssignedExample[]>(KEY_ASSIGNED_EXAMPLES, []);
  writeJson(KEY_ASSIGNED_EXAMPLES, [...examples, ...all]);
}

// --- Backtest results ---
export function saveBacktestResults(categoryKey: string, results: BacktestResult[]) {
  const all = readJson<Record<string, BacktestResult[]>>(KEY_BACKTEST_RESULTS, {});
  all[categoryKey] = results;
  writeJson(KEY_BACKTEST_RESULTS, all);
}
export function getBacktestResults(categoryKey: string): BacktestResult[] {
  const all = readJson<Record<string, BacktestResult[]>>(KEY_BACKTEST_RESULTS, {});
  return all[categoryKey] || [];
}

// --- Metrics ---
export function saveCategoryMetrics(m: CategoryMetrics) {
  const all = readJson<Record<string, CategoryMetrics>>(KEY_CATEGORY_METRICS, {});
  all[m.categoryKey] = m;
  writeJson(KEY_CATEGORY_METRICS, all);
}
export function getCategoryMetrics(categoryKey: string): CategoryMetrics | null {
  const all = readJson<Record<string, CategoryMetrics>>(KEY_CATEGORY_METRICS, {});
  return all[categoryKey] || null;
}

// --- Audit trail ---
export function appendAuditTrail(entry: any) {
  const list = readJson<any[]>(KEY_AUDIT_TRAIL, []);
  list.unshift(entry);
  writeJson(KEY_AUDIT_TRAIL, list.slice(0, 200));
}
