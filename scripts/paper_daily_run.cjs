#!/usr/bin/env node
/*
Runs a PAPER rollout once, writing a daily report under jobs/.
Set env before calling:
  ALLOW_LIVE_CALLS=1
  CTS_API_BASE=http://127.0.0.1:3001
*/
const { spawnSync } = require('child_process');
const path = require('path');
const now = Date.now();
const runId = `paper_live_${now}`;
const out = path.resolve(__dirname, '..', 'jobs', `paper_run_${runId}.json`);
const script = path.resolve(__dirname, 'run_paper_rollout.cjs');
const args = [
  script,
  '--symbols-file', path.resolve(__dirname, '..', 'config', 'paper_symbols.txt'),
  '--grid', path.resolve(__dirname, '..', 'config', 'production_grid.json'),
  '--parallel', '8',
  '--run-id', runId,
  '--execution_mode', 'PAPER',
  '--out', out
];
const env = { ...process.env };
if (env.ALLOW_LIVE_CALLS !== '1') console.warn('WARN: ALLOW_LIVE_CALLS not set to 1; live provider may be disabled');
if (!env.CTS_API_BASE) console.warn('WARN: CTS_API_BASE not set; default inside rollout script will be used');
const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
process.exit(r.status || 0);
