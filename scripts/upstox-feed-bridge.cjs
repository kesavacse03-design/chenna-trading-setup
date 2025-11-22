// Upstox feed bridge: subscribes to live prices (poll fallback) and posts candles to /ingest
// Defaults to SIMULATE mode to avoid network calls. Enable polling by setting LIVE_POLL=1 and provide access token.
// Optional: START_RUNNER=1 to auto-start a DRY_RUN LiveRunner for demo.

const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const { TokenManager } = require('../backend/strategy/tokenManager.cjs');
const { InstrumentResolver } = require('../backend/strategy/instrumentResolver.cjs');

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i=0; i<argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : '1';
      args[k] = v;
    }
  }
  return args;
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function httpJson(method, url, body=null){
  return new Promise((resolve,reject)=>{
    const u = new URL(url);
    const req = http.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + (u.search||''), headers: { 'Content-Type':'application/json' }}, res => {
      let buf='';
      res.on('data', d=> buf += d.toString());
      res.on('end', ()=>{
        try { resolve({ status: res.statusCode, data: buf ? JSON.parse(buf) : null }); } catch(e){ resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Resolve trading symbols to instrument_key using workspace .data files if present
const fs = require('fs');
function getInstrumentsPath(exchangePrefix) {
  const root = process.cwd();
  const base = exchangePrefix && exchangePrefix.startsWith('BSE') ? 'BSE.json' : 'NSE.json';
  return path.join(root, '.data', base, base.replace('.json','') + '.json');
}
function loadInstrumentMap(exchangePrefix) {
  try {
    const p = getInstrumentsPath(exchangePrefix || 'NSE_EQ');
    if (!fs.existsSync(p)) return null;
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    const map = new Map();
    for (const it of arr) {
      if (!it) continue;
      if ((it.segment||'') !== (exchangePrefix||'NSE_EQ')) continue;
      const sym = String(it.trading_symbol||'').toUpperCase();
      const key = String(it.instrument_key || it.asset_key || '').toUpperCase();
      if (sym && key && !map.has(sym)) map.set(sym, key);
    }
    return map;
  } catch(_) { return null; }
}

async function fetchLastOhlcV3(apiBase, token, keys, interval='1m'){
  // Try v3 OHLC; expect { data: { [key]: [ { o,h,l,c,volume, ... } ] } } or similar
  const url = `${apiBase}/v3/market-quote/ohlc?instrument_key=${encodeURIComponent(keys.join(','))}&interval=${encodeURIComponent(interval)}`;
  const res = await fetch(url, { headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'User-Agent': 'chenna-feed-bridge/1.0',
    'Connection': 'close'
  }});
  if (!res.ok) {
    let text = '';
    try { text = await res.text(); } catch(_) {}
    const snippet = (text||'').replace(/\s+/g,' ').slice(0,300);
    throw new Error(`v3 ohlc ${res.status}: ${snippet}`);
  }
  const j = await res.json();
  const out = [];
  const data = j && (j.data || j.ohlc || j.result || j);
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      const arr = data[k];
      if (Array.isArray(arr) && arr.length) {
        const last = arr[arr.length-1];
        const c = {
          instrument_key: k,
          date: last.timestamp || last.time || new Date().toISOString(),
          open: Number(last.open || last.o || last.O || last.Open || 0),
          high: Number(last.high || last.h || last.H || last.High || 0),
          low: Number(last.low || last.l || last.L || last.Low || 0),
          close: Number(last.close || last.c || last.C || last.Close || last.ltp || 0),
          volume: Number(last.volume || last.v || last.V || 0)
        };
        out.push(c);
      }
    }
  }
  return out;
}

async function fetchLastOhlcV2(apiBase, token, keys, interval='1m'){
  const url = `${apiBase}/v2/market-quote/ohlc?instrument_key=${encodeURIComponent(keys.join(','))}&interval=${encodeURIComponent(interval)}`;
  const res = await fetch(url, { headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'User-Agent': 'chenna-feed-bridge/1.0',
    'Connection': 'close'
  }});
  if (!res.ok) {
    let text = '';
    try { text = await res.text(); } catch(_) {}
    const snippet = (text||'').replace(/\s+/g,' ').slice(0,300);
    throw new Error(`v2 ohlc ${res.status}: ${snippet}`);
  }
  const j = await res.json();
  // v2 format: { data: { "NSE_EQ|...": { o,h,l,c,volume } } }
  const out = [];
  const data = j && (j.data || j.ohlc || j.result || j);
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      const last = data[k];
      if (!last || typeof last !== 'object') continue;
      const c = {
        instrument_key: k,
        date: new Date().toISOString(),
        open: Number(last.open || last.o || 0),
        high: Number(last.high || last.h || 0),
        low: Number(last.low || last.l || 0),
        close: Number(last.close || last.c || last.ltp || 0),
        volume: Number(last.volume || last.v || 0)
      };
      out.push(c);
    }
  }
  return out;
}

async function main(){
  const args = parseArgs();
  const SIM = String(process.env.SIMULATE_FEED||'1') === '1';
  const LIVE_POLL = String(process.env.LIVE_POLL||'0') === '1';
  const LIVE_WS = String(process.env.LIVE_WS||'0') === '1';
  const START_RUNNER = String(process.env.START_RUNNER||'0') === '1';
  const exchange = args.exchange || process.env.UPSTOX_DEFAULT_EXCHANGE || 'NSE_EQ';
  const ingestBase = args.ingestBase || process.env.INGEST_BASE || 'http://localhost:8080';
  const intervalMs = Number(args.intervalMs || process.env.FEED_INTERVAL_MS || 15000);
  const maxLoops = Number(args.count || process.env.FEED_COUNT || 0); // 0 = infinite
  const apiBase = args.apiBase || process.env.UPSTOX_API_BASE || 'https://api.upstox.com';
  const symList = (args.symbols ? String(args.symbols).split(',') : []).map(s=>s.trim().toUpperCase()).filter(Boolean);
  const keyList = (args.keys ? String(args.keys).split(',') : []).map(s=>s.trim()).filter(Boolean);

  // Optional: start a temp runner for demo
  let runner = null; let port = new URL(ingestBase).port || '8080';
  if (START_RUNNER) {
    port = String(args.port || process.env.WS_PORT || 8082);
    const env = { ...process.env, DRY_RUN: '1', ALLOW_LIVE: '0', WS_PORT: String(port), CANARY_MODE: '1' };
    runner = spawn(process.execPath, [path.join('backend','strategy','liveRunner.cjs')], { env, stdio: ['ignore','pipe','pipe'] });
    runner.stdout.on('data', d=> process.stdout.write(d.toString()));
    runner.stderr.on('data', d=> process.stderr.write(d.toString()));
    // wait health
    for (let i=0;i<50;i++){ await sleep(200); try { const r = await httpJson('GET', `http://localhost:${port}/health`); if (r.status===200 && r.data && r.data.ok) break; } catch(_){} }
  }
  const base = START_RUNNER ? `http://localhost:${port}` : ingestBase;

  // Resolve symbols to instrument_keys if needed
  let keys = [...keyList];
  if (!keys.length && symList.length) {
    const map = loadInstrumentMap(exchange) || new Map();
    for (const s of symList) {
      const k = map.get(s);
      if (k) keys.push(k); else console.warn(`[FEED] No instrument_key for ${s} in ${exchange}. Provide --keys or ensure .data instruments are present.`);
    }
  }

  // Instrument resolver and optional periodic reload
  const resolver = new InstrumentResolver();
  const reloadMs = Number(process.env.INSTRUMENT_RELOAD_MS || process.env.INSTRUMENTS_RELOAD_MS || 0);
  let reloadTimer = null;
  if (reloadMs > 0) {
    reloadTimer = setInterval(() => { try { resolver.reload(); } catch(_){} }, reloadMs);
  }

  // Token for live poll
  let token = null;
  if (LIVE_POLL && !SIM) {
    try {
      const tm = new TokenManager();
      token = tm.loadToken();
    } catch (e) {
      if (process.env.UPSTOX_ACCESS_TOKEN) token = process.env.UPSTOX_ACCESS_TOKEN;
      else throw new Error('No UPSTOX access token available for LIVE_POLL');
    }
  }

  // Optional WS mode: stream ticks and convert to candles (ltp as close)
  if (LIVE_WS && !SIM) {
    const wsUrl = process.env.UPSTOX_WS_URL;
    if (!wsUrl) console.error('[FEED] LIVE_WS=1 but UPSTOX_WS_URL not set; falling back to SIM/POLL');
    else {
      const WebSocket = require('ws');
      const headers = {};
      if (process.env.UPSTOX_WS_AUTH === '1') {
        const tok = token || (new TokenManager().loadToken());
        headers['Authorization'] = `Bearer ${tok}`;
      }
      let stopWs = false;
      const base = START_RUNNER ? `http://localhost:${port}` : ingestBase;
      while (!stopWs) {
        await new Promise((resolve) => {
          const ws = new WebSocket(wsUrl, { headers });
          let opened = false;
          ws.on('open', () => {
            opened = true;
            console.log('[FEED] WS connected');
            const sub = process.env.UPSTOX_WS_SUBSCRIBE;
            if (sub) { try { ws.send(sub); } catch(_){} }
            else console.warn('[FEED] No UPSTOX_WS_SUBSCRIBE payload provided; ensure upstream sends data');
          });
          ws.on('message', async (buf) => {
            try {
              const s = buf.toString();
              let msg; try { msg = JSON.parse(s); } catch(_) { return; }
              // Best-effort parse; expect fields ltp/close/open/high/low/symbol or instrument_key
              const sym = String(msg.symbol || msg.trading_symbol || msg.instrument_key || '').toUpperCase();
              if (!sym) return;
              const close = Number(msg.ltp || msg.close || msg.c || 0);
              const open = Number(msg.open || msg.o || close);
              const high = Number(msg.high || msg.h || close);
              const low = Number(msg.low || msg.l || close);
              const volume = Number(msg.volume || msg.vol || msg.v || 0);
              if (!Number.isFinite(close)) return;
              const candle = { symbol: sym, date: new Date().toISOString(), open, high, low, close, volume };
              try { await httpJson('POST', `${base}/ingest/candle`, candle); } catch(e){ console.error('[FEED] ingest error', e.message); }
            } catch(_) {}
          });
          ws.on('close', () => {
            console.warn('[FEED] WS disconnected');
            setTimeout(resolve, 1000);
          });
          ws.on('error', (e) => {
            console.error('[FEED] WS error', e.message);
            if (!opened) setTimeout(resolve, 1000); else resolve();
          });
        });
        if (maxLoops && Date.now() - (this.__wsStart||0) > maxLoops*intervalMs) break;
      }
      return; // WS loop ends script
    }
  }

  let loop = 0;
  while (true) {
    loop++;
    if (SIM) {
      // Generate synthetic candles for provided symbols
      const now = Date.now();
      const list = (symList.length ? symList : ['SMOKE']).map((s,idx)=>{
        const basePx = 100 + ((now/1000|0)%50) + idx;
        const res = resolver.resolveBySymbol(s);
        return {
          symbol: s,
          instrument_key: res ? res.key : undefined,
          date: new Date().toISOString(),
          open: basePx,
          high: basePx+1.5,
          low: basePx-1,
          close: basePx+0.9,
          volume: 1000+loop*10
        };
      });
      for (const c of list) {
        try { await httpJson('POST', `${base}/ingest/candle`, c); } catch(e){ console.error('[FEED] ingest error', e.message); }
      }
    } else if (LIVE_POLL) {
      if (!keys.length) { console.warn('[FEED] No instrument keys available for LIVE_POLL'); }
      try {
        let arr = [];
        const preferV2 = String(process.env.UPSTOX_USE_V2||'0') === '1';
        if (keys.length) {
          if (preferV2) {
            try { arr = await fetchLastOhlcV2(apiBase, token, keys, '1m'); }
            catch (e2) { console.warn('[FEED] v2 fallback failed:', e2.message); arr = await fetchLastOhlcV3(apiBase, token, keys, '1m'); }
          } else {
            try { arr = await fetchLastOhlcV3(apiBase, token, keys, '1m'); }
            catch (e3) { console.warn('[FEED] v3 failed:', e3.message); arr = await fetchLastOhlcV2(apiBase, token, keys, '1m'); }
          }
        }
        // Map instrument_key back to symbol when we can (best-effort)
        const map = loadInstrumentMap(exchange) || new Map();
        const rev = new Map(); for (const [sym, key] of map.entries()) rev.set(String(key).toUpperCase(), sym);
        for (const it of arr) {
          const key = String(it.instrument_key || it.instrumentKey || it.instrument || '').toUpperCase();
          const sym = rev.get(String(it.instrument_key).toUpperCase()) || String(it.instrument_key);
          const resolved = resolver.resolveByKey(key) || resolver.resolveBySymbol(sym) || null;
          const candle = {
            symbol: resolved ? resolved.sym : sym,
            instrument_key: resolved ? resolved.key : (key || undefined),
            date: it.date,
            open: it.open,
            high: it.high,
            low: it.low,
            close: it.close,
            volume: it.volume
          };
          try { await httpJson('POST', `${base}/ingest/candle`, candle); } catch(e){ console.error('[FEED] ingest error', e.message); }
        }
      } catch (e) {
        console.error('[FEED] poll error', e.message);
      }
    }

    if (maxLoops && loop >= maxLoops) break;
    await sleep(intervalMs);
  }

  if (runner) {
    try { await httpJson('POST', `http://localhost:${port}/admin/stop-live`); } catch(_){ }
    await sleep(200);
    try { runner.kill(); } catch(_){ }
    // Ensure process exits on Windows if child lingers
    await new Promise((resolve) => {
      let settled = false;
      const watchdog = setTimeout(() => {
        if (process.platform === 'win32' && runner && runner.pid) {
          try { require('child_process').spawn('taskkill', ['/PID', String(runner.pid), '/T', '/F'], { stdio: 'ignore' }); } catch(_){}
        }
        if (!settled) resolve();
      }, 800);
      try { runner.once('exit', () => { settled = true; clearTimeout(watchdog); resolve(); }); } catch(_) { resolve(); }
    });
  }

  if (reloadTimer) { try { clearInterval(reloadTimer); } catch(_){} }
}

main().catch(e=>{ console.error(e); process.exit(1); });
