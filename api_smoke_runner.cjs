const cp = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const serverPath = path.resolve(__dirname, 'chenna-CTS', 'backend', 'server.cjs');
const out = fs.createWriteStream(path.resolve(__dirname, 'server_smoke.log'));
const server = cp.spawn(process.execPath, [serverPath], { stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.pipe(out);
server.stderr.pipe(out);
function waitForListening(){ return new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('server start timeout')),10000); server.stdout.on('data', function ond(d){ const s=String(d); if (s.includes('listening on http://localhost:3001')){ clearTimeout(t); server.stdout.off('data', ond); res(); } }); }); }
function postStart(symbols){ return new Promise((resolve,reject)=>{
  const data = JSON.stringify({ symbols, from:'2025-01-01', to:'2025-10-01', interval:'1d', mode:'mock' });
  const opts = { hostname:'localhost', port:3001, path:'/api/backtest/start', method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(data) } };
  const req = http.request(opts, res=>{ let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try{ resolve(JSON.parse(b).jobId); }catch(e){ reject(e); } }); });
  req.on('error', reject); req.write(data); req.end();
}); }
function getStatus(jobId){ return new Promise((resolve,reject)=>{ http.get({hostname:'localhost',port:3001,path:'/api/backtest/status?jobId='+encodeURIComponent(jobId)}, res=>{ let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try{ resolve(JSON.parse(b)); }catch(e){ reject(e); } }); }).on('error',reject); }); }
function getResult(runId){ return new Promise((resolve,reject)=>{ http.get({hostname:'localhost',port:3001,path:'/api/backtest/result/'+encodeURIComponent(runId)}, res=>{ let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try{ resolve({status:res.statusCode,body:JSON.parse(b)}); }catch(e){ resolve({status:res.statusCode,body:b}); } }); }).on('error',reject); }); }
(async ()=>{
  try{
    await waitForListening();
    const symbols = ['MOCKD','TITAN','DMART'];
    const jobId = await postStart(symbols);
    console.log('started jobId', jobId);
    let runId=null;
    for (let i=0;i<120;i++){
      const st = await getStatus(jobId);
      if (st.runId) runId = st.runId;
      console.log('tick',i, 'status', st.status);
      if (st.status==='done' && runId) break;
      await new Promise(r=>setTimeout(r,2000));
    }
    if (!runId) throw new Error('no runId');
    console.log('runId', runId);
    // give finalization a sec
    await new Promise(r=>setTimeout(r,1000));
    const log = fs.readFileSync(path.resolve(__dirname,'server_smoke.log'),'utf8').split(/\r?\n/).slice(-80).join('\n');
    console.log('===SERVER LOG TAIL===\n', log);
    const jobPath = path.resolve(__dirname,'backend','jobs',`job_${runId}.json`);
    console.log('jobPath', jobPath, 'exists', fs.existsSync(jobPath));
    if (fs.existsSync(jobPath)) console.log('jobKeys', Object.keys(JSON.parse(fs.readFileSync(jobPath,'utf8'))));
    // per-symbol first trades
    const j = fs.existsSync(jobPath) ? JSON.parse(fs.readFileSync(jobPath,'utf8')) : null;
    if (j && j.perSymbol) {
      for (const s of Object.keys(j.perSymbol)){
        console.log('first trade for', s, JSON.stringify(j.perSymbol[s].trades && j.perSymbol[s].trades[0]));
      }
    }
    const csvPath = path.resolve(__dirname,'backend','strategy','output',`${runId}-trades.csv`);
    if (fs.existsSync(csvPath)) console.log('csvLines', fs.readFileSync(csvPath,'utf8').split(/\r?\n/).slice(0,10).join('\n'));
    const r = await getResult(runId);
    console.log('API result status', r.status);
    console.log('API keys', Object.keys(r.body));
    // Compare frontend mapping - read Workbench component expectations
    const wc = fs.readFileSync(path.resolve(__dirname,'src','components','StrategyWorkbenchModal.tsx'),'utf8');
    console.log('Workbench keys check (snippet):', wc.includes('perSymbol')? 'perSymbol found':'perSymbol missing');
  }catch(e){ console.error('error', e && e.stack || e); }
  finally{ try{ server.kill(); }catch(_){} process.exit(0); }
})();
