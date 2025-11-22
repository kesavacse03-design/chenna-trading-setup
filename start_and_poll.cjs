const http = require('http');
function startJob(){
  return new Promise((resolve,reject)=>{
    const data = JSON.stringify({ symbols: ['MOCKD'], from: '2025-01-01', to: '2025-10-01', interval: '1d', mode: 'mock' });
    const opts = { hostname: 'localhost', port: 3001, path: '/api/backtest/start', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
    const req = http.request(opts, res => { let b=''; res.on('data', c=>b+=c); res.on('end', ()=>{ try{ const j=JSON.parse(b); resolve(j.jobId); }catch(e){ reject(e); } }); });
    req.on('error', reject); req.write(data); req.end();
  });
}
function getStatus(jobId){ return new Promise((resolve,reject)=>{ http.get({ hostname: 'localhost', port: 3001, path: '/api/backtest/status?jobId='+encodeURIComponent(jobId) }, res=>{ let b=''; res.on('data', c=>b+=c); res.on('end', ()=>{ try{ resolve(JSON.parse(b)); }catch(e){ reject(e); } }); }).on('error', reject); }); }
(async ()=>{
  try{
    const jobId = await startJob();
    console.log('started', jobId);
    for (let i=0;i<60;i++){
      const st = await getStatus(jobId);
      const logs = st.logs||[];
      const line = logs[logs.length-1];
      console.log('tick',i,'status',st.status,'lastLog',line);
      const found = logs.find(l=>l.includes('RESULT: wrote job JSON'))||logs.find(l=>l.includes('RESULT: failed to write job JSON'));
      if (found) console.log('FOUND:',found);
      if (st.status==='done') { console.log('DONE logs last 6:\n', logs.slice(-6).join('\n')); break; }
      await new Promise(r=>setTimeout(r,1000));
    }
  }catch(e){ console.error('err', e && e.message || e); process.exit(2); }
})();
