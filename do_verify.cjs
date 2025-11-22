const http = require('http');
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
(async ()=>{
  try{
    const jobId = await startJob();
    console.log('started jobId=', jobId);
    let runId = null;
    for (let i=0;i<60;i++){
      const st = await getStatus(jobId);
      const logs = st.logs||[];
      console.log('tick',i,'status',st.status,'lastLog',logs[logs.length-1]||'<none>');
      if (st.runId) runId = st.runId;
      if (st.status==='done' && runId) break;
      await new Promise(r=>setTimeout(r,1000));
    }
    if (!runId) { console.error('no runId found'); process.exit(2); }
    console.log('fetching result for', runId);
    const r = await getResult(runId);
    console.log('result status', r.status);
    console.log(JSON.stringify(r.body, null, 2));
  }catch(e){ console.error('err', e && e.message || e); process.exit(2); }
})();
