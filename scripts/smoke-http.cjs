// Tiny HTTP smoke for LiveRunner: /health, /metrics, /ingest
// Safe: DRY_RUN=1, ALLOW_LIVE=0

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function httpJson(method, url, body=null){
  return new Promise((resolve,reject)=>{
    const u = new URL(url);
    const req = http.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + (u.search||''), headers: { 'Content-Type': 'application/json' }}, res => {
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
  const PORT = Number(process.env.WS_PORT || 8091);
  const env = { ...process.env, DRY_RUN: '1', ALLOW_LIVE: '0', WS_PORT: String(PORT), CANARY_MODE: '1' };
  const runner = spawn(process.execPath, [path.join('backend','strategy','liveRunner.cjs')], { env, stdio: ['ignore','pipe','pipe'] });
  runner.stdout.on('data', d=> process.stdout.write(d.toString()));
  runner.stderr.on('data', d=> process.stderr.write(d.toString()));

  // wait for health
  let up = false;
  for (let i=0;i<30;i++){
    await sleep(200);
    try {
      const r = await httpJson('GET', `http://localhost:${PORT}/health`);
      if (r.status === 200 && r.data && r.data.ok) { up = true; break; }
    } catch(_){}
  }
  if (!up) { console.error('health failed'); runner.kill(); process.exit(1); }

  // metrics (json)
  const m = await httpJson('GET', `http://localhost:${PORT}/metrics`);
  if (m.status !== 200) { console.error('metrics failed'); runner.kill(); process.exit(2); }

  // ingest one candle
  const c = { symbol:'SMOKE', open:100, high:101, low:99.5, close:100.5, volume:1000, date: new Date().toISOString() };
  const r1 = await httpJson('POST', `http://localhost:${PORT}/ingest/candle`, c);
  if (r1.status !== 200 || !r1.data || !r1.data.ok) { console.error('ingest/candle failed'); runner.kill(); process.exit(3); }

  // ingest multiple
  const cs = [0,1].map(i=>({ symbol:'SMOKE', open:101+i, high:102+i, low:100.5+i, close:101.5+i, volume:1100+i, date: new Date(Date.now()+ (i+1)*60000).toISOString() }));
  const r2 = await httpJson('POST', `http://localhost:${PORT}/ingest/candles`, { candles: cs });
  if (r2.status !== 200 || !r2.data || !r2.data.ok || r2.data.count < 2) { console.error('ingest/candles failed'); runner.kill(); process.exit(4); }

  // done
  console.log('HTTP smoke passed');
  await httpJson('POST', `http://localhost:${PORT}/admin/stop-live`);
  await sleep(200);
  runner.kill();
}

main().catch(e=>{ console.error(e); process.exit(1); });
