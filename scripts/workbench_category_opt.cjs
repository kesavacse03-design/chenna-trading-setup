#!/usr/bin/env node
// Category Strategy Workbench: iterative optimization for CompositeStrategy
// Usage: node scripts/workbench_category_opt.cjs --category DOWNSIDE_LOM_SWING --accuracy 0.55 --budgetSec 1200 --checkpoint backend/strategy/output/DOWNSIDE_LOM_SWING.ckpt.json
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildCandidates } = require('../backend/strategy/candidateGenerator.cjs');
const { optimize } = require('../backend/strategy/optimizer.cjs');

function readTxtList(p){ try{ return fs.readFileSync(p,'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean) }catch(_){ return [] } }

function loadEvents(category){
  const p = path.resolve('tmp/category_events', `${category}.events.json`);
  if (!fs.existsSync(p)) throw new Error(`events missing for ${category}`);
  return JSON.parse(fs.readFileSync(p,'utf8'));
}

function usage(){ console.log('Usage: node scripts/workbench_category_opt.cjs --category <KEY> [--accuracy 0.55] [--budgetSec 1800] [--checkpoint <path>]'); }

(async function main(){
  const args = process.argv.slice(2); let category=null, targetAcc=0.55, budget=1800, ckptPath=null;
  for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1];
    if (a==='--category'){ category=n; i++; } else if (a==='--accuracy'){ targetAcc=Number(n); i++; }
    else if (a==='--budgetSec'){ budget=Number(n); i++; } else if (a==='--checkpoint'){ ckptPath=n; i++; }
  }
  if (!category){ usage(); process.exit(2); }
  const catDir = path.resolve('backend/strategy/category', category);
  const symbolsFile = path.join(catDir, 'symbols.txt');
  const symbols = readTxtList(symbolsFile);
  const eventsJson = loadEvents(category);
  const from = eventsJson.events && eventsJson.events.length ? eventsJson.events.reduce((a,b)=> a<b.date? a : b.date, eventsJson.events[0].date) : '2025-10-01';
  const to = eventsJson.events && eventsJson.events.length ? eventsJson.events.reduce((a,b)=> a>b.date? a : b.date, eventsJson.events[0].date) : '2025-10-31';

  const ckpt = ckptPath && fs.existsSync(ckptPath) ? JSON.parse(fs.readFileSync(ckptPath,'utf8')) : { best:null, iters:[], startedAt: new Date().toISOString(), category };

  const pool = {
    ema_short: [5,8,13],
    ema_long: [34,50,89],
    rsi_period: [7,14],
    rsi_min: [15,20,25],
    rsi_max: [70,75,80],
    atr_mult: [0.8,1.0,1.2],
    volumeFactor: [0.8,1.0,1.2],
    targetR: [1.0,1.2,1.5],
    patterns: ['none','engulfing','hammer']
  };
  const candidates = buildCandidates(pool, { maxCombos: 140 });

  // iterate in batches
  const deadline = Date.now() + (budget*1000);
  let batch = 0; let best = ckpt.best; let cursor = ckpt.iters.length; // resume from previous length if exists
  while(Date.now() < deadline && cursor < candidates.length){
    const slice = candidates.slice(cursor, Math.min(candidates.length, cursor+18));
    cursor += slice.length; batch++;
    // Run optimizer with slice as grid via override: we call optimize with combosFromGrid by mapping each candidate as a single choice
    const grid = { candidate: slice.map((cfg, idx)=> ({ idx, cfg })) };
    // monkey-patch combinationsFromGrid by mapping to cfg
    const res = await (async ()=>{
      const { combinationsFromGrid } = require('../backend/strategy/optimizer.cjs');
      function combos(g){ const keys = Object.keys(g); const list = keys.length? g[keys[0]] : []; return list.map(x=>x.cfg); }
      const { runBacktest } = require('../backend/strategy/backtester.cjs');
      const parallel = 4; const deadlineLocal = Date.now() + 600*1000; let results = [];
      let idx=0; const hooks = { onLog:()=>{}, onProgress:()=>{}, isCancelled:()=>Date.now()>deadlineLocal };
      async function worker(){
        while(true){ if (Date.now()>deadlineLocal) break; if (idx>=slice.length) break; const mi = idx++; const cfg = slice[mi];
          try{
            const out = await runBacktest({ symbols, from, to, interval:'day', mode:'mock', strategyKind:'composite', strategyConfig: cfg }, hooks);
            const j = JSON.parse(fs.readFileSync(out.resultsPath,'utf8'));
            const m = j && j.metrics ? j.metrics : null;
            results.push({ config: cfg, metrics: m, runId: out.runId, resultsPath: out.resultsPath });
          }catch(e){ results.push({ config: cfg, metrics: null, error: String(e && e.message || e) }); }
        }
      }
      await Promise.all(Array.from({length: parallel}, ()=>worker()));
      // sort by accuracy then expectancy (profitFactor proxy) then netPnl
      results.sort((a,b)=>{
        const wa = a.metrics?.winRate ?? 0, wb = b.metrics?.winRate ?? 0; if (wb!==wa) return wb-wa;
        const pa = a.metrics?.profitFactor ?? 0, pb = b.metrics?.profitFactor ?? 0; if (pb!==pa) return pb-pa;
        const na = a.metrics?.netPnl ?? 0, nb = b.metrics?.netPnl ?? 0; return nb-na;
      });
      return { ranked: results };
    })();

    const top = res.ranked[0];
    const iterRec = { batch, tested: slice.length, top: { config: top?.config || null, metrics: top?.metrics || null } };
    ckpt.iters.push(iterRec);
    if (!best || ((top?.metrics?.winRate||0) > (best?.metrics?.winRate||0))) best = top;
    ckpt.best = best;
    if (ckptPath){ fs.mkdirSync(path.dirname(ckptPath), { recursive: true }); fs.writeFileSync(ckptPath, JSON.stringify(ckpt, null, 2),'utf8'); }
    // early stop if target met
    if ((best?.metrics?.winRate||0) >= targetAcc) break;
  }

  // persist outputs
  const outDir = path.resolve('backend/strategy/output');
  fs.mkdirSync(outDir, { recursive: true });
  const bestCfgPath = path.join(outDir, 'strategyConfig.best.json');
  fs.writeFileSync(bestCfgPath, JSON.stringify(ckpt.best?.config || {}, null, 2),'utf8');
  const reportPath = path.join(outDir, `${category}.events.report.json`);
  // Try to pull the latest event aggregate for category (best run) if exists
  const evAggPath = path.resolve('backend/strategy/output', `run-events-${category}.best.json`);
  let eventAggregate = null; if (fs.existsSync(evAggPath)) { try { const ev = JSON.parse(fs.readFileSync(evAggPath,'utf8')); eventAggregate = ev.aggregate || null; } catch(_){} }
  const rep = {
    category,
    targetAccuracy: targetAcc,
    achievedAccuracy: ckpt.best?.metrics?.winRate || 0,
    metrics: ckpt.best?.metrics || null,
    bestConfig: ckpt.best?.config || null,
    eventAggregate,
    iterations: ckpt.iters,
    startedAt: ckpt.startedAt,
    finishedAt: new Date().toISOString(),
    hostname: os.hostname(),
  };
  fs.writeFileSync(reportPath, JSON.stringify(rep, null, 2),'utf8');
  // persist checkpoint with aggregate
  if (ckptPath){
    ckpt.eventAggregate = eventAggregate || null;
    fs.writeFileSync(ckptPath, JSON.stringify(ckpt, null, 2),'utf8');
  }
  console.log('WORKBENCH DONE', { best: ckpt.best?.config, acc: ckpt.best?.metrics?.winRate });
})();
