const cp = require('child_process');
const path = require('path');
const http = require('http');
const serverPath = path.resolve(__dirname, 'chenna-CTS', 'backend', 'server.cjs');
const server = cp.spawn(process.execPath, [serverPath], { stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', d => { const s = String(d); process.stderr.write('[server] ' + s); });
server.stderr.on('data', d => { process.stderr.write('[server-err] ' + String(d)); });
(async ()=>{
  try{
    // wait for listening message
    await new Promise((resolve,reject)=>{
      const t = setTimeout(()=>reject(new Error('server start timeout')), 5000);
      server.stdout.on('data', function onData(chunk){ const s=String(chunk); if (s.includes('listening on')){ clearTimeout(t); server.stdout.off('data', onData); resolve(); } });
    });
    // now run verification (start job, poll, then get result)
    function startJob(){
      return new Promise((resolve,reject)=>{
        const data = JSON.stringify({ symbols: ['MOCKD'], from: '2025-01-01', to: '2025-10-01', interval: '1d', mode: 'mock' });
        const opts = { hostname: 'localhost', port: 3001, path: '/api/backtest/start', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
        const req = http.request(opts, res => { let b=''; res.on('data', c=>b+=c); res.on('end', ()=>{ try{ const j=JSON.parse(b); resolve(j.jobId); }catch(e){ reject(e); } }); });
        req.on('error', reject); req.write(data); req.end();
      });
    }
    function getStatus(jobId){ return new Promise((resolve,reject)=>{ http.get({ hostname: 'localhost', port: 3001, path: '/api/backtest/status?jobId=' + encodeURIComponent(jobId) }, res=>{ let b=''; res.on('data', c=>b+=c); res.on('end', ()=>{ try{ resolve(JSON.parse(b)); }catch(e){ reject(e); } }); }).on('error', reject); }); }
    function getResult(runId){ return new Promise((resolve,reject)=>{ http.get({ hostname: 'localhost', port: 3001, path: '/api/backtest/result/' + runId }, res=>{ let b=''; res.on('data', c=>b+=c); res.on('end', ()=>{ try{ resolve({ status: res.statusCode, body: JSON.parse(b) }); }catch(e){ resolve({ status: res.statusCode, body: b }); } }); }).on('error', reject); }); }
    const jobId = await startJob(); console.log('started', jobId);
    let runId=null;
    for (let i=0;i<60;i++){
      const st = await getStatus(jobId);
      const logs = st.logs||[];
      console.log('tick', i, 'status', st.status, 'lastLog', logs[logs.length-1]||'<none>');
      if (st.runId) runId = st.runId;
      if (st.status==='done' && runId) break;
      await new Promise(r=>setTimeout(r,1000));
    }
    if (!runId) throw new Error('no runId');
    console.log('fetching result for', runId);
    const r = await getResult(runId);
    console.log('API result status', r.status);
    console.log(JSON.stringify(r.body, null, 2));
  }catch(e){ console.error('verify error', e && e.stack || e); }
  finally{
    try { server.kill(); } catch(_){}
    process.exit(0);
  }
})();
