const path = require('path');
const fs = require('fs');

describe('optimizer coverage boost', ()=>{
  beforeEach(()=>{ jest.resetModules(); });

  test('pruneCombos reduces large sets and is deterministic with SEED', ()=>{
    const { pruneCombos } = require('../optimizer.cjs');
    const combos = [];
    for (let i=0;i<300;i++) combos.push({ ema_short: 5 + (i%10), ema_long: 50 + (i%20), atr_mult: 1.0 + ((i%5)/10) });
    process.env.SEED = '12345';
    const pruned = pruneCombos(combos, 100);
    expect(pruned.length).toBeLessThanOrEqual(100);
    // deterministic: running again with same seed yields same first item
    const pruned2 = pruneCombos(combos, 100);
    expect(pruned[0]).toEqual(pruned2[0]);
    delete process.env.SEED;
  });

  test('compositeScore returns -Infinity for null input and computes for metrics', ()=>{
    const { compositeScore } = require('../optimizer.cjs');
    expect(compositeScore(null)).toBe(-Infinity);
    const m = { avgReturn: 0.02, netPnl: 50, maxDrawdown: -10, winRate: 60 };
    const s = compositeScore(m);
    expect(typeof s).toBe('number');
    expect(s).toBeGreaterThan(-1000);
  });

  test('optimizeCandidates runs and ranks candidate list', async ()=>{
    // mock runBacktest to produce simple metrics for each candidate
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `rc-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        const metrics = { trades: 10, netPnl: (params.strategyConfig?.score||1) * 10, winRate: 50, profitFactor: 1.2 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimizeCandidates } = require('../optimizer.cjs');
    const symbols = ['A','B','C'];
    const candidates = [ { score:1 }, { score:5 }, { score:2 } ];
    const res = await optimizeCandidates({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, candidates, { parallel:2, timeoutSec:10 });
    expect(res.ranked.length).toBe(3);
    // highest score candidate should be first
    expect(res.ranked[0].config.score).toBe(5);
  }, 20000);

  test('optimize respects resumeSet filtering (skips already tried)', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `rr-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        const metrics = { trades: 5, netPnl: 1, avgReturn: 0.001, winRate: 50 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    const grid = { ema_short:[8,13], ema_long:[55], atr_mult:[1.2] };
    const combos = require('../optimizer.cjs').combinationsFromGrid(grid);
    // mark first combo as tried
    const tried = new Set([ JSON.stringify(combos[0]) ]);
    const symbols = ['X','Y','Z','W'];
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, resumeSet: tried });
    // Ensure that results do not include the tried config runId
    const found = res.ranked.find(r => JSON.stringify(r.config) === JSON.stringify(combos[0]));
    expect(found).toBeUndefined();
  }, 30000);

});
