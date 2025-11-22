// Replay verification: feed historical candles into LiveRunner (dry-run) and summarize latencies
// Usage:
//   node scripts/replay-verify-adapter.cjs --symbol ADANIPORTS --from 2025-10-01 --to 2025-10-30 --interval day
// Env:
//   WS_PORT (default 8090), DRY_RUN=1, SIMULATE_UPSTOX=0/1, ADMIN_SHARED_SECRET (optional for token pre-store)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
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

async function httpJson(method, url, body=null, headers={}){
  return new Promise((resolve,reject)=>{
    const u = new URL(url);
    const req = http.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + (u.search||''), headers: { 'Content-Type':'application/json', ...headers } }, res => {
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

async function main(){
  const args = parseArgs();
  const symbol = args.symbol || 'ADANIPORTS';
  const from = args.from || '2025-10-01';
  const to = args.to || '2025-10-30';
  const interval = args.interval || 'day';
  const WS_PORT = Number(process.env.WS_PORT || 8090);

  // Start LiveRunner in dry-run mode on a non-default port
  const env = { ...process.env, DRY_RUN: '1', ALLOW_LIVE: '0', WS_PORT: String(WS_PORT), CANARY_MODE: '1' };
  const runner = spawn(process.execPath, [path.join('backend','strategy','liveRunner.cjs')], { env, stdio: ['ignore','pipe','pipe'] });
  let ready = false; let lines=0;
  runner.stdout.on('data', (d)=>{ const s=d.toString(); process.stdout.write(s); if (s.includes('Live Runner started on port')) ready=true; });
  runner.stderr.on('data', (d)=>{ process.stderr.write(d.toString()); });

  // Wait for health OK
  for (let i=0;i<30;i++){
    await sleep(300);
    try {
      const r = await httpJson('GET', `http://localhost:${WS_PORT}/health`);
      if (r.status === 200 && r.data && r.data.ok) { ready = true; break; }
    } catch(_){}
  }
  if (!ready){
    console.error('Runner failed to start');
    runner.kill();
    process.exit(1);
  }

  // Load candles from cache if present (chenna-CTS/backend/strategy/cache)
  const cacheDir = path.join('chenna-CTS','backend','strategy','cache');
  const cacheFile = path.join(cacheDir, `${symbol}_${from}_${to}_${interval}.json`);
  let candles = [];
  if (fs.existsSync(cacheFile)){
    try { const raw = JSON.parse(fs.readFileSync(cacheFile,'utf8')); candles = raw && raw.ohlcv ? raw.ohlcv : []; } catch(_){}
  }
  if (!Array.isArray(candles) || candles.length === 0){
    // fallback: synthesize a small series
    const base = 100; const vol=1000;
    candles = Array.from({length: 10}).map((_,i)=>({
      date: new Date(Date.now() + i*60000).toISOString(),
      open: base + i,
      high: base + i + 2,
      low: base + i - 1,
      close: base + i + 1,
      volume: vol + i*10,
    }));
  }

  // Replay into /ingest/candles with symbol attached
  const payload = candles.map(c=>({ symbol, ...c }));
  const r = await httpJson('POST', `http://localhost:${WS_PORT}/ingest/candles`, { candles: payload });
  if (r.status !== 200 || !r.data || !r.data.ok){
    console.error('Replay failed', r.status, r.data);
    runner.kill();
    process.exit(2);
  }

  // Fetch status and metrics
  const status = await httpJson('GET', `http://localhost:${WS_PORT}/status`);
  const metrics = await httpJson('GET', `http://localhost:${WS_PORT}/metrics`);

  console.log('Replay OK');
  console.log('State:', JSON.stringify(status.data, null, 2));
  console.log('Metrics:', JSON.stringify(metrics.data, null, 2));

  // Tail audit file to summarize latency samples if available
  try {
    const logDir = path.join('logs');
    const files = fs.readdirSync(logDir).filter(f=>/^live-audit-\d{8}\.jsonl$/.test(f)).sort();
    const last = files[files.length-1];
    if (last){
      const txt = fs.readFileSync(path.join(logDir,last),'utf8');
      const lines = txt.split(/\r?\n/).filter(Boolean);
      const lat = [];
      for (const line of lines){
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'fill_latency' && typeof obj.ms === 'number') lat.push(obj.ms);
        } catch(_){}
      }
      if (lat.length){
        const avg = Math.round(lat.reduce((a,b)=>a+b,0)/lat.length);
        const p95 = [...lat].sort((a,b)=>a-b)[Math.floor(lat.length*0.95)-1] || lat[lat.length-1];
        console.log(`Latency samples: n=${lat.length} avgMs=${avg} p95Ms=${p95}`);
      } else {
        console.log('No fill_latency samples found');
      }
    }
  } catch(_){}

  // Stop runner cleanly
  await httpJson('POST', `http://localhost:${WS_PORT}/admin/stop-live`);
  await sleep(200);
  runner.kill();
}

main().catch(e=>{ console.error(e); process.exit(1); });
