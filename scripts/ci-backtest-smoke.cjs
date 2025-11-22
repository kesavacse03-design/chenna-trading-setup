#!/usr/bin/env node
// CI smoke: run a fast mock backtest and validate the produced job JSON via AJV
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
}

async function main(){
  const tmpSymbols = path.resolve(__dirname, '..', 'tmp', 'ci_smoke_symbols.txt');
  try { fs.mkdirSync(path.dirname(tmpSymbols), { recursive: true }); } catch(_){}
  fs.writeFileSync(tmpSymbols, 'SMOKE', 'utf8');

  // Run backtester in fast/mock mode to produce a job JSON
  console.log('Running quick backtest...');
  const env = Object.assign({}, process.env, { TEST_FORCE_TRADE: '1', BACKTEST_QUICK_BARS: '10', BACKTEST_PERF: '' });
  // Use node to run the backtester script
  run(process.execPath, [path.resolve(__dirname, '..', 'backend', 'strategy', 'backtester.cjs'), '--symbols-file', tmpSymbols, '--from', '2025-10-01', '--to', '2025-10-02', '--fast'], { env });

  // Find the most recent job JSON written to backend/jobs matching job_run-*.json
  const jobsDir = path.resolve(__dirname, '..', 'backend', 'jobs');
  const files = (fs.existsSync(jobsDir) ? fs.readdirSync(jobsDir) : []).filter(f => /^job_run-\d+\.json$/.test(f)).map(f=>({f, m: fs.statSync(path.join(jobsDir,f)).mtimeMs})).sort((a,b)=>b.m-a.m);
  if (!files.length) throw new Error('No job_run-*.json found in backend/jobs');
  const jobFile = path.join(jobsDir, files[0].f);
  console.log('Validating job JSON:', jobFile);

  // Validate using project's validator
  const validator = require(path.resolve(__dirname, '..', 'backend', 'schema', 'validateBacktestResult.cjs'));
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const { valid, errors } = validator.validate(job);
  if (!valid) {
    console.error('Validation failed:', JSON.stringify(errors, null, 2));
    process.exit(2);
  }
  console.log('Validation passed');
}

main().catch(e=>{ console.error('CI smoke failed:', e && e.message || e); process.exit(1); });
