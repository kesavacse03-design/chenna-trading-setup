// scripts/migrate-and-sync.js (ESM)
// Usage: node scripts/migrate-and-sync.js [path-to-cts_stocks.json]
import fs from 'fs';
import path from 'path';

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(process.cwd(), 'cts_stocks.json');
if (!fs.existsSync(target)) {
  console.error('No cts_stocks.json found at', target);
  process.exit(2);
}
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.resolve(path.dirname(target), `cts_stocks_backup_${ts}.json`);

const raw = fs.readFileSync(target, 'utf8');
let list = [];
try { list = JSON.parse(raw); }
catch (e) {
  // try to extract JSON array
  const first = raw.indexOf('[');
  const last = raw.lastIndexOf(']');
  if (first !== -1 && last !== -1 && last > first) {
    try { list = JSON.parse(raw.slice(first, last+1)); } catch (e2) { console.error('Cannot parse file'); process.exit(2); }
  } else { console.error('Cannot parse file'); process.exit(2); }
}
if (!Array.isArray(list)) { console.error('cts_stocks is not an array'); process.exit(2); }

// normalization and canonical mapping (same rules as app)
function normalizeToken(raw) {
  return (raw||'').toString().trim().replace(/[–—−]/g,'-').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
}
// canonical keys from constants (authoritative)
const PREPOP_KEYS = new Set([
  'DOWNSIDE_LOM_INTRA','UPSIDE_LOM_INTRA','UPSIDE_LOM_SWING','DOWNSIDE_LOM_SWING','MULTI_SUPPORT_BO','MULTI_RESISTANCE_BO','NEAR_PREV_DAYS_LOW','NEAR_PREV_DAYS_HIGH','DAILY_CONTRACTION','PRE_MARKET',
  'SHORT_TERM_SWING_BO_UP','SHORT_TERM_SWING_BO_DOWN','LONG_TERM_SWING_BO_UP','LONG_TERM_SWING_BO_DOWN',
  'HIGH_POWERED_STOCKS','INTRADAY_BOOST','TOP_LEVEL_STOCKS','LOW_LEVEL_STOCKS','TOP_GAINERS','TOP_LOSERS'
]);
const CANONICAL_MAP = {
  high_powered_stocks: 'HIGH_POWERED_STOCKS',
  highpoweredstocks: 'HIGH_POWERED_STOCKS',
  intraday_boost: 'INTRADAY_BOOST',
  intradayboost: 'INTRADAY_BOOST',
  pre_market: 'PRE_MARKET',
  premarket: 'PRE_MARKET',
  general: 'TOP_LEVEL_STOCKS',
  short_term_swing_bo_up: 'SHORT_TERM_SWING_BO_UP',
  short_term_swing_bo_down: 'SHORT_TERM_SWING_BO_DOWN',
  long_term_swing_bo_up: 'LONG_TERM_SWING_BO_UP',
  long_term_swing_bo_down: 'LONG_TERM_SWING_BO_DOWN'
};

function mapToCanonical(raw) {
  const t = normalizeToken(raw);
  const compact = t.replace(/_/g,'');
  if (CANONICAL_MAP[compact]) return CANONICAL_MAP[compact];
  if (CANONICAL_MAP[t]) return CANONICAL_MAP[t];
  const tokenUpper = t.toUpperCase();
  if (PREPOP_KEYS.has(tokenUpper)) return tokenUpper;
  const compactUpper = compact.toUpperCase();
  if (PREPOP_KEYS.has(compactUpper)) return compactUpper;
  return tokenUpper || 'UNMAPPED';
}

// backup original
fs.writeFileSync(backupPath, JSON.stringify(list, null, 2), 'utf8');

let migrated = 0;
for (let i=0;i<list.length;i++){
  const it = list[i];
  const rawCandidate = it.categoryRaw ?? it.category ?? it.rawCategory ?? '';
  const categoryRaw = rawCandidate || it.category || '';
  const categoryKey = mapToCanonical(categoryRaw);
  if (!it.categoryRaw) it.categoryRaw = categoryRaw;
  if (!it.categoryKey || it.categoryKey !== categoryKey) { it.categoryKey = categoryKey; migrated++; }
}

// write migrated
fs.writeFileSync(target, JSON.stringify(list, null, 2), 'utf8');
console.log(`[migrate] migrated=${migrated} total=${list.length} backup=${path.basename(backupPath)}`);

// simulate sync queue: mark pending items as synced by assigning an id if missing and clearing __pendingSync
let syncedCount = 0;
for (let i=0;i<list.length;i++){
  const it = list[i];
  if (it.__pendingSync) {
    if (!it.id) it.id = `local-${Date.now()}-${i}`;
    it.__pendingSync = false;
    syncedCount++;
  }
}
if (syncedCount>0) {
  fs.writeFileSync(target, JSON.stringify(list, null, 2), 'utf8');
  console.log(`[sync] simulated sync, items processed=${syncedCount}`);
}

// produce outputs
const unmappedSet = new Set();
const sample = [];
for (const it of list.slice(0,10)){
  const rawCandidate = it.categoryRaw ?? it.category ?? '';
  const key = it.categoryKey ?? mapToCanonical(rawCandidate);
  if (key === 'UNMAPPED') unmappedSet.add(rawCandidate);
  sample.push({ symbol: it.stockName ?? it.symbol ?? it.ticker ?? '', date: it.date ?? '', categoryRaw: rawCandidate, categoryKey: key, id: it.id ?? null, __pendingSync: !!it.__pendingSync, __pendingDelete: !!it.__pendingDelete });
}
if (unmappedSet.size===0) console.log('UNMAPPED: ALL_MAPPED'); else console.log('UNMAPPED: ' + JSON.stringify(Array.from(unmappedSet)));
console.log('SAMPLE: ' + JSON.stringify(sample));

// exit
process.exit(0);
