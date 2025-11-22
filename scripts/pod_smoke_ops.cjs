(async function(){
  function log(...a){ try{ console.log.apply(console, a); }catch(_){}}
  try {
    const { TokenManager } = require('../backend/strategy/tokenManager.cjs');
    const tm = new TokenManager();
    const t = tm.loadToken();
    log('[SMOKE] TOKEN_OK', !!t, t ? (t+'').slice(0,12) : 'NULL');
  } catch (e) { log('[SMOKE] TOKEN_ERR', String(e && e.message || e)); }

  const http = require('http');
  async function post(path, json){
    return await new Promise((resolve) => {
      const data = JSON.stringify(json);
      const req = http.request({ hostname: '127.0.0.1', port: 8080, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, r => {
        let d=''; r.on('data', c => d += c); r.on('end', () => resolve({ code: r.statusCode, body: d })); });
      req.on('error', e => resolve({ err: String(e && e.message || e) }));
      req.write(data); req.end();
    });
  }

  try {
    const one = await post('/ingest/candle', { symbol:'TEST', date: new Date().toISOString(), open:1.0, high:2.0, low:0.5, close:1.8, volume:100 });
    log('[SMOKE] INGEST_ONE', one);
  } catch (e) { log('[SMOKE] INGEST_ONE_ERR', String(e && e.message || e)); }

  try {
    const many = await post('/ingest/candles', { candles: [ { symbol:'TEST2', date: new Date().toISOString(), open:1, high:1.5, low:0.9, close:1.2, volume:50 } ] });
    log('[SMOKE] INGEST_MANY', many);
  } catch (e) { log('[SMOKE] INGEST_MANY_ERR', String(e && e.message || e)); }

  try {
    const adminKey = process.env.ADMIN_SHARED_SECRET || '';
    const data = { accessToken: 'SMOKE_TOKEN', refreshToken: 'R' };
    await new Promise((resolve) => {
      const b = JSON.stringify(data);
      const req = http.request({ hostname: '127.0.0.1', port: 8080, path: '/admin/store-token', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey, 'Content-Length': Buffer.byteLength(b) } }, r => { let d=''; r.on('data', c => d += c); r.on('end', () => { log('[SMOKE] STORE_TOKEN', r.statusCode, d); resolve(); }); });
      req.on('error', e => { log('[SMOKE] STORE_TOKEN_ERR', String(e && e.message || e)); resolve(); });
      req.write(b); req.end();
    });
  } catch (e) { log('[SMOKE] STORE_TOKEN_ERR2', String(e && e.message || e)); }

  try {
    const fs = require('fs');
    const p = '/app/.data/secrets-override/upstox.token';
    log('[SMOKE] OVERRIDE_EXISTS', fs.existsSync(p));
    if (fs.existsSync(p)) {
      const s = fs.statSync(p); log('[SMOKE] OVERRIDE_SIZE', s.size);
    }
  } catch (e) { log('[SMOKE] OVERRIDE_ERR', String(e && e.message || e)); }
})();
