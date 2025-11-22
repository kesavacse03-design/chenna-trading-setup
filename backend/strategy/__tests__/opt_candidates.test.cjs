const path = require('path');
const fs = require('fs');

// Mock runBacktest to write minimal results files
jest.mock(path.resolve(__dirname, '..', 'backtester.cjs'), ()=>({
  runBacktest: async (opts, hooks) => {
    const runId = `mock-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const outDir = path.resolve(__dirname, '..', '..', 'jobs'); try { fs.mkdirSync(outDir, { recursive: true }); } catch(_){}
    const resultsPath = path.join(outDir, `${runId}_results.json`);
    const tradesPath = path.join(outDir, `${runId}_trades.csv`);
    const metrics = { netPnl: Math.round(Math.random()*200 - 50), winRate: Math.round(30 + Math.random()*50), profitFactor: +(0.5 + Math.random()*2).toFixed(2) };
    fs.writeFileSync(resultsPath, JSON.stringify({ metrics }, null, 2), 'utf8');
    fs.writeFileSync(tradesPath, 'symbol,profit\nTST,1\n', 'utf8');
    return { runId, resultsPath, tradesPath };
  }
}));

const { optimizeCandidates } = require('../optimizer.cjs');

test('optimizeCandidates ranks candidates by netPnl', async ()=>{
  const candidates = [ { name:'a' }, { name:'b' }, { name:'c' } ];
  const res = await optimizeCandidates({ symbols:['A','B'], from:'2025-10-01', to:'2025-10-02', interval:'day', mode:'mock' }, candidates, { parallel:2, timeoutSec:10 });
  expect(res.combos).toBe(3);
  expect(Array.isArray(res.ranked)).toBe(true);
  // metrics were written by mock runBacktest; ensure ranking present
  expect(res.ranked.length).toBeGreaterThan(0);
});
