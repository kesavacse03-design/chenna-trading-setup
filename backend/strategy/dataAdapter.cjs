// CommonJS runtime adapters for backend to require directly.
let axios = null;
try { axios = require('axios'); } catch (e) { axios = null; }
if (typeof fetch !== 'function') {
  try { global.fetch = require('node-fetch'); } catch (e) { }
}

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

class MockDataAdapter {
  async fetch(params) {
    const { symbol, from, to, interval } = params;
    let seed = 0;
    for (const ch of (symbol + from + interval)) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const rng = mulberry32(seed);
    const start = new Date(from + 'T09:15:00');
    const end = new Date(to + 'T15:30:00');
    const minutes = interval.endsWith('m') ? Number(interval.replace(/[^0-9]/g, '')) : (interval === '1m' ? 1 : 60);
    const out = [];
    let t = start.getTime();
    let base = 1000 + Math.floor(rng() * 2000);
    const drift = 0.6; // upward drift factor in mock mode to encourage trends
    while (t <= end.getTime()) {
      const open = +(base + (rng()-0.4) * 4).toFixed(2);
      const high = +(open + Math.abs((rng()) * 4) + (rng()<0.3? 0.8: 0)).toFixed(2);
      const low = +(open - Math.abs((rng()) * 4)).toFixed(2);
      const close = +(low + rng() * (high - low)).toFixed(2);
      const volume = Math.floor(1000 + rng() * 10000);
      const candle = { date: new Date(t).toISOString(), open, high, low, close, volume };
      if ([open,high,low,close].every(Number.isFinite) && candle.date) out.push(candle);
      t += minutes * 60 * 1000;
      base = base + Math.floor((rng()-0.5 + drift) * 2);
    }
    return out;
  }
}

class UpstoxAdapter {
  constructor() {
    // Use backend API base (which proxies Upstox OHLCV), not the Upstox host
    this.apiBase = process.env.CTS_API_BASE
      || process.env.BACKEND_BASE
      || (process.env.BACKEND_PORT ? `http://localhost:${process.env.BACKEND_PORT}` : 'http://localhost:3001');
    this.mockMode = String(process.env.CTS_UPSTOX_MOCK||'') === '1';
    if (this.mockMode) {
      console.log('UpstoxAdapter: MOCK mode enabled — serving fixtures');
    }
  }
  _verbose(msg, ...args) {
    const VERBOSE = /^(1|true|yes)$/i.test(process.env.VERBOSE_LOGGING || '');
    if (VERBOSE) console.log('[CTS][UpstoxAdapter]', msg, ...args);
  }

  async _fetchWithRetries(url, backoffs = [200,600,1800]) {
    if (this.mockMode) {
      // In mock mode, never perform network calls
      return { ok: true, data: { candles: [] } };
    }
    let lastErr = null;
    for (let attempt = 0; attempt < backoffs.length; attempt++) {
      this._verbose('attempt', attempt+1, 'url=', url);
      try {
        if (axios) {
          const resp = await axios.get(url, { timeout: 15000 });
          if (!resp || resp.status >= 400) {
            lastErr = { ok: false, status: resp.status, body: resp.data };
            if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
              this._verbose('retryable status', resp.status, 'backoff=', backoffs[attempt]);
              if (attempt < backoffs.length -1) await new Promise(r => setTimeout(r, backoffs[attempt]));
              continue;
            }
            return { ok: false, error: 'Upstox error', status: resp.status, body: resp.data };
          }
          return { ok: true, data: resp.data };
        } else if (typeof fetch === 'function') {
          const r = await fetch(url).catch(e => ({ ok: false, _fetchError: String(e && e.message) }));
          if (!r || (r.ok === false && r._fetchError)) {
            lastErr = { ok: false, error: 'Network error', detail: r._fetchError };
            this._verbose('network error, will retry if attempts remain', r._fetchError);
            if (attempt < backoffs.length -1) await new Promise(r => setTimeout(r, backoffs[attempt]));
            continue;
          }
          if (!r.ok) {
            const txt = await r.text().catch(() => '');
            lastErr = { ok: false, status: r.status, body: txt };
            this._verbose('non-ok response', r.status, 'body=', String(txt).slice(0,200));
            if ((r.status === 429 || (r.status >= 500 && r.status < 600)) && attempt < backoffs.length -1) { this._verbose('retrying after backoff', backoffs[attempt]); await new Promise(r => setTimeout(r, backoffs[attempt])); continue; }
            return { ok: false, error: 'Upstox error', status: r.status, body: txt };
          }
          const j = await r.json().catch(() => null) || {};
          return { ok: true, data: j };
        } else {
          return { ok: false, error: 'No http client available' };
        }
      } catch (e) {
        lastErr = { ok: false, error: String(e && e.message) };
        this._verbose('exception on attempt', attempt+1, String(e && e.message));
        if (attempt < backoffs.length -1) { await new Promise(r => setTimeout(r, backoffs[attempt])); continue; }
        else return { ok: false, error: 'UpstoxAdapter exception', detail: String(e && e.message) };
      }
    }
    return { ok: false, error: 'UpstoxAdapter failed after retries', detail: lastErr };
  }

  async fetch(params) {
    let { symbol, from, to, interval } = params;
    // Sanity guard date range
    try {
      const dFrom = new Date(from);
      const dTo = new Date(to);
      if (dTo < dFrom) {
        const tmp = from; from = to; to = tmp;
        console.warn('WARN: swapped from/to because to < from');
      }
    } catch(_) { /* ignore */ }

    if (this.mockMode) {
      // Serve synthetic fixture via MockDataAdapter so optimizer sees trades in mock mode
      try {
        const mock = new MockDataAdapter();
        const payload = await mock.fetch({ symbol, from, to, interval });
        return payload;
      } catch (e) { return { ok:false, error:'mock-generate-failed', detail:String(e&&e.message) }; }
    }
    // Live mode path
    const q = new URLSearchParams({ symbol, from, to, interval, debug: '0' });
    const url = `${this.apiBase}/api/upstox/ohlcv?${q.toString()}`;
    try {
      // retries capped at 3
      const resp = await this._fetchWithRetries(url, [200,600,1800]);
      if (!resp || resp.ok === false) return resp;
      let j = resp.data || {};
      if (j && j.ok === false && typeof j.raw === 'string') {
        try { const parsed = JSON.parse(j.raw); j = parsed || j; } catch (e) {}
      }
      let data = null;
      if (Array.isArray(j?.data?.candles)) data = j.data.candles;
      else if (Array.isArray(j?.candles)) data = j.candles;
      else if (Array.isArray(j?.data)) data = j.data;
      else if (Array.isArray(j)) data = j;
      if (data === null) return { ok: false, error: 'Upstox returned unexpected payload', bodySample: j };
      // instrument key not found case (simulate 404 shape) -> return empty array with warning
      if (j && j.status === 404) {
        console.warn(`WARN: instrument key not found, skipping symbol ${symbol}`);
        return [];
      }
      // Normalize each item to plain objects (some code paths may return nested values)
      if (Array.isArray(data)) {
        const norm = data.map(it => {
          if (!it) return null;
          if (Array.isArray(it)) return it; // server will normalize arrays
          return it;
        }).filter(Boolean);
        return norm;
      }
      return data;
    } catch (e) {
      return { ok: false, error: 'UpstoxAdapter outer exception', detail: String(e && e.message) };
    }
  }
}

module.exports = { MockDataAdapter, UpstoxAdapter };
