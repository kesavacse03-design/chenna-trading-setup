#!/usr/bin/env node
// Orchestrate Strategy Workbench 8-step pipeline with fail-fast behavior
// Steps:
// 1) check_examples -> ensure data availability
// 2) compile_strategy -> produce compiled config JSON
// 3) start backtest via server -> receive jobId
// 4) poll status -> wait until done
// 5) validate & normalize job JSON
// 6) summary report
// 7) generate_strategy_from_best
// 8) print result location
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args, opts={}){
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore','pipe','pipe'], shell: process.platform === 'win32', ...opts });
    const logs=[]; let last='';
    p.stdout.on('data', d => { const s=d.toString(); logs.push(s); last += s; if (last.length>200*1024) last = last.slice(-200*1024); process.stdout.write(s); });
    p.stderr.on('data', d => { const s=d.toString(); logs.push(s); last += s; if (last.length>200*1024) last = last.slice(-200*1024); process.stderr.write(s); });
    p.on('close', code => resolve({ code, logs: last.split(/\r?\n/).slice(-200) }));
  });
}

async function httpJson(method, url, body){
  const fetchImpl = (typeof fetch === 'function') ? fetch : require('node-fetch');
  const r = await fetchImpl(url, { method, headers: { 'Content-Type':'application/json' }, body: body?JSON.stringify(body):undefined });
  const txt = await r.text(); let json=null; try { json = JSON.parse(txt); } catch { json = null; }
  return { status: r.status, ok: r.ok, json, text: txt };
}

(async function main(){
  const args = process.argv.slice(2);
  let from=null,to=null,interval='day',mode='mock',symbols=null,categoryKey=null;
  let strategyIn=null;
  let doOptimize = false;
  let preset = null;
  for (let i=0;i<args.length;i++){
    const a=args[i], n=args[i+1];
    if (a==='--from'){ from=n; i++; }
    else if (a==='--to'){ to=n; i++; }
    else if (a==='--interval'){ interval=n; i++; }
    else if (a==='--mode'){ mode=n; i++; }
    else if (a==='--symbols'){ symbols = n?n.split(',').map(s=>s.trim()).filter(Boolean):[]; i++; }
    else if (a==='--category'){ categoryKey=n; i++; }
  else if (a==='--strategy'){ strategyIn=n; i++; }
  else if (a==='--optimize'){ doOptimize = true; }
  else if (a==='--preset'){ preset = n; i++; }
  }
  if (!from || !to) { console.error('from/to required'); process.exit(2); }
  // If category provided, derive symbols (priority: tmp/category_symbols/<CATEGORY>.txt -> cts_stocks.json)
  if ((!symbols || !symbols.length) && categoryKey){
    const symFile = path.resolve('tmp','category_symbols',`${categoryKey}.txt`);
    if (fs.existsSync(symFile)) {
      const txt = fs.readFileSync(symFile,'utf8');
      symbols = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    } else {
      try {
        const arr = JSON.parse(fs.readFileSync(path.resolve('cts_stocks.json'),'utf8'));
        symbols = arr.filter(x=>String(x.categoryKey||'')===categoryKey).map(x=>String(x.stockName||x.symbol||'')).filter(Boolean);
      } catch (e) { console.error('ERR failed to read cts_stocks.json', e && e.message); process.exit(3); }
    }
  }
  // Preset handling (quick local workflows). 'downside-lom' runs the permissive smoke runner for DOWNSIDE/LONG_TERM_SWING_BO_DOWN
  if (preset && String(preset).toLowerCase() === 'downside-lom'){
    // bypass the remote backtest server and run local quick backtest script that we trust
    const runner = path.resolve('scripts','run_downside_lom_smoke.cjs');
    if (!fs.existsSync(runner)) { console.error('preset runner missing:', runner); process.exit(2); }
    const args = ['node', runner, '--from', from, '--to', to];
    // spawn the runner synchronously and exit with its code
    const p = require('child_process').spawnSync('node', [runner], { stdio: 'inherit', shell: process.platform === 'win32' });
    process.exit(p.status || 0);
  }
  if (!symbols || !symbols.length) { console.error('No symbols specified'); process.exit(2); }
  const apiBase = process.env.CTS_API_BASE || process.env.BACKEND_BASE || `http://localhost:${process.env.BACKEND_PORT||3001}`;

  // 1) check_examples
  {
    const r = await run('node', ['tools/check_examples.cjs','--from',from,'--to',to,'--interval',interval,'--mode',mode,'--symbols',symbols.join(',')]);
    if (r.code !== 0) { console.error('STEP1 failed. Last 200 lines:\n'+r.logs.join('\n')); process.exit(r.code); }
  }

  // 2) compile_strategy
  const compiledPath = path.resolve('backend','strategy','output','compiled-strategy.json');
  if (strategyIn){
    const r = await run('node', ['tools/compile_strategy.cjs','--in', strategyIn, '--out', compiledPath]);
    if (r.code !== 0) { console.error('STEP2 failed. Last 200 lines:\n'+r.logs.join('\n')); process.exit(r.code); }
  } else {
    // if no strategy provided, synthesize defaults
    fs.mkdirSync(path.dirname(compiledPath), { recursive: true });
    fs.writeFileSync(compiledPath, JSON.stringify({ strategyConfig: { N: 3, volumeFactor: 0.9, atrStop: 1.0, targetR: 1.2, qty: 100 } }, null, 2), 'utf8');
  }
  const compiled = JSON.parse(fs.readFileSync(compiledPath,'utf8'));

  // 3) start backtest via server
  const start = await httpJson('POST', `${apiBase}/api/backtest/start`, { symbols, from, to, interval, mode, categoryKey });
  if (!start.ok || !start.json?.ok){ console.error('STEP3 failed', start.status, start.text); process.exit(4); }
  const jobId = start.json.jobId;

  // 4) poll status until done/error
  let runId=null, resultsPath=null; let lastStatus=null; const t0=Date.now();
  while (true){
    const st = await httpJson('GET', `${apiBase}/api/backtest/status?jobId=${encodeURIComponent(jobId)}`);
    if (!st.ok || !st.json?.ok){ console.error('STEP4 status poll failed', st.status, st.text); process.exit(5); }
    const j = st.json; lastStatus = j;
    if (j.status === 'done') { runId = j.runId; resultsPath = j.resultsPath; break; }
    if (j.status === 'error' || j.status === 'failed') { console.error('STEP4 job failed. Last logs:\n'+(j.logs||[]).slice(-200).join('\n')); process.exit(6); }
    if ((Date.now()-t0) > 30*60*1000) { console.error('STEP4 timeout'); process.exit(7); }
    await new Promise(r=>setTimeout(r, 1000));
  }
  if (!runId) { console.error('No runId produced'); process.exit(8); }

  // 5) validate & normalize job JSON
  const jobsDir = path.resolve('backend','jobs');
  const jobPath = path.join(jobsDir, `job_${runId}.json`);
  const altJobPath = path.resolve('chenna-CTS','backend','jobs', `job_${runId}.json`);
  // wait a bit for worker to flush job file
  let waitMs = 0; while (waitMs < 5000 && !fs.existsSync(jobPath) && !fs.existsSync(altJobPath)) { await new Promise(r=>setTimeout(r, 250)); waitMs += 250; }
  let finalJobPath = fs.existsSync(jobPath) ? jobPath : (fs.existsSync(altJobPath) ? altJobPath : jobPath);
  // If still missing, synthesize job JSON from results file
  if (!fs.existsSync(finalJobPath)) {
    try {
      const resTxt = fs.readFileSync(resultsPath, 'utf8');
      const res = JSON.parse(resTxt);
      // Build minimal job object
      const perSymbolTrades = {};
      if (Array.isArray(res.trades)) {
        for (const t of res.trades) { const s = t.symbol; if (!perSymbolTrades[s]) perSymbolTrades[s]=[]; perSymbolTrades[s].push(t); }
      }
      const perSymbol = {};
      for (const s of Object.keys(perSymbolTrades)) perSymbol[s] = { trades: perSymbolTrades[s], metrics: {} };
      const jobObj = { runId, status: 'done', summary: { totalPnL: res?.metrics?.netPnl||0, winRate: res?.metrics?.winRate||0, tradesCount: res?.metrics?.trades||0, avgReturn: res?.metrics?.avgReturn||0, maxDrawdown: res?.metrics?.maxDrawdown||0 }, perSymbol, insights: [], createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), error: null };
      fs.mkdirSync(path.dirname(finalJobPath), { recursive: true });
      fs.writeFileSync(finalJobPath, JSON.stringify(jobObj, null, 2), 'utf8');
      console.log('INFO synthesized job JSON at', finalJobPath);
    } catch (e) {
      console.error('job JSON not found and synthesis failed:', e && e.message);
    }
  }
  {
  const r1 = await run('node', ['tools/validateBacktestResult.cjs','--in', finalJobPath]);
    if (r1.code !== 0) { console.error('STEP5 validation failed. Last 200 lines:\n'+r1.logs.join('\n')); process.exit(r1.code); }
  const r2 = await run('node', ['tools/normalize_job.cjs','--in', finalJobPath]);
    if (r2.code !== 0) { console.error('STEP5 normalize failed. Last 200 lines:\n'+r2.logs.join('\n')); process.exit(r2.code); }
  }

  // 6) summary report
  const outDir = path.resolve('backend','strategy','output');
  const summaryPath = path.join(outDir, `${runId}-summary.md`);
  {
  const r = await run('node', ['tools/summary_report.cjs','--job', finalJobPath, '--out', summaryPath]);
    if (r.code !== 0) { console.error('STEP6 summary failed. Last 200 lines:\n'+r.logs.join('\n')); process.exit(r.code); }
  }

  // 7) optional optimizer + generate live strategy from best
  let optimizerPath = null;
  if (doOptimize) {
    optimizerPath = path.join(outDir, `${runId}-optimizer.json`);
    const r = await run('node', ['backend/strategy/optimizer.cjs','--from',from,'--to',to,'--interval',interval,'--mode',mode,'--symbols',symbols.join(','),'--out',optimizerPath]);
    if (r.code !== 0) { console.error('STEP7 optimizer failed. Last 200 lines:\n'+r.logs.join('\n')); process.exit(r.code); }
  }
  // 7b) event-level time travel (if categoryKey present)
  let eventsAuditPath = null, eventsPath = null, eventsReportPath = null;
  if (categoryKey) {
    // pick first audit matching runId for symbol-date events (fallback to the just-finished run audit if exists)
    const auditCandidate = path.join(outDir, `${runId}-audit.json`);
    if (fs.existsSync(auditCandidate)) eventsAuditPath = auditCandidate;
    else {
      // search for any prior audit with same categoryKey and 233 examples
      const files = fs.readdirSync(outDir).filter(f=>f.endsWith('-audit.json')).map(f=>path.join(outDir,f));
      for (const f of files){
        try { const j = JSON.parse(fs.readFileSync(f,'utf8')); if ((j.inputs?.categoryKey || j.categoryKey) === categoryKey && Array.isArray(j.inputs?.examples) && j.inputs.examples.length === 233){ eventsAuditPath = f; break; } } catch(_){}
      }
    }
    if (eventsAuditPath) {
      eventsPath = path.join(outDir, `${runId}-events.json`);
      const rEv = await run('node', ['tools/expand_category_events.cjs','--audit', eventsAuditPath,'--out', eventsPath]);
      if (rEv.code === 0) {
        eventsReportPath = path.join(outDir, `${runId}-events.report.json`);
        const rRep = await run('node', ['tools/report_category_events.cjs','--in', eventsPath,'--out', eventsReportPath]);
        if (rRep.code !== 0) { console.error('STEP7b events report failed. Last 200 lines:\n'+rRep.logs.join('\n')); }
      } else {
        console.error('STEP7b expand events failed. Last 200 lines:\n'+rEv.logs.join('\n'));
      }
    }
  }
  const liveCfgPath = path.join(outDir, `${runId}-strategyConfig.json`);
  {
    const argsGen = ['tools/generate_strategy_from_best.cjs','--job', finalJobPath, '--out', liveCfgPath];
    if (optimizerPath) { argsGen.push('--optimizer', optimizerPath); }
    const r = await run('node', argsGen);
    if (r.code !== 0) { console.error('STEP7 generate failed. Last 200 lines:\n'+r.logs.join('\n')); process.exit(r.code); }
  }

  // 8) done
  console.log(JSON.stringify({ ok:true, jobId, runId, resultsPath, jobPath: finalJobPath, summaryPath, liveCfgPath, compiledPath, optimizerPath, eventsPath, eventsReportPath }, null, 2));
})();
