const fs = require('fs');
const path = require('path');

// Mock the backtester to always produce a top candidate with positive expectancy and enough trades
jest.mock(path.resolve(__dirname, '..', 'backtester.cjs'), ()=>({
  runBacktest: async (opts, hooks) => {
    const runId = `mockprom-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const outDir = path.resolve(__dirname, '..', '..', 'jobs'); try { fs.mkdirSync(outDir, { recursive: true }); } catch(_){}
    const resultsPath = path.join(outDir, `${runId}_results.json`);
    const tradesPath = path.join(outDir, `${runId}_trades.csv`);
    // Write a metrics object that will look promotable
    const metrics = { netPnl: 1000, trades: 40, wins: 30, losses:10, maxDrawdown: -100, avgReturn: 0.01, winRate: 60 };
    fs.writeFileSync(resultsPath, JSON.stringify({ metrics }, null, 2), 'utf8');
    fs.writeFileSync(tradesPath, 'symbol,profit\nTST,1\n', 'utf8');
    return { runId, resultsPath, tradesPath };
  }
}));

const { optimize } = require('../optimizer.cjs');

test('optimize writes promotion record when candidate promotable', async ()=>{
  const symbols = ['A','B','C','D','E','F','G','H','I','J'];
  const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.5] };
  const res = await optimize({ symbols, from:'2025-10-01', to:'2025-10-10', interval:'day', mode:'mock' }, grid, { parallel:2, timeoutSec:10, seed:123 });
  // promotion file should exist
  const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
  const promoFiles = fs.readdirSync(jobsDir).filter(f=> f.includes('promotion') || f.includes('promotion_records'));
  expect(promoFiles.length).toBeGreaterThanOrEqual(1);
});
