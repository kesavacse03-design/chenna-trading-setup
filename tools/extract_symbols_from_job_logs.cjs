#!/usr/bin/env node
// Extract symbols from backend/strategy/output/jobs.json for a specific runId by parsing 'processing SYMBOL' lines
// Writes to an output file and optionally saves to backend storage per-category
const fs = require('fs');
const path = require('path');

function usage(){
  console.log('Usage: node tools/extract_symbols_from_job_logs.cjs --run <run-...> --out tmp/category_symbols/<CATEGORY>.txt [--category <CATEGORY>]');
}

function uniqueSorted(arr){ return Array.from(new Set(arr)).sort(); }

(function main(){
  const args = process.argv.slice(2);
  let runId=null, outPath=null, categoryKey=null;
  for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1]; if (a==='--run'){ runId=n; i++; } else if (a==='--out'){ outPath=n; i++; } else if (a==='--category'){ categoryKey=n; i++; } }
  if (!runId || !outPath){ usage(); process.exit(2); }
  const jobsPath = path.resolve('backend','strategy','output','jobs.json');
  if (!fs.existsSync(jobsPath)) { console.error('jobs.json not found'); process.exit(3); }
  const jobs = JSON.parse(fs.readFileSync(jobsPath,'utf8'));
  let job = null;
  for (const j of Array.isArray(jobs)?jobs:[]){ if (j && (j.runId === runId || (j.resultsPath && String(j.resultsPath).includes(`${runId}-`)))) { job = j; break; } }
  if (!job){ console.error('Run not found in jobs.json:', runId); process.exit(4); }
  const re = /\bprocessing\s+([A-Z0-9\-]+)\b/;
  const found = [];
  const logs = Array.isArray(job.logs)? job.logs : [];
  for (const line of logs){ const m = typeof line==='string' ? line.match(re) : null; if (m && m[1]) found.push(m[1].toUpperCase()); }
  if (Array.isArray(job.symbols)) for (const s of job.symbols){ if (s) found.push(String(s).toUpperCase()); }
  const uniq = uniqueSorted(found);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, uniq.join('\n') + (uniq.length?'\n':''), 'utf8');
  console.log(`OK wrote ${uniq.length} symbols to ${outPath}`);
  if (categoryKey){
    try {
      const { saveCategorySymbols } = require(path.resolve('backend','storage','categoryData.cjs'));
      const meta = { source: 'jobs.json', runId };
      const res = saveCategorySymbols(categoryKey, uniq, meta);
      console.log('Saved to category storage', res);
    } catch (e) { console.log('WARN failed to save category storage', e && e.message); }
  }
})();
