#!/usr/bin/env node
const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

// Config: edit list or pass via env
const API_BASE = process.env.CTS_API_BASE || 'http://localhost:3001';
const CASES = [
  { symbol: 'RELIANCE', from: '2025-10-30', to: '2025-10-30', interval: '5m' },
  { symbol: 'RELIANCE', from: '2025-10-31', to: '2025-10-31', interval: '5m' }
];

(async function main() {
  let failed = 0;
  for (const c of CASES) {
    const qs = `symbol=${encodeURIComponent(c.symbol)}&from=${encodeURIComponent(c.from)}&to=${encodeURIComponent(c.to)}&interval=${encodeURIComponent(c.interval)}&debug=1`;
    const url = `${API_BASE}/api/upstox/ohlcv?${qs}`;
    try {
      console.log(`Testing ${c.symbol} ${c.interval} ${c.from} -> ${c.to}`);
      const r = await fetch(url);
      const j = await r.json().catch(() => null);
      if (!j || j.ok !== true) {
        console.error('FAIL: endpoint returned non-ok', { status: r.status, body: j });
        failed++;
        continue;
      }
      if (!Array.isArray(j.data) || j.data.length === 0) {
        console.error('FAIL: empty data array', { _meta: j._meta });
        failed++;
        continue;
      }
      console.log(`OK: ${j.data.length} records (sample: ${JSON.stringify(j.data[0])})`);
    } catch (e) {
      console.error('ERROR', e && e.message);
      failed++;
    }
  }
  if (failed) {
    console.error(`SMOKE TEST FAILED: ${failed} failed cases`);
    process.exit(2);
  }
  console.log('SMOKE TEST PASSED');
  process.exit(0);
})();
