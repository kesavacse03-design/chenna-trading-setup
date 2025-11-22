#!/usr/bin/env node
// Normalize a job JSON to meet the schema expectations
const fs = require('fs');
const path = require('path');

function usage(){ console.log('Usage: node tools/normalize_job.cjs --in backend/jobs/job_<runId>.json --out backend/jobs/job_<runId>.json'); }
function readJson(p){ try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch (e) { return null; } }

function normalizeJob(obj){
  if (!obj || typeof obj !== 'object') return { status: 'failed', error: 'invalid-object' };
  obj.status = obj.status || 'done';
  obj.error = obj.error === undefined ? null : obj.error;
  obj.summary = obj.summary || { totalPnL: 0, winRate: 0, tradesCount: 0, avgReturn: 0, maxDrawdown: 0 };
  obj.perSymbol = obj.perSymbol || {};
  for (const sym of Object.keys(obj.perSymbol)){
    const entry = obj.perSymbol[sym] || {};
    entry.metrics = entry.metrics || { netPnl: 0, wins: 0, losses: 0 };
    entry.metrics.netPnl = typeof entry.metrics.netPnl === 'number' ? entry.metrics.netPnl : 0;
    entry.metrics.wins = typeof entry.metrics.wins === 'number' ? entry.metrics.wins : 0;
    entry.metrics.losses = typeof entry.metrics.losses === 'number' ? entry.metrics.losses : 0;
    entry.trades = Array.isArray(entry.trades) ? entry.trades : [];
    entry.trades = entry.trades.map(t=>({
      symbol: t.symbol || sym,
      entryTs: t.entryTs || t.entryTime || t.time || null,
      entryPrice: (typeof t.entryPrice==='number'?t.entryPrice:(typeof t.entry==='number'?t.entry:null)),
      exitTs: t.exitTs || t.time || null,
      exitPrice: (typeof t.exitPrice==='number'?t.exitPrice:(typeof t.exit==='number'?t.exit:null)),
      pnl: typeof t.pnl==='number'?t.pnl:Number(t.pnl)||0,
      direction: t.direction || null,
      reason: t.reason || t.exitReason || null,
      trace: t.trace || []
    }));
    obj.perSymbol[sym] = entry;
  }
  obj.insights = Array.isArray(obj.insights) ? obj.insights : [];
  obj.createdAt = obj.createdAt || new Date().toISOString();
  obj.completedAt = obj.completedAt || new Date().toISOString();
  obj.runId = obj.runId || `run-${Date.now()}`;
  return obj;
}

(function main(){
  const args = process.argv.slice(2);
  let inp=null,outp=null;
  for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1]; if (a==='--in'){ inp=n; i++; } else if (a==='--out'){ outp=n; i++; } }
  if (!inp){ usage(); process.exit(2); }
  const src = readJson(inp);
  if (!src){ console.error('ERR invalid JSON at', inp); process.exit(3); }
  const norm = normalizeJob(src);
  const dest = outp || inp;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(norm, null, 2), 'utf8');
  console.log('OK normalized', dest);
})();
