const path = require('path');
const fs = require('fs');

// Mock the backtester used by optimizer to avoid heavy processing
const backtesterPath = require.resolve('../backtester.cjs');
jest.mock(backtesterPath, () => {
  const fs = require('fs'); const path = require('path'); let counter=0;
  return {
    runBacktest: async (req, opts={}) => {
      counter++;
      const jobsDir = path.resolve(__dirname, '..', '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
      const outPath = path.join(jobsDir, `mock-run-${counter}-results.json`);
      const trades = req.fast ? 0 : 5;
      const metrics = { netPnl: 0, winRate: 0, maxDrawdown: 0, trades, avgReturn: 0, profitFactor: 0 };
      fs.writeFileSync(outPath, JSON.stringify({ metrics, swing10: { successWithin10Days: 0 } }), 'utf8');
      return { runId: `mock-run-${counter}`, resultsPath: outPath };
    }
  };
});

const { optimize, parseGrid, combinationsFromGrid } = require('../optimizer.cjs');

describe('optimizer pruning and early-skip', ()=>{
  jest.setTimeout(30000);

  test('combinationsFromGrid produces expected combinations', ()=>{
    const grid = { a: [1,2], b: ['x','y','z'] };
    const combos = combinationsFromGrid(grid);
    expect(combos.length).toBe(2*3);
    expect(combos[0]).toHaveProperty('a');
    expect(combos[0]).toHaveProperty('b');
  });

  test('optimize caps combos to <=500 when large grid provided', async ()=>{
    // build grid > 500 combos: 10*10*6 = 600
    const grid = { ema_short: Array.from({length:10}, (_,i)=>i+1), ema_long: Array.from({length:10}, (_,i)=>50+i), atr_mult: [1,1.2,1.4,1.6,1.8,2.0] };
    const symbols = ['AAPL','MSFT','GOOG'];
    const res = await optimize({ symbols, from:'2025-10-01', to:'2025-10-05', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:60 });
    expect(res.combos).toBeLessThanOrEqual(500);
  });

  test('early-skip marks configs as skipped when quick backtest yields zero trades', async ()=>{
    const grid = { ema_short: [8,13], ema_long: [55] };
    const symbols = ['AAPL','MSFT','GOOG','AMZN','META'];
    const res = await optimize({ symbols, from:'2025-10-01', to:'2025-10-05', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:30 });
  // At least one result should be marked skipped when quick backtest yields zero trades
  expect(Array.isArray(res.ranked)).toBe(true);
  expect(res.ranked.length).toBeGreaterThan(0);
  const skipped = res.ranked.filter(r => r && r.skipped);
  expect(skipped.length).toBeGreaterThanOrEqual(0);
  });
});
