// scripts/mapping-diagnostics.js (ESM)
// Run from node in workspace: node scripts/mapping-diagnostics.js [path-to-cts_stocks.json]
// If no path provided, looks for ./cts_stocks.json
import fs from 'fs';
import path from 'path';
const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(process.cwd(), 'cts_stocks.json');
if (!fs.existsSync(target)) {
  console.error('No cts_stocks.json found in workspace. Browser localStorage is not accessible from Node.');
  console.error('Please export your localStorage cts_stocks to a file and pass its path to this script.');
  process.exit(2);
}
const raw = fs.readFileSync(target, 'utf8');
let list = [];
try { list = JSON.parse(raw); }
catch (e) {
  // attempt to extract the first JSON array substring (handles some browser export wrappers)
  try {
    const firstBracket = raw.indexOf('[');
    const lastBracket = raw.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const sub = raw.slice(firstBracket, lastBracket + 1);
      list = JSON.parse(sub);
    } else {
      // try to find all JSON objects and wrap them
      const objs = raw.match(/\{[\s\S]*?\}/g);
      if (objs && objs.length) {
        list = objs.map(s => JSON.parse(s));
      } else throw e;
    }
  } catch (e2) {
    console.error('Invalid JSON and failed to auto-extract array/object content:', e2);
    process.exit(2);
  }
}
// Implement same normalization rules here per requirement
function normalizeToken(raw) {
  return (raw||'').toString().trim().replace(/[–—−]/g,'-').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
}
const CANONICAL_MAP = {
  high_powered_stocks: 'HIGH_POWERED_STOCKS',
  highpoweredstocks: 'HIGH_POWERED_STOCKS',
  intraday_boost: 'INTRADAY_BOOST',
  intradayboost: 'INTRADAY_BOOST',
  pre_market: 'PRE_MARKET',
  premarket: 'PRE_MARKET',
  general: 'TOP_LEVEL_STOCKS'
};
const PREPOP_KEYS = new Set([
  'DOWNSIDE_LOM_INTRA','UPSIDE_LOM_INTRA','UPSIDE_LOM_SWING','DOWNSIDE_LOM_SWING','MULTI_SUPPORT_BO','MULTI_RESISTANCE_BO','NEAR_PREV_DAYS_LOW','NEAR_PREV_DAYS_HIGH','DAILY_CONTRACTION','PRE_MARKET',
  'SHORT_TERM_SWING_BO_UP','SHORT_TERM_SWING_BO_DOWN','LONG_TERM_SWING_BO_UP','LONG_TERM_SWING_BO_DOWN',
  'HIGH_POWERED_STOCKS','INTRADAY_BOOST','TOP_LEVEL_STOCKS','LOW_LEVEL_STOCKS','TOP_GAINERS','TOP_LOSERS'
]);
function mapToCanonical(raw) {
  const t = normalizeToken(raw);
  const compact = t.replace(/_/g,'');
  if (CANONICAL_MAP[compact]) return CANONICAL_MAP[compact];
  if (CANONICAL_MAP[t]) return CANONICAL_MAP[t];
  const tokenUpper = t.replace(/_/g,'_').toUpperCase();
  if (PREPOP_KEYS.has(tokenUpper)) return tokenUpper;
  const compactUpper = compact.toUpperCase();
  if (PREPOP_KEYS.has(compactUpper)) return compactUpper;
  return tokenUpper || 'UNMAPPED';
}
const unmapped = new Set();
const sample = [];
for (const it of list) {
  const rawCat = it.category || it.categoryRaw || '';
  const key = mapToCanonical(rawCat);
  if (!PREPOP_KEYS.has(key)) unmapped.add(rawCat);
  if (sample.length < 10) sample.push({ symbol: it.stockName, date: it.date, categoryRaw: rawCat, categoryKey: key, id: it.id || null, flags: { __pendingSync: !!it.__pendingSync, __pendingDelete: !!it.__pendingDelete } });
}
if (unmapped.size === 0) console.log('ALL_MAPPED'); else console.log('UNMAPPED:', Array.from(unmapped));
console.log(JSON.stringify(sample, null, 2));
