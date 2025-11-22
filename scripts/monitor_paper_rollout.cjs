#!/usr/bin/env node
/*
Monitor latest PAPER daily report and runner /health; emit jobs/paper_monitor_status.json.
*/
const fs = require('fs');
const path = require('path');
const http = require('http');
const jobsDir = path.resolve(__dirname, '..', 'jobs');
function getLatestReport() {
  if (!fs.existsSync(jobsDir)) return null;
  const files = fs.readdirSync(jobsDir).filter(f => /paper_run_paper_live_.*_daily_report\.json$/.test(f));
  if (!files.length) return null;
  const full = files.map(f => ({ f, t: fs.statSync(path.join(jobsDir,f)).mtimeMs }))
    .sort((a,b)=>b.t-a.t)[0].f;
  try { return JSON.parse(fs.readFileSync(path.join(jobsDir, full),'utf8')); } catch(_) { return null; }
}
function fetchHealth(base='http://127.0.0.1:18080') {
  return new Promise(resolve => {
    try {
      http.get(base + '/health', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        try { resolve(JSON.parse(d)); } catch(_) { resolve({ ok:false, parseError:true, raw:d }); }
      }); }).on('error',e=>resolve({ ok:false, error:e.message }));
    } catch(e){ resolve({ ok:false, error: e.message }); }
  });
}
(async()=>{
  const report = getLatestReport();
  const health = await fetchHealth();
  const status = {
    ts: new Date().toISOString(),
    reportFound: !!report,
    lastRunId: report && report.runId || null,
    executionMode: report && report.execution_mode || null,
    symbolsCount: report && Array.isArray(report.symbols) ? report.symbols.length : 0,
    lastRunCreatedAt: report && report.createdAt || null,
    health,
    staleReportMinutes: (()=>{ try { if (!report || !report.createdAt) return null; return Math.round((Date.now()-Date.parse(report.createdAt))/60000); } catch(_) { return null; } })()
  };
  try {
    fs.writeFileSync(path.join(jobsDir,'paper_monitor_status.json'), JSON.stringify(status,null,2));
    console.log('MONITOR_STATUS_OK', status);
  } catch(e){
    console.error('MONITOR_STATUS_WRITE_ERR', e.message);
    process.exit(1);
  }
})();
