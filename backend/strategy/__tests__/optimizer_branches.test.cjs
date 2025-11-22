const fs = require('fs');
const path = require('path');

// Mock backtester to simulate quick-skip (zero trades) for some configs and positive trades for others
jest.mock(path.resolve(__dirname, '..', 'backtester.cjs'), ()=>{
  let counter = 0;
  return {
    runBacktest: async (opts, hooks) => {
      // create deterministic runId
      const runId = `mockopt-${++counter}`;
      const outDir = path.resolve(__dirname, '..', '..', 'jobs'); try { fs.mkdirSync(outDir, { recursive: true }); } catch(_){}
      const resultsPath = path.join(outDir, `${runId}_results.json`);
      const tradesPath = path.join(outDir, `${runId}_trades.csv`);
      // If fast flag present, return zero trades to trigger quick-skip
      if (opts.fast) {
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics: { trades: 0, netPnl: 0, avgReturn: 0 } }, null, 2),'utf8');
        fs.writeFileSync(tradesPath, '', 'utf8');
        return { runId, resultsPath, tradesPath };
      }
      // For other calls, vary metrics to exercise sorting and adapt stage
      const base = (counter % 3 === 0) ? { trades: 0, netPnl: -10, avgReturn: -0.01, winRate: 30 } : { trades: 50, netPnl: 200, avgReturn: 0.02, winRate: 60 };
      fs.writeFileSync(resultsPath, JSON.stringify({ metrics: base }, null, 2),'utf8');
      fs.writeFileSync(tradesPath, 'symbol,profit\nA,1\n', 'utf8');
      return { runId, resultsPath, tradesPath };
    }
  };
});

const { optimize } = require('../optimizer.cjs');

test('optimize handles quick-skip and continues to bayes/genetic/adapt without throwing', async ()=>{
  const symbols = ['S1','S2','S3','S4','S5','S6'];
  const grid = { ema_short: [8,13], ema_long: [55], atr_mult: [1.5] };
  // hybrid to exercise bayes/genetic/adapt stages; small timeout
  const res = await optimize({ symbols, from:'2025-10-01', to:'2025-10-05', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:8, refine:true, searchMode:'hybrid', seed:42 });
  expect(res).toBeTruthy();
  expect(typeof res.runId).toBe('string');
  // ensure ranked array exists
  expect(Array.isArray(res.ranked)).toBe(true);
});

test('optimize K-fold validation handles empty folds gracefully', async ()=>{
  // Use symbols length=2 and set OPT_KFOLD high to create empty folds
  const symbols = ['A','B'];
  process.env.OPT_KFOLD = '10';
  const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.5] };
  const res = await optimize({ symbols, from:'2025-10-01', to:'2025-10-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:6, refine:false });
  expect(res).toBeTruthy();
  delete process.env.OPT_KFOLD;
});
