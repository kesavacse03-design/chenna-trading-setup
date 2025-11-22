process.env.CTS_UPSTOX_MOCK = '1';
const fs = require('fs');
const path = require('path');
const { runBacktest } = require('../backtester.cjs');

describe('Shadow gating via SHADOW_REQUIRE_PROMOTION', () => {
  const symbols = ['SYM_X','SYM_Y'];
  const from='2025-10-01', to='2025-10-03';
  const interval='day', mode='mock';

  function readJobsLogs(runId){
    const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
    const logPath = path.join(jobsDir, `run_${runId}_logs.txt`);
    if (!fs.existsSync(logPath)) return '';
    return fs.readFileSync(logPath, 'utf8');
  }

  it('blocks shadow when no promotion exists', async () => {
    process.env.SHADOW_REQUIRE_PROMOTION = '1';
    // clean any existing promotion files to isolate
    try {
      const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
      const files = fs.readdirSync(jobsDir).filter(f=>/promotion\.json$/i.test(f));
      for (const f of files) { try { fs.unlinkSync(path.join(jobsDir,f)); } catch(_){} }
    } catch(_){}
    const out = await runBacktest({ symbols, from, to, interval, mode, strategyConfig: { N:1, volumeFactor:0.5, atrStop:0.5, targetR:1.0, qty:10 } }, { onLog:()=>{} });
    const logs = readJobsLogs(out.runId);
  expect(logs).toMatch(/SHADOW: gating skip/);
  });

  it('allows shadow when promotion file exists', async () => {
    process.env.SHADOW_REQUIRE_PROMOTION = '1';
    // create a fake promotion file that references the runId
    const out = await runBacktest({ symbols, from, to, interval, mode, strategyConfig: { N:1, volumeFactor:0.5, atrStop:0.5, targetR:1.0, qty:10 } }, { onLog:()=>{} });
    const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
  fs.writeFileSync(path.join(jobsDir, `run_${out.runId}_promotion.json`), JSON.stringify({ promoted: true, shadowRunId: out.runId, runId: out.runId }, null, 2), 'utf8');
    const out2 = await runBacktest({ symbols, from, to, interval, mode, strategyConfig: { N:1, volumeFactor:0.5, atrStop:0.5, targetR:1.0, qty:10 } }, { onLog:()=>{} });
    const logs2 = readJobsLogs(out2.runId);
    // when allowed, there should be no gating skip line
  expect(logs2).not.toMatch(/SHADOW: gating skip/);
  // worker may spawn or be not found; accept either message
  expect(/SHADOW: worker (exit|not found)/.test(logs2) || /SHADOW: worker/.test(logs2)).toBe(true);
  });
});
