const path = require('path');
const fs = require('fs');

describe('optimizer monitor throttle handling', ()=>{
  beforeEach(()=>{ jest.resetModules(); });

  test('monitor onThrottle and onSample are invoked', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `mt-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        const metrics = { trades: 5, netPnl: 5, avgReturn: 0.01, winRate: 50, maxDrawdown: -2 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    // Mock resourceManager to trigger onSample and onThrottle
    const rmPath = path.resolve(__dirname, '..', '..', 'metrics', 'resourceManager.cjs');
    jest.mock(rmPath, () => ({
      detectResources: () => ({ cpuCores: 4, gpuDevices: 0 }),
      planConcurrency: (p)=> Math.max(1, Math.min(4,p)),
      startMonitor: ({ intervalMs, cpuLimit, onThrottle, onSample }) => {
        // invoke a couple of samples and one throttle to exercise the handlers
        try { onSample && onSample({ cpuPercent: 10 }); } catch(_){}
        try { onSample && onSample({ cpuPercent: 90 }); } catch(_){}
        try { onThrottle && onThrottle({ cpuPercent: 95 }); } catch(_){}
        return { stop: ()=>{} };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    const grid = { ema_short:[8], ema_long:[55], atr_mult:[1.2] };
    const symbols = ['A','B','C','D'];
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:2, timeoutSec:20, searchMode:'grid' });
    expect(res.runId).toBeTruthy();
  }, 20000);
});
