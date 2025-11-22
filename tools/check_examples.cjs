#!/usr/bin/env node
// Validate that example symbols have cache or are fetchable via prefetch
const fs = require('fs');
const path = require('path');

function ok(msg){ console.log(`OK ${msg}`); }
function fail(msg){ console.error(`ERR ${msg}`); process.exitCode = 2; }

function usage(){
  console.log('Usage: node tools/check_examples.cjs --from YYYY-MM-DD --to YYYY-MM-DD --interval day --mode mock --symbols RELIANCE,INFY');
  console.log('   or: node tools/check_examples.cjs --file tmp/category_symbols.txt --from YYYY-MM-DD --to YYYY-MM-DD');
}

function parseArgs(){
  const args = process.argv.slice(2);
  const out = {};
  for (let i=0;i<args.length;i++){
    const a = args[i];
    const n = args[i+1];
    if (a === '--from') { out.from = n; i++; }
    else if (a === '--to') { out.to = n; i++; }
    else if (a === '--interval') { out.interval = n; i++; }
    else if (a === '--mode') { out.mode = n; i++; }
  else if (a === '--symbols') { out.symbols = n ? n.split(',').map(s=>s.trim()).filter(Boolean) : []; i++; }
  else if (a === '--file') { out.file = n; i++; }
  }
  return out;
}

(async function main(){
  const { from, to, interval = 'day', mode = 'mock' } = parseArgs();
  let { symbols = [], file = null } = parseArgs();
  if ((!symbols || !symbols.length) && file) {
    try { const txt = require('fs').readFileSync(file,'utf8'); symbols = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); } catch(_) {}
  }
  if (!from || !to || !symbols.length) { usage(); return process.exit(2); }
  const stratBase = path.resolve(__dirname, '..', 'backend', 'strategy');
  const cacheDir = path.join(stratBase, 'cache');
  const altBase = path.resolve(__dirname, '..', 'chenna-CTS', 'backend', 'strategy');
  const altCacheDir = path.join(altBase, 'cache');
  let missing = [];
  for (const s of symbols){
  const p = path.join(cacheDir, `${s}_${from}_${to}_${interval}.json`);
  const alt = path.join(altCacheDir, `${s}_${from}_${to}_${interval}.json`);
  if (!fs.existsSync(p) && !fs.existsSync(alt)) missing.push({ symbol: s, path: p, alt });
  }
  if (!missing.length) return ok(`all ${symbols.length} symbols cached`);
  // attempt prefetch via local backend
  const urlBase = process.env.CTS_API_BASE || process.env.BACKEND_BASE || `http://localhost:${process.env.BACKEND_PORT||3001}`;
  const fetchImpl = (typeof fetch === 'function') ? fetch : require('node-fetch');
  try {
    const items = symbols.map(s=>({ symbol: s, from, to, interval }));
    const r = await fetchImpl(`${urlBase}/strategy/prefetch`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode, items }) });
    if (!r.ok) throw new Error(`prefetch ${r.status}`);
    const j = await r.json();
    const errs = (j.results||[]).filter(x=>x.status==='error');
    if (errs.length) { errs.forEach(e=>console.error('PREFETCH_ERR', e.symbol, e.reason||'error')); return process.exit(3); }
    ok('prefetch completed');
  } catch (e) {
    fail(`prefetch failed: ${e && e.message}`); return process.exit(3);
  }
})();
