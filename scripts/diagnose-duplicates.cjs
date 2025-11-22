#!/usr/bin/env node
// Simulate Delete All -> reload -> re-import to check for phantom duplicates
// Uses root-level cts_stocks.json as the persisted store snapshot.

const fs = require('fs');
const path = require('path');

function readMirror() {
  const p = path.resolve(process.cwd(), 'cts_stocks.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function toKey(s) {
  return (s || '')
    .toString()
    .trim()
    .replace(/[–—−]/g, '-')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pickCategory(arr) {
  const counts = arr.reduce((acc, it) => {
    const k = it.categoryKey || toKey(it.category || it.categoryRaw || '');
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const preferred = ['INTRADAY_BOOST','SHORT_TERM_SWING_BO_UP','HIGH_POWERED_STOCKS','PRE_MARKET'];
  for (const p of preferred) if (counts[p] > 0) return p;
  // fallback to the most populated
  const all = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return all.length ? all[0][0] : null;
}

function snapshotSymbols(arr, catKey) {
  return arr
    .filter(it => (it.categoryKey || toKey(it.category || it.categoryRaw || '')) === catKey)
    .map(it => `${it.stockName || it.symbol}:${it.date}`)
    .sort();
}

function main() {
  const mirrorBefore = readMirror();
  const category = pickCategory(mirrorBefore);
  if (!category) {
    console.log('No categories found in mirror.');
    process.exit(0);
  }
  const beforeList = snapshotSymbols(mirrorBefore, category);

  // simulate Delete All -> remove from mirror
  const mirrorAfterDelete = mirrorBefore.filter(it => (it.categoryKey || toKey(it.category || it.categoryRaw || '')) !== category);
  const afterDeleteList = snapshotSymbols(mirrorAfterDelete, category);

  // re-import same list (should produce no duplicates if delete was permanent)
  const attempted = beforeList.map(s => {
    const [sym,date] = s.split(':');
    return { symbol: sym, date, categoryKey: category };
  });
  const dupes = attempted.filter(r => mirrorAfterDelete.some(it => (it.stockName === r.symbol) && ((it.date||'') === (r.date||'')) && ((it.categoryKey || toKey(it.category || it.categoryRaw || '')) === category)));

  console.log('CATEGORY=', category);
  console.log('BEFORE_DELETE=', { count: beforeList.length, items: beforeList.slice(0,10) });
  console.log('AFTER_DELETE=', { count: afterDeleteList.length, items: afterDeleteList.slice(0,10) });
  console.log('AFTER_REIMPORT_DUPES=', { count: dupes.length, items: dupes.slice(0,10).map(d=>`${d.symbol}:${d.date}`) });
}

main();
