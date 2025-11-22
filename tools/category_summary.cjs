#!/usr/bin/env node
// Generate category-level optimization summary report (fast, no loops)
const fs = require('fs');
const path = require('path');

function usage(){
  console.log('Usage:');
  console.log('  node tools/category_summary.cjs <job_json> <out_report> "<CATEGORY>" [--print] [--ascii]');
}

function readJsonSafe(p){
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { throw new Error(`Failed to read/parse JSON: ${p} :: ${e && e.message}`); }
}

function formatCurrency(n, ascii){
  const val = Number(n||0);
  // Prefer ASCII-friendly output on Windows PowerShell consoles by default
  const useAscii = ascii || /^1|true|yes$/i.test(String(process.env.ASCII_CURRENCY||''));
  const prefix = useAscii ? 'Rs ' : '\u20B9';
  // Basic Indian grouping without Intl to avoid locale surprises in CI
  const s = Math.round(val).toString();
  const sign = s.startsWith('-') ? '-' : '';
  const d = sign ? s.slice(1) : s;
  let out = '';
  if (d.length > 3) {
    out = d.slice(-3);
    let rest = d.slice(0, -3);
    while (rest.length > 2) { out = rest.slice(-2) + ',' + out; rest = rest.slice(0, -2); }
    if (rest) out = rest + ',' + out;
  } else { out = d; }
  return `${sign}${prefix}${out}`;
}

(function main(){
  const args = process.argv.slice(2);
  const inJson = args[0];
  const outPath = args[1];
  const categoryName = args[2] || 'UNKNOWN_CATEGORY';
  const flags = new Set(args.slice(3));
  if (!inJson || !outPath) { usage(); process.exit(2); }

  const j = readJsonSafe(inJson);
  const ranked = Array.isArray(j.ranked) ? j.ranked : [];
  const tested = Number(j.combos || ranked.length || 0);
  const best = ranked[0] || {};
  const m = best.metrics || {};
  const syms = Array.isArray(j.parameters?.symbols) ? j.parameters.symbols.length : 0;
  const top5 = ranked.slice(0,5);
  const ascii = flags.has('--ascii');

  const lines = [];
  lines.push(`Category: ${categoryName}`);
  lines.push(`Symbols tested: ${syms}`);
  lines.push(`Combinations tested: ${tested}`);
  const totalTrades = (m.trades != null) ? m.trades : ((m.wins || 0) + (m.losses || 0));
  lines.push(`Total trades (category): ${totalTrades}`);
  const wr = (typeof m.winRate === 'number') ? m.winRate : 0;
  lines.push(`Win rate (category): ${wr.toFixed(1)}%`);
  lines.push(`Net PnL (category): ${formatCurrency(m.netPnl || 0, ascii)}`);
  const avgPnl = (typeof m.avgPnlPerTrade === 'number') ? m.avgPnlPerTrade : 0;
  lines.push(`Avg PnL/trade: ${formatCurrency(avgPnl, ascii)}`);
  lines.push(`Profit factor: ${m.profitFactor ?? 0}`);
  lines.push(`Max drawdown: ${m.maxDrawdown ?? 0}%`);
  if (best.config) lines.push(`Best params: ${JSON.stringify(best.config)}`);
  lines.push('');
  lines.push('Top 5 candidates:');
  for (let i=0;i<top5.length;i++){
    const r = top5[i] || {}; const rm = r.metrics || {};
    lines.push(`${i+1}. netPnl=${rm.netPnl||0} winRate=${rm.winRate||0} PF=${rm.profitFactor||0} DD=${rm.maxDrawdown||0} params=${JSON.stringify(r.config)}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n', { encoding: 'utf8' });
  if (flags.has('--print')) {
    // Emit summary directly so callers needn't re-read the file
    console.log(lines.slice(0, 10).join('\n'));
  }
  console.log('OK wrote report', outPath);
  // Make exit explicit to avoid lingering if any stray handles exist in parent env
  process.exit(0);
})();
