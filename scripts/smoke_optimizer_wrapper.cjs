#!/usr/bin/env node
// Wrapper to run optimizer then consolidate top candidate trades for smoke artifacts
const fs = require('fs');
const path = require('path');
const { optimize, parseGrid } = require('../backend/strategy/optimizer.cjs');

async function main(){
  const symbolsFile = process.argv[2];
  if (!symbolsFile) { console.error('usage: node scripts/smoke_optimizer_wrapper.cjs <symbolsFile>'); process.exit(2); }
  const symbols = fs.readFileSync(symbolsFile,'utf8').split(/\r?\n/).filter(Boolean).slice(0,50);
  const from='2025-10-01', to='2025-10-05', interval='day', mode='upstox';
  process.env.CTS_UPSTOX_MOCK='1';
  const grid = parseGrid('ema_short:8,13;ema_long:55,89;atr_mult:1.2,1.5;volumeFactor:0.9,1.0');
  const res = await optimize({ symbols, from, to, interval, mode }, grid, { parallel:3, timeoutSec:40, searchMode:'grid', refine:true });
  const jobsDir = path.resolve(__dirname, '..', 'backend', 'jobs');
  const reportPath = path.join(jobsDir, `run_prod_smoke_${res.runId}_report.json`);
  const tradesOut = path.join(jobsDir, `run_prod_smoke_${res.runId}_trades.csv`);
  const logsPath = path.join(jobsDir, `run_${res.runId}_logs.txt`);
  // copy existing top trades file of first run if present
  if (res.ranked[0] && res.ranked[0].resultsPath) {
    try {
      const j = JSON.parse(fs.readFileSync(res.ranked[0].resultsPath,'utf8'));
      const trades = ((j.perSymbol||{}) && Object.values(j.perSymbol).flatMap(ps=> ps.trades || [])) || [];
      const header='tradeId,symbol,entry,exit,pnl,qty,entryTime,exitTime,exitReason\n';
      const rows=trades.map(t=>`${t.tradeId},${t.symbol},${t.entry},${t.exit},${t.pnl},${t.qty},${t.entryTime},${t.time},${t.exitReason}`);
      fs.writeFileSync(tradesOut, header + rows.join('\n') + '\n','utf8');
    } catch(e){ console.error('WARN failed to write consolidated trades', e.message); }
  }
  fs.writeFileSync(reportPath, JSON.stringify({ runId: res.runId, summary: res.avgCpuPercent, combos: res.combos, topN: res.ranked.slice(0,5).map(r=>({ runId:r.runId, config:r.config, metrics:r.metrics })) }, null, 2), 'utf8');
  console.log('SMOKE_ARTIFACTS', JSON.stringify({ reportPath, tradesOut, logsPath }));
}

if (require.main === module) main();
