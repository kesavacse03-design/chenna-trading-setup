const fs = require('fs');
const path = require('path');
(async ()=>{
  try{
    const btPath = path.resolve(__dirname, '..', 'backtester.cjs');
    if (!fs.existsSync(btPath)) { console.error('backtester not found', btPath); process.exit(2); }
    const { runBacktest } = require(btPath);
    const out = await runBacktest({ symbols:['MOCKD'], from:'2025-01-01', to:'2025-10-01', interval:'1d', mode:'mock' }, { onLog: ()=>{}, onProgress: ()=>{} });
    const runId = out && out.runId;
    if (!runId) { console.error('no runId returned'); process.exit(2); }
  // repo-level backend/jobs
  const jobsDir = path.resolve(__dirname, '..', '..', '..', 'backend', 'jobs');
    const jobPath = path.join(jobsDir, `job_${runId}.json`);
    const resultsPath = out && out.resultsPath;
    if (!fs.existsSync(jobPath)) { console.error('job JSON missing', jobPath); process.exit(2); }
    if (!fs.existsSync(resultsPath)) { console.error('results JSON missing', resultsPath); process.exit(2); }
    console.log('OK', runId, jobPath);
    // cleanup: remove the created files to keep repo clean for CI
    try{ fs.unlinkSync(jobPath); }catch(_){ }
    try{ fs.unlinkSync(resultsPath); }catch(_){ }
    try{ fs.unlinkSync(out.tradesPath); }catch(_){ }
    process.exit(0);
  }catch(e){ console.error('test failed', e && e.stack || e); process.exit(2); }
})();
