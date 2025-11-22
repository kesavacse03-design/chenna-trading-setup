const fs = require('fs');
const path = require('path');

// We'll mock runBacktest to produce a set of initial results with one strong top candidate
jest.mock(path.resolve(__dirname, '..', 'backtester.cjs'), ()=>{
  let calls = 0;
  return {
    runBacktest: async (opts, hooks) => {
      calls++;
      const runId = `stg-${calls}`;
      const outDir = path.resolve(__dirname, '..', '..', 'jobs'); try { fs.mkdirSync(outDir, { recursive: true }); } catch(_){}
      const resultsPath = path.join(outDir, `${runId}_results.json`);
      const tradesPath = path.join(outDir, `${runId}_trades.csv`);
      // First few calls produce low-quality results; later calls produce high-quality to force bayes/genetic/adapt
      let metrics;
      if (calls < 3) metrics = { trades: 0, netPnl: -5, avgReturn: -0.01, winRate: 30 };
      else if (calls < 8) metrics = { trades: 50, netPnl: 100, avgReturn: 0.01, winRate: 55 };
      else metrics = { trades: 60, netPnl: 300, avgReturn: 0.03, winRate: 70 };
      fs.writeFileSync(resultsPath, JSON.stringify({ metrics }, null, 2),'utf8');
      fs.writeFileSync(tradesPath, 'symbol,profit\nA,1\n','utf8');
      return { runId, resultsPath, tradesPath };
    }
  };
});

const { optimize } = require('../optimizer.cjs');

test('hybrid search invokes bayes and genetic stages and completes', async ()=>{
  const symbols = ['S1','S2','S3','S4','S5','S6','S7','S8','S9'];
  const grid = { ema_short: [8,13,21], ema_long: [55], atr_mult: [1.2,1.5] };
  const res = await optimize({ symbols, from:'2025-10-01', to:'2025-10-05', interval:'day', mode:'mock' }, grid, { parallel:2, timeoutSec:12, refine:true, searchMode:'hybrid', seed:999 });
  expect(res).toBeTruthy();
  // Ensure some ranking results exist and report file written
  expect(Array.isArray(res.ranked)).toBe(true);
  const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
  const report = fs.readdirSync(jobsDir).some(f=> f.includes(`${res.runId}_report.json`));
  expect(report).toBe(true);
});
