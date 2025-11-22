const fs = require('fs');
const path = require('path');

async function loadCandles(baseDir, symbol, from, to, interval){
  const localPath = path.join(baseDir, 'cache', `${symbol}_${from}_${to}_${interval}.json`);
  const altBase = path.resolve(__dirname, '..', 'chenna-CTS', 'backend', 'strategy');
  const altPath = path.join(altBase, 'cache', `${symbol}_${from}_${to}_${interval}.json`);
  let payload = null;
  try { if (fs.existsSync(altPath)) payload = JSON.parse(fs.readFileSync(altPath, 'utf8')); } catch {}
  try { if (!payload && fs.existsSync(localPath)) payload = JSON.parse(fs.readFileSync(localPath, 'utf8')); } catch {}
  return (payload && Array.isArray(payload.ohlcv)) ? payload.ohlcv : [];
}

function findIndexByTs(candles, ts){ const target=new Date(ts).getTime(); let idx=candles.findIndex(c=>new Date(String(c.date)).getTime()>=target); if(idx<0) idx=candles.length-1; return idx; }

(async ()=>{
  try{
    const runId = process.argv[2];
    if (!runId) { console.error('shadowWorker: missing runId'); process.exit(2); }
    const outDir = path.resolve(__dirname, 'strategy', 'output');
    const baseDir = path.resolve(__dirname, 'strategy');
    const jobsDir = path.resolve(__dirname, 'jobs');
    const jobPath = path.join(jobsDir, `job_${runId}.json`);
    if (!fs.existsSync(jobPath)) { console.error('shadowWorker: job not found', jobPath); process.exit(3); }
    const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    const allTrades = [];
    for (const s of Object.keys(job.perSymbol || {})) {
      const arr = job.perSymbol[s] && job.perSymbol[s].trades ? job.perSymbol[s].trades : [];
      for (const t of arr) allTrades.push(t);
    }
    const suggestions = [];
    for (const t of allTrades) {
      if (typeof t.pnl !== 'number' || t.pnl >= 0) continue;
      const candles = await loadCandles(baseDir, t.symbol || t.symbol, job.summary && job.summary.from || '', job.summary && job.summary.to || '', job.summary && job.summary.interval || '');
      if (!candles || !candles.length) {
        const failure = t.exitReason === 'stop' ? 'false_breakout' : 'late_exit';
        const suggest = t.exitReason === 'stop' ? 'tighten breakout rule or add retest filter' : 'avoid holding into EOD without profit (add time stop)';
        suggestions.push({ symbol: t.symbol, failure, suggest, trade: { entry: t.entry, exit: t.exit, pnl: t.pnl, entryTime: t.entryTime, exitTime: t.time } });
        continue;
      }
      const entryIdx = t.entryTime ? findIndexByTs(candles, t.entryTime) : 0;
      const exitIdx = t.time ? findIndexByTs(candles, t.time) : Math.min(entryIdx+1, candles.length-1);
      const windowStart = Math.max(0, entryIdx - 20);
      const prev = candles.slice(windowStart, entryIdx);
      const avgVol = prev.length ? (prev.reduce((a,c)=>a+Number(c.volume||0),0) / prev.length) : Number(candles[Math.max(0,entryIdx-1)]?.volume || 0);
      const entryVol = Number(candles[entryIdx]?.volume || 0);
      const barsHeld = Math.max(1, exitIdx - entryIdx);
      if (t.exitReason === 'stop' && barsHeld <= 5) { suggestions.push({ symbol: t.symbol, failure: 'false_breakout', suggest: 'require volume > 1.5x avg or add retest confirmation', trade: { entry: t.entry, exit: t.exit, pnl: t.pnl, entryTime: t.entryTime, exitTime: t.time }, samplePrior: candles.slice(Math.max(0, entryIdx-5), entryIdx) }); continue; }
      if (entryVol < 1.5 * avgVol) { suggestions.push({ symbol: t.symbol, failure: 'low_volume_breakout', suggest: 'require volume > 1.5x avg', trade: { entry: t.entry, exit: t.exit, pnl: t.pnl, entryTime: t.entryTime, exitTime: t.time }, samplePrior: candles.slice(Math.max(0, entryIdx-5), entryIdx) }); continue; }
      if (t.exitReason === 'eod') { suggestions.push({ symbol: t.symbol, failure: 'late_exit', suggest: 'avoid holding into EOD without profit (add time stop)', trade: { entry: t.entry, exit: t.exit, pnl: t.pnl, entryTime: t.entryTime, exitTime: t.time }, samplePrior: candles.slice(Math.max(0, entryIdx-5), entryIdx) }); continue; }
      suggestions.push({ symbol: t.symbol, failure: 'post_entry_weakness', suggest: 'tighten entry threshold or add trend filter', trade: { entry: t.entry, exit: t.exit, pnl: t.pnl, entryTime: t.entryTime, exitTime: t.time }, samplePrior: candles.slice(Math.max(0, entryIdx-5), entryIdx) });
    }
    const suggPath = path.join(outDir, `${runId}-suggestions.json`);
    try { fs.writeFileSync(suggPath, JSON.stringify({ runId, proposalsOnly: true, suggestions }, null, 2)); } catch (e) { console.error('shadowWorker: failed write suggestions', e); }
    // append or write insights to jobs/job_<runId>.json safely
    try {
      if (fs.existsSync(jobPath)) {
        const j = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        j.insights = suggestions;
        j.insightsStatus = 'done';
        fs.writeFileSync(jobPath, JSON.stringify(j, null, 2), 'utf8');
      }
    } catch (e) { console.error('shadowWorker: failed update job', e); }
    console.log(`SHADOW: suggestions written run-${runId}.insights.json`);
    process.exit(0);
  } catch (e) {
    console.error('shadowWorker error', e && e.stack || e);
    process.exit(1);
  }
})();
