#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage(){ console.log('Usage: node tools/summary_report.cjs --job backend/jobs/job_<runId>.json --out backend/strategy/output/<runId>-summary.md'); }

function md(j){
  const s = j.summary || {};
  const lines = [];
  lines.push(`# Backtest Summary for ${j.runId||'unknown'}`);
  lines.push('');
  lines.push(`- Trades: ${s.tradesCount ?? s.totalTrades ?? 0}`);
  lines.push(`- Total PnL: ${s.totalPnL ?? 0}`);
  lines.push(`- Win Rate: ${s.winRate ?? 0}`);
  lines.push(`- Avg Return: ${s.avgReturn ?? 0}`);
  lines.push(`- Max Drawdown: ${s.maxDrawdown ?? 0}`);
  lines.push('');
  lines.push('## Per-symbol metrics');
  for (const sym of Object.keys(j.perSymbol||{})){
    const m = (j.perSymbol[sym]||{}).metrics || {}; 
    lines.push(`- ${sym}: netPnl=${m.netPnl ?? 0}, wins=${m.wins ?? 0}, losses=${m.losses ?? 0}`);
  }
  return lines.join('\n');
}

(function main(){
  const args = process.argv.slice(2);
  let job=null, outp=null;
  for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1]; if (a==='--job'){ job=n; i++; } else if (a==='--out'){ outp=n; i++; } }
  if (!job || !outp){ usage(); process.exit(2); }
  const j = JSON.parse(fs.readFileSync(job,'utf8'));
  const text = md(j);
  fs.mkdirSync(path.dirname(outp), { recursive: true });
  fs.writeFileSync(outp, text, 'utf8');
  console.log('OK wrote', outp);
})();
