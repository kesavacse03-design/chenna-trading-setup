#!/usr/bin/env node
// Read a job JSON (and optionally an optimizer JSON) and emit a candidate strategyConfig
// Supports JSON output or a .cjs module (module.exports = {...}) when --out ends with .cjs
const fs = require('fs');
const path = require('path');

function usage(){ console.log('Usage: node tools/generate_strategy_from_best.cjs --job backend/jobs/job_<runId>.json --out backend/strategy/output/strategyConfig.json [--optimizer backend/strategy/output/<run>-optimizer.json]'); }

(function main(){
  const args = process.argv.slice(2);
  let job=null,outp=null,optPath=null;
  for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1]; if (a==='--job'){ job=n; i++; } else if (a==='--out'){ outp=n; i++; } else if (a==='--optimizer'){ optPath=n; i++; } }
  if (!job || !outp){ usage(); process.exit(2); }
  const j = JSON.parse(fs.readFileSync(job,'utf8'));
  let cfg = null;
  // Prefer optimizer output when provided
  if (optPath && fs.existsSync(optPath)) {
    try {
      const opt = JSON.parse(fs.readFileSync(optPath,'utf8'));
      const best = Array.isArray(opt.ranked) && opt.ranked.length ? opt.ranked[0] : null;
      if (best && best.config) cfg = best.config;
    } catch (_) {}
  }
  if (!cfg) {
    const s = j.summary || {};
    cfg = (s.winRate && s.winRate > 55) ? { N: 2, volumeFactor: 0.8, atrStop: 0.9, targetR: 1.1, qty: 100 } : { N: 3, volumeFactor: 0.9, atrStop: 1.0, targetR: 1.2, qty: 100 };
  }
  fs.mkdirSync(path.dirname(outp), { recursive: true });
  if (outp.toLowerCase().endsWith('.cjs')) {
    const body = 'module.exports = ' + JSON.stringify(cfg, null, 2) + ';\n';
    fs.writeFileSync(outp, body, 'utf8');
  } else {
    fs.writeFileSync(outp, JSON.stringify(cfg, null, 2), 'utf8');
  }
  console.log('OK wrote strategyConfig', outp);
})();
