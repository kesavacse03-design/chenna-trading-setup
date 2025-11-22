const path = require('path');
const fs = require('fs');

describe('optimizer large grid behavior', ()=>{
  beforeEach(()=>{ jest.resetModules(); });

  test('handles >500 combos by pruning and running workers', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `lg-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        const metrics = { trades: 5, netPnl: 1, avgReturn: 0.01, winRate: 50, maxDrawdown: -5 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    // mock resourceManager to control concurrency
    const rmPath = path.resolve(__dirname, '..', '..', 'metrics', 'resourceManager.cjs');
    jest.mock(rmPath, () => ({
      detectResources: () => ({ cpuCores: 2, gpuDevices: 0 }),
      planConcurrency: (p) => Math.max(1, Math.min(2, p)),
      startMonitor: () => ({ stop: ()=>{} })
    }));
    const { optimize } = require('../optimizer.cjs');
    // build a grid generating ~600 combos
    const grid = { ema_short: Array.from({length:12}, (_,i)=>5+i), ema_long: Array.from({length:6}, (_,i)=>40+i*5), atr_mult: [1.0,1.2] };
    const symbols = Array.from({length:10}, (_,i)=>`S${i}`);
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:4, timeoutSec:30, searchMode:'grid' });
    expect(res).toHaveProperty('runId');
    expect(res.combos).toBeGreaterThan(0);
  }, 40000);
});
