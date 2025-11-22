#!/usr/bin/env node
// Simple backend-only smoke test for /api/optimize/composite
const path = require('path');
if (typeof fetch !== 'function') {
  try { global.fetch = require('node-fetch'); } catch (e) {}
}
const fetchFn = global.fetch;
if (typeof fetchFn !== 'function') {
  console.error('fetch not available. Install node 18+ or node-fetch.');
  process.exit(2);
}
(async function(){
  try {
    const apiBase = process.env.CTS_API_BASE || 'http://127.0.0.1:3001';
    const url = apiBase.replace(/\/$/, '') + '/api/optimize/composite';
    console.log('[smoke] POST', url);
    const payload = {
      symbols: ['MOCK_A','MOCK_B'],
      from: '2025-11-01',
      to: '2025-11-15',
      interval: 'day',
      mode: 'mock',
      categoryKey: 'SMOKE_TEST',
      pool: { ema_short: [5,8], ema_long: [34,50], rsi_period: [14], rsi_min: [20], rsi_max: [80] },
      limits: { maxCombos: 20, parallel: 2, timeoutSec: 60 },
      threshold: { minAccuracyPct: 0, minExpectancy: -999, maxDrawdown: 999999 },
      autoPersist: false
    };
    const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), timeout: 120000 });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch(e) { console.log('[smoke] non-json response:\n', text); }
    if (!r.ok) {
      console.error('[smoke] Request failed', r.status, r.statusText);
      if (j) console.error('[smoke] body:', j);
      return process.exit(3);
    }
    console.log('[smoke] response OK');
    console.log('[smoke] body keys:', j && Object.keys(j));
    // validate basic shape
    const ranked = j?.ranked || j?.results || null;
    if (!ranked || !Array.isArray(ranked)) {
      console.error('[smoke] no ranked results found');
      return process.exit(4);
    }
    console.log('[smoke] ranked length =', ranked.length);
    const first = ranked[0] || null;
    console.log('[smoke] sample candidate:', first ? { runId: first.runId, metrics: first.metrics ? Object.keys(first.metrics) : undefined, tradesCsvUrl: first.tradesCsvUrl, resultsJsonUrl: first.resultsJsonUrl } : 'none');
    // If runId present, check trades CSV URL reachable
    const sampleUrl = first?.tradesCsvUrl || first?.resultsJsonUrl;
    if (sampleUrl) {
      const resolved = sampleUrl.startsWith('http') ? sampleUrl : (apiBase.replace(/\/$/, '') + (sampleUrl.startsWith('/')? '' : '/') + sampleUrl);
      console.log('[smoke] checking sample export URL', resolved);
      try {
        const rr = await fetchFn(resolved, { method: 'GET' });
        console.log('[smoke] export status', rr.status);
      } catch(e) { console.warn('[smoke] export fetch failed', String(e)); }
    }
    console.log('[smoke] OK - optimizer endpoint responded with candidates');
    process.exit(0);
  } catch (e) {
    console.error('[smoke] error', String(e && e.message || e));
    process.exit(5);
  }
})();
