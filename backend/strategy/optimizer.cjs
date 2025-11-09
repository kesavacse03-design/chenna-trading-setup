#!/usr/bin/env node
// Category-level grid-search optimizer for BreakoutStrategy
// Supports: symbols-file, grid parsing, parallelism (max 4), timeout, category aggregation
const fs = require('fs');
const path = require('path');
const os = require('os');

function product(arrays){ return arrays.reduce((acc, curr) => acc.flatMap(a => curr.map(b => [].concat(a, b))), [[]]); }
function parseGrid(str){
  // format: key:v1,v2;key2:v3,v4
  const out = {};
  if (!str) return out;
  for (const part of String(str).split(';')){
    const [k, vs] = part.split(':'); if (!k) continue; const vals = (vs||'').split(',').map(x=>x.trim()).filter(Boolean);
    out[k.trim()] = vals.map(v => isNaN(Number(v)) ? v : Number(v));
  }
  return out;
}

function combinationsFromGrid(grid){
  const keys = Object.keys(grid);
  if (!keys.length) return [];
  const arrays = keys.map(k => grid[k].map(v => ({ [k]: v })));
  const combos = product(arrays).map(arr => Object.assign({}, ...arr));
  return combos;
}

function pruneCombos(combos, limit=120){
  if (combos.length <= limit) return combos;
  // simple heuristic: prefer lower ema_short and higher ema_long then atr_mult midway, then random sample
  combos.sort((a,b)=>{
    const ea = a.ema_short ?? 0, eb = b.ema_short ?? 0; if (ea !== eb) return ea - eb;
    const la = a.ema_long ?? 0, lb = b.ema_long ?? 0; if (lb !== la) return lb - la;
    const aa = Math.abs((a.atr_mult??1.5)-1.5), ab = Math.abs((b.atr_mult??1.5)-1.5); return aa - ab;
  });
  const head = combos.slice(0, Math.min(limit-20, combos.length));
  // add a random tail to diversify
  const rest = combos.slice(head.length);
  const pick = Math.min(20, rest.length);
  // seeded randomness if SEED provided
  const seedEnv = process.env.SEED ? Number(process.env.SEED) : null;
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; } }
  const rnd = Number.isFinite(seedEnv) ? mulberry32(seedEnv) : Math.random;
  for (let i=0;i<pick;i++){ head.push(rest[Math.floor(rnd()*rest.length)]); }
  return head.slice(0, limit);
}

function compositeScore(m){
  if (!m) return -Infinity;
  const expectancy = (m.avgReturn || 0); // proxy
  const net = (m.netPnl || 0);
  const dd = Math.max(1, Math.abs(m.maxDrawdown || 0));
  const acc = (m.winRate || 0)/100;
  return +( (2.0*expectancy + 1.0*(net/Math.max(1, dd)) + 0.5*acc).toFixed(6) );
}

async function optimize({ symbols, from, to, interval, mode }, grid, { parallel=4, timeoutSec=1800, refine=true, searchMode='grid', resumeSet=null, runIdOverride=null, seed: seedOpt=null }={}){
  const { runBacktest } = require(path.resolve(__dirname, 'backtester.cjs'));
  // Seeded RNG
  const seedEnv = process.env.SEED ? Number(process.env.SEED) : null;
  const SEED = (seedOpt!=null?Number(seedOpt):null) ?? (Number.isFinite(seedEnv)?seedEnv:null);
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; } }
  const rand = Number.isFinite(SEED) ? mulberry32(SEED) : Math.random;
  let combos = combinationsFromGrid(grid);
  const originalCombos = combos.length;
  // Cap total combos at 500 per requirement (downselect heuristically then sample)
  const MAX_COMBOS = 500;
  if (combos.length > MAX_COMBOS) {
    combos = pruneCombos(combos, Math.min(MAX_COMBOS, 120));
    if (combos.length > MAX_COMBOS) combos = combos.slice(0, MAX_COMBOS);
  } else {
    combos = pruneCombos(combos, Math.min(120, combos.length));
  }
  // Resume filtering: drop configs already tried
  if (resumeSet && combos.length) {
    combos = combos.filter(cfg => !resumeSet.has(JSON.stringify(cfg)));
  }
  const { planConcurrency, startMonitor, detectResources } = require(path.resolve(__dirname, '..', 'metrics', 'resourceManager.cjs'));
  const resources = detectResources();
  const fracEnv = process.env.CPU_FRACTION ? Number(process.env.CPU_FRACTION) : null;
  const frac = (fracEnv && fracEnv>0 && fracEnv<=1) ? fracEnv : 0.8;
  parallel = planConcurrency(Math.max(1, Math.min(8, Number(parallel)||1)), frac);
  const runId = runIdOverride || `opt-${Date.now()}`;
  const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
  const logPath = path.join(jobsDir, `run_${runId}_logs.txt`);
  function log(line){ try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8'); } catch(_){} }
  function logProgress(line){ log(line); try { console.log(line); } catch(_){} }
  log(`RUN_START ${runId} mode=${searchMode} cpuCores=${resources.cpuCores} gpuDevices=${resources.gpuDevices}`);
  const deadline = Date.now() + (Number(timeoutSec)||1800)*1000;
  let results = []; let idx = 0; let cancelled=false;
  const totalCombos = combos.length;
  const progressEvery = Math.max(1, Math.floor(totalCombos/20)); // ~5% increments
  const cpuLimitEnv = process.env.CPU_LIMIT ? Number(process.env.CPU_LIMIT) : null;
  const cpuSamples = [];
  const monitor = startMonitor({ intervalMs:1200, cpuLimit: cpuLimitEnv || 80, onThrottle:(u)=>{ log(`RUN_THROTTLED cpu=${u.cpuPercent}% reduce parallel`); parallel=Math.max(1, parallel-1); }, onSample:(u)=>{ if (u && typeof u.cpuPercent==='number') cpuSamples.push(u.cpuPercent); } });
  async function worker(){
    while(!cancelled){ if (Date.now()>deadline){ cancelled=true; break; } if (idx>=combos.length) break; const my=idx++; const cfg=combos[my];
  try { const out = await runBacktest({ symbols, from, to, interval, mode, strategyConfig: cfg }, { onLog:()=>{}, onProgress:()=>{}, isCancelled:()=> Date.now()>deadline }); let summary=null; let swing10=null; try { const j=JSON.parse(fs.readFileSync(out.resultsPath,'utf8')); summary=j?.metrics||null; swing10=j?.swing10||null; } catch(_){} results.push({ config:cfg, runId: out.runId, resultsPath: out.resultsPath, metrics: summary, swing10 }); if (results.length % progressEvery === 0 || results.length === totalCombos) { logProgress(`PROGRESS ${results.length}/${totalCombos} ${(100*results.length/totalCombos).toFixed(1)}% elapsedMs=${Date.now()-(deadline-(Number(timeoutSec)||1800)*1000)}`); } }
      catch(e){ results.push({ config:cfg, runId:null, resultsPath:null, metrics:null, error:String(e&&e.message||e) }); }
    }
  }
  async function runWorkers(p){ const workers = Array.from({length:p}, ()=> worker()); await Promise.all(workers); }
  await runWorkers(parallel);
  // Bayesian stage
  if (!cancelled && Date.now()<=deadline && (searchMode==='bayes' || searchMode==='hybrid')){
    log('BAYES_STAGE start');
    const top = results.slice(0, Math.min(5, results.length));
  const bayesCombos=[]; function perturb(base){ const out={...base}; for (const k of Object.keys(out)){ if (typeof out[k]==='number'){ const d=(rand()<0.5?-1:1)*(k.includes('ema')?2:(k.includes('atr')?0.25:0.1)); out[k]=+(out[k]+d); if (/ema_short/.test(k)) out[k]=Math.max(2,out[k]); if (/ema_long/.test(k)) out[k]=Math.max(out.ema_short||2,out[k]); if (/atr_mult/.test(k)) out[k]=+Math.max(0.5,out[k]).toFixed(2); if (/volumeFactor/.test(k)) out[k]=+Math.max(0.1,out[k]).toFixed(2); } } return out; }
    for (const r of top){ for (let i=0;i<4;i++) bayesCombos.push(perturb(r.config||{})); }
    let bIdx=0; const bayesResults=[]; async function bayesWorker(){ while(!cancelled){ if (Date.now()>deadline) break; if (bIdx>=bayesCombos.length) break; const cfg=bayesCombos[bIdx++]; try { const out=await runBacktest({ symbols, from, to, interval, mode, strategyConfig: cfg }, { onLog:()=>{}, onProgress:()=>{}, isCancelled:()=> Date.now()>deadline }); let summary=null; let swing10=null; try { const j=JSON.parse(fs.readFileSync(out.resultsPath,'utf8')); summary=j?.metrics||null; swing10=j?.swing10||null; } catch(_){} bayesResults.push({ config:cfg, runId: out.runId, resultsPath: out.resultsPath, metrics: summary, swing10 }); } catch(e){ bayesResults.push({ config:cfg, runId:null, resultsPath:null, metrics:null, error:String(e&&e.message||e) }); } } }
    await Promise.all(Array.from({length: parallel}, ()=> bayesWorker()));
    results = results.concat(bayesResults); log('BAYES_STAGE done');
  }
  // Genetic stage
  if (!cancelled && Date.now()<=deadline && (searchMode==='genetic' || searchMode==='hybrid')){
  log('GENETIC_STAGE start'); const parents=results.slice(0, Math.min(10, results.length)); const children=[]; function mutate(base){ const out={...base}; for (const k of Object.keys(out)){ if (typeof out[k]==='number'){ const s=k.includes('ema')?3:(k.includes('atr')?0.3:0.15); out[k]=+(out[k]+(rand()<0.5?-1:1)*s); if (/ema_short/.test(k)) out[k]=Math.max(2,out[k]); if (/ema_long/.test(k)) out[k]=Math.max(out.ema_short||2,out[k]); if (/atr_mult/.test(k)) out[k]=+Math.max(0.5,out[k]).toFixed(2); if (/volumeFactor/.test(k)) out[k]=+Math.max(0.1,out[k]).toFixed(2); } } return out; }
    for (const p of parents){ for (let i=0;i<3;i++) children.push(mutate(p.config||{})); }
    let gIdx=0; const genResults=[]; async function genWorker(){ while(!cancelled){ if (Date.now()>deadline) break; if (gIdx>=children.length) break; const cfg=children[gIdx++]; try { const out=await runBacktest({ symbols, from, to, interval, mode, strategyConfig: cfg }, { onLog:()=>{}, onProgress:()=>{}, isCancelled:()=> Date.now()>deadline }); let summary=null; let swing10=null; try { const j=JSON.parse(fs.readFileSync(out.resultsPath,'utf8')); summary=j?.metrics||null; swing10=j?.swing10||null; } catch(_){} genResults.push({ config:cfg, runId: out.runId, resultsPath: out.resultsPath, metrics: summary, swing10 }); } catch(e){ genResults.push({ config:cfg, runId:null, resultsPath:null, metrics:null, error:String(e&&e.message||e) }); } } }
    await Promise.all(Array.from({length: parallel}, ()=> genWorker())); results = results.concat(genResults); log('GENETIC_STAGE done');
  }
  // Adaptive tuning stage (SMART) if refine true and top expectancy <=0 or winRate below threshold
  if (!cancelled && refine && Date.now()<=deadline) {
    const topCurrent = results[0];
    const exp = topCurrent?.metrics?.avgReturn || 0;
    const win = topCurrent?.metrics?.winRate || 0;
    if (exp <= 0 || win < 40) {
      log('ADAPT_STAGE start');
      const baseCfg = topCurrent?.config || {};
      // generate adaptive variants tweaking EMA ratios, ATR multiplier, and volumeFactor heuristically
      function adaptVariants(cfg){
        const out=[]; const s=cfg.ema_short||8, l=cfg.ema_long||55;
        const ratios=[0.5,0.6,0.7];
        for (const r of ratios){ out.push({ ...cfg, ema_short: Math.max(2, Math.round(l*r)), ema_long: l }); }
        out.push({ ...cfg, atr_mult: +( (cfg.atr_mult||1.5) * 0.8 ).toFixed(2) });
        out.push({ ...cfg, atr_mult: +( (cfg.atr_mult||1.5) * 1.2 ).toFixed(2) });
        out.push({ ...cfg, volumeFactor: +( (cfg.volumeFactor||1.0) * 0.85 ).toFixed(2) });
        out.push({ ...cfg, volumeFactor: +( (cfg.volumeFactor||1.0) * 1.15 ).toFixed(2) });
        return out;
      }
      const adaptCombos = adaptVariants(baseCfg);
      let aIdx=0; const adaptResults=[];
      async function adaptWorker(){
        while(!cancelled){ if (Date.now()>deadline) break; if (aIdx>=adaptCombos.length) break; const cfg=adaptCombos[aIdx++];
          try { const out=await runBacktest({ symbols, from, to, interval, mode, strategyConfig: cfg }, { onLog:()=>{}, isCancelled:()=> Date.now()>deadline }); let summary=null; let swing10=null; try { const j=JSON.parse(fs.readFileSync(out.resultsPath,'utf8')); summary=j?.metrics||null; swing10=j?.swing10||null; } catch(_){} adaptResults.push({ config:cfg, runId: out.runId, resultsPath: out.resultsPath, metrics: summary, swing10 }); }
          catch(e){ adaptResults.push({ config:cfg, runId:null, resultsPath:null, metrics:null, error:String(e&&e.message||e) }); }
        }
      }
      await Promise.all(Array.from({length: Math.min(parallel,2)}, ()=> adaptWorker()));
      results = results.concat(adaptResults);
      log('ADAPT_STAGE done');
      // re-sort after adaptation
      results.sort((a,b)=>{ const ca=compositeScore(a.metrics); const cb=compositeScore(b.metrics); if (cb!==ca) return cb-ca; const sA=a.swing10?.successRateWithin10Days??-1; const sB=b.swing10?.successRateWithin10Days??-1; if (sB!==sA) return sB-sA; return (b.metrics?.netPnl??0) - (a.metrics?.netPnl??0); });
    }
  }
  try { monitor.stop(); } catch(_){}
  const timedOut = Date.now()>deadline;
  const avgCpuPercent = cpuSamples.length ? +(cpuSamples.reduce((a,b)=>a+b,0)/cpuSamples.length).toFixed(1) : null;
  results.sort((a,b)=>{ const ca=compositeScore(a.metrics); const cb=compositeScore(b.metrics); if (cb!==ca) return cb-ca; const sA=a.swing10?.successRateWithin10Days??-1; const sB=b.swing10?.successRateWithin10Days??-1; if (sB!==sA) return sB-sA; return (b.metrics?.netPnl??0) - (a.metrics?.netPnl??0); });
  try {
  const topNBase = results.slice(0,5).map((r,i)=>({ rank:i+1, score: compositeScore(r.metrics), metrics:r.metrics, config:r.config, runId:r.runId }));
  // 3-fold lightweight validation for each top candidate (reuse symbol partition but only K=3)
  const topN = [];
  for (const cand of topNBase){
    let v3 = null;
    try {
      const K3 = 3;
      const folds3 = []; for (let i=0;i<K3;i++) folds3.push([]);
      symbols.forEach((s,i)=> folds3[i % K3].push(s));
      const foldMetrics3 = [];
      for (let i=0;i<folds3.length;i++){
        const fsym = folds3[i]; if (!fsym.length) { foldMetrics3.push(null); continue; }
        try {
          const fb = await runBacktest({ symbols: fsym, from, to, interval, mode, strategyConfig: cand.config, disableShadow:true }, { onLog:()=>{}, isCancelled:()=>false });
          let m=null; try { const j=JSON.parse(fs.readFileSync(fb.resultsPath,'utf8')); m=j?.metrics||null; } catch(_){ }
          foldMetrics3.push(m);
        } catch(e){ foldMetrics3.push(null); }
      }
      const validFolds3 = foldMetrics3.filter(m=>m && typeof m.netPnl==='number');
      if (validFolds3.length){
        const agg3 = validFolds3.reduce((acc,m)=>{ acc.trades += (m.trades||0); acc.netPnl += (m.netPnl||0); acc.wins += (m.wins||0); acc.losses += (m.losses||0); acc.maxDrawdown = Math.min(acc.maxDrawdown, (m.maxDrawdown||0)); acc.avgReturn += (m.avgReturn||0); return acc; }, { trades:0, netPnl:0, wins:0, losses:0, maxDrawdown: Infinity, avgReturn:0 });
        agg3.avgReturn = +(agg3.avgReturn/validFolds3.length).toFixed(4);
        if (!isFinite(agg3.maxDrawdown)) agg3.maxDrawdown = 0;
        v3 = { K: K3, folds: folds3.map((f,i)=>({ index:i, symbols:f, metrics: foldMetrics3[i]||null })), aggregated: agg3 };
      } else {
        v3 = { K: K3, folds: folds3.map((f,i)=>({ index:i, symbols:f, metrics: foldMetrics3[i]||null })), aggregated: null };
      }
    } catch(_){ }
    topN.push(Object.assign({}, cand, { validation3: v3 }));
  }
  const baseSuccess = topN[0]?.metrics?.avgReturn || 0;
  const successRate10 = topN[0]?.swing10?.successRateWithin10Days ?? null;
  const summaryText = `Run completed cpuAvg=${avgCpuPercent??'NA'}% combos=${combos.length} mode=${searchMode} topExpectancy=${baseSuccess.toFixed(4)}${successRate10!==null?` successWithin10Days=${successRate10}%`:''}`;
  const summary={ runId, searchMode, combosTried: combos.length, results: results.length, timedOut: !!timedOut, topN, summaryText, avgCpuPercent };
    fs.writeFileSync(path.join(jobsDir, `run_${runId}_report.json`), JSON.stringify(summary,null,2),'utf8');
    // Real K-fold validation & auto-promotion
    if (!timedOut && results.length){
      const top = results[0];
      const Kenv = Number(process.env.OPT_KFOLD||0);
      const K = Kenv>0 ? Kenv : Math.min(5, Math.max(2, Math.floor(symbols.length/Math.max(1,Math.ceil(symbols.length/12))) ));
      // Partition symbols into K folds
      const folds = []; for (let i=0;i<K;i++) folds.push([]);
      symbols.forEach((s,i)=> folds[i % K].push(s));
      const foldMetrics=[];
      for (let i=0;i<folds.length;i++){
        const foldSyms = folds[i]; if (!foldSyms.length) { foldMetrics.push(null); continue; }
        try {
          const fb = await runBacktest({ symbols: foldSyms, from, to, interval, mode, strategyConfig: top.config, disableShadow:true }, { onLog:()=>{}, isCancelled:()=>false });
          let m=null; try { const j=JSON.parse(fs.readFileSync(fb.resultsPath,'utf8')); m=j?.metrics||null; } catch(_){ }
          foldMetrics.push(m);
        } catch(e){ foldMetrics.push(null); }
      }
      // Aggregate validation metrics
      const validFolds = foldMetrics.filter(m=>m && typeof m.netPnl==='number');
      const agg = validFolds.reduce((acc,m)=>{ acc.trades += (m.trades||0); acc.netPnl += (m.netPnl||0); acc.wins += (m.wins||0); acc.losses += (m.losses||0); acc.maxDrawdown = Math.min(acc.maxDrawdown, (m.maxDrawdown||0)); acc.avgReturn += (m.avgReturn||0); return acc; }, { trades:0, netPnl:0, wins:0, losses:0, maxDrawdown: Infinity, avgReturn:0 });
      if (validFolds.length){ agg.avgReturn = +(agg.avgReturn/validFolds.length).toFixed(4); if (!isFinite(agg.maxDrawdown)) agg.maxDrawdown = 0; }
      // Expectancy proxy: avgReturn must be > 0
      const minTrades = Number(process.env.PROMO_MIN_TRADES||30);
      const maxDdAllowed = Number(process.env.PROMO_MAX_DRAWDOWN||50000); // configurable
      const expectancy = agg.avgReturn || (top.metrics?.avgReturn||0);
      const drawdown = (agg.maxDrawdown!==Infinity?agg.maxDrawdown:(top.metrics?.maxDrawdown||0));
      const trades = agg.trades || (top.metrics?.trades||0);
      const promotable = (expectancy > 0) && (drawdown >= -maxDdAllowed) && (trades >= minTrades);
  const promoSummary = `Top candidate expectancy=${expectancy.toFixed(4)} trades=${trades} drawdown=${drawdown} promoted=${promotable} cpuAvg=${avgCpuPercent??'NA'}%`;
  const gitCommit = (()=>{ try { return fs.readFileSync(path.resolve(process.cwd(), '.git', 'HEAD'), 'utf8').trim(); } catch(_) { return null; } })();
  const seed = Number(process.env.SEED||process.env.RAND_SEED||0) || null;
  const promotionRecord = { strategy: top.config, runId: top.runId, optimizerRunId: runId, expectancy, drawdown, trades, kfold: { K, folds: folds.map((f,i)=>({ index:i, symbols:f, metrics: foldMetrics[i] || null })), validatedFolds: validFolds.length, validationTrades: agg.trades }, promoted: promotable, thresholds: { minTrades, maxNegativeDrawdown: -maxDdAllowed, expectancyPositive: true }, summaryText: promoSummary, avgCpuPercent, gitCommit, seed };
      // Back-compat file
      fs.writeFileSync(path.join(jobsDir, `run_${runId}_promotion.json`), JSON.stringify(promotionRecord, null, 2), 'utf8');
      // New structured location
      try { fs.mkdirSync(path.join(jobsDir, 'promotion_records'), { recursive: true }); } catch(_){ }
      const promoName = `opt_${runId}_top1.json`;
      fs.writeFileSync(path.join(jobsDir, 'promotion_records', promoName), JSON.stringify(promotionRecord, null, 2), 'utf8');
      log(`PROMOTION_CHECK runId=${runId} promoted=${promotable} trades=${trades} drawdown=${drawdown}`);
      if (promotable) log(`TOP_CANDIDATE_PROMOTED runId=${runId}`);
    }
  } catch(_){ }
  log(`RUN_END ${runId} combos=${combos.length} results=${results.length} timedOut=${timedOut}`);
  return { grid, combos: combos.length, ranked: results, timedOut, runId, logPath, avgCpuPercent };
}

// Optimize over an explicit list of candidate configs (e.g., composite strategy)
async function optimizeCandidates({ symbols, from, to, interval, mode }, candidates, { parallel=4, timeoutSec=1800 }={}){
  const { runBacktest } = require(path.resolve(__dirname, 'backtester.cjs'));
  const osCpus = (()=>{ try { return require('os').cpus()?.length || 4; } catch { return 4; } })();
  parallel = Math.max(1, Math.min(osCpus, Number(parallel)||1));
  const deadline = Date.now() + (Number(timeoutSec)||1800)*1000;
  const combos = Array.isArray(candidates) ? candidates.slice() : [];
  let results = []; let idx = 0; let cancelled = false;
  async function worker(){
    while(!cancelled){
      if (Date.now() > deadline) { cancelled = true; break; }
      if (idx >= combos.length) break; const myIdx = idx++;
      const cfg = combos[myIdx];
      const hooks = { onLog: ()=>{}, onProgress: ()=>{}, isCancelled: ()=> Date.now()>deadline };
      try {
        const out = await runBacktest({ symbols, from, to, interval, mode, strategyConfig: cfg }, hooks);
        let summary = null; try { const j = JSON.parse(fs.readFileSync(out.resultsPath,'utf8')); summary = j?.metrics || null; } catch(_){ }
        results.push({ config: cfg, runId: out.runId, resultsPath: out.resultsPath, tradesPath: out.tradesPath, metrics: summary });
      } catch (e) { results.push({ config: cfg, runId: null, resultsPath: null, tradesPath: null, metrics: null, error: String(e && e.message || e) }); }
    }
  }
  await Promise.all(Array.from({length: parallel}, ()=> worker()));
  // Rank by netPnl, then winRate, then profitFactor
  results.sort((a,b)=>{
    const na = a.metrics?.netPnl ?? 0; const nb = b.metrics?.netPnl ?? 0; if (nb!==na) return nb-na;
    const wa = a.metrics?.winRate ?? 0; const wb = b.metrics?.winRate ?? 0; if (wb!==wa) return wb-wa;
    const pa = a.metrics?.profitFactor ?? 0; const pb = b.metrics?.profitFactor ?? 0; return pb-pa;
  });
  return { ranked: results, combos: combos.length, timedOut: Date.now()>deadline };
}

async function main(){
  const args = process.argv.slice(2);
  let from=null,to=null,interval='day',mode='mock',symbols=[], symbolsFile=null; let outPath=null, outCsv=null, metric='netPnl', aggregate='category', gridStr=null, parallel=4, timeout=1800; let search='grid', smart=false, resumeFile=null;
  for (let i=0;i<args.length;i++){
    const a=args[i], n=args[i+1];
    if (a==='--from') { from=n; i++; }
    else if (a==='--to') { to=n; i++; }
    else if (a==='--interval') { interval=n; i++; }
    else if (a==='--mode') { mode=n; i++; }
    else if (a==='--symbols') { symbols = n?n.split(',').map(s=>s.trim()).filter(Boolean):[]; i++; }
    else if (a==='--symbols-file') { symbolsFile=n; i++; }
    else if (a==='--out') { outPath = n; i++; }
    else if (a==='--csv') { outCsv = n; i++; }
    else if (a==='--metric') { metric = n; i++; }
    else if (a==='--aggregate') { aggregate = n; i++; }
    else if (a==='--grid') { gridStr = n; i++; }
    else if (a==='--parallel') { parallel = Number(n); i++; }
    else if (a==='--timeout') { timeout = Number(n); i++; }
    else if (a==='--search') { search = n; i++; }
    else if (a==='--smart') { smart = true; }
    else if (a==='--resume-file') { resumeFile = n; i++; }
  }
  if ((!symbols || !symbols.length) && symbolsFile){ try { const txt = fs.readFileSync(symbolsFile,'utf8'); symbols = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); } catch(_){} }
  if (!from || !to || !symbols.length || !outPath){
    console.log('Usage: node backend/strategy/optimizer.cjs --symbols-file tmp/category_symbols.txt --from YYYY-MM-DD --to YYYY-MM-DD --out jobs/job_opt_run.json --csv strategy/output/job_opt_run.csv --grid "ema_short:8,13,21;ema_long:50,89;atr_mult:1.0,1.5,2.0" --search grid|bayes|genetic|hybrid [--smart] [--resume-file jobs/run_prev_report.json] --parallel 4 --timeout 1800');
    process.exit(2);
  }
  // Smart mode defaults
  if (smart) { search = 'hybrid'; }
  let grid = parseGrid(gridStr);
  if ((!grid || !Object.keys(grid).length) && smart) {
    grid = parseGrid('ema_short:8,13,21;ema_long:55,89;atr_mult:1.2,1.5,1.8;volumeFactor:0.9,1.0,1.1');
  }
  // Resume set
  let resumeSet = null;
  if (resumeFile) {
    try {
      const rep = JSON.parse(fs.readFileSync(resumeFile,'utf8'));
      const tried = (rep.ranked || rep.results || []).map(r=> r.config || r);
      if (Array.isArray(tried) && tried.length) {
        resumeSet = new Set(tried.filter(Boolean).map(c=> JSON.stringify(c)));
      }
    } catch(_){}
  }
  try {
    const res = await optimize({ symbols, from, to, interval, mode }, grid, { parallel, timeoutSec: timeout, searchMode: search, refine: smart || true, resumeSet });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ createdAt: new Date().toISOString(), parameters: { symbols, from, to, interval, mode, grid, metric, aggregate }, combos: res.combos, ranked: res.ranked, timedOut: !!res.timedOut }, null, 2), 'utf8');
    if (outCsv) {
      // write simple CSV of top-5
      const header = 'rank,netPnl,winRate,profitFactor,maxDrawdown,params\n';
      const rows = (res.ranked||[]).slice(0,5).map((r,i)=>`${i+1},${r.metrics?.netPnl||0},${r.metrics?.winRate||0},${r.metrics?.profitFactor||0},${r.metrics?.maxDrawdown||0},${JSON.stringify(r.config)}`);
      fs.mkdirSync(path.dirname(outCsv), { recursive: true });
      fs.writeFileSync(outCsv, header + rows.join('\n') + '\n', 'utf8');
    }
    console.log(res.timedOut ? 'OK optimizer wrote (partial due to timeout)' : 'OK optimizer wrote', outPath);
  } catch (e) {
    if (String(e && e.message).includes('TIMEOUT')) { console.error('ERR TIMEOUT'); process.exit(124); }
    console.error('ERR', String(e && e.message || e)); process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { optimize, optimizeCandidates, parseGrid, combinationsFromGrid };
