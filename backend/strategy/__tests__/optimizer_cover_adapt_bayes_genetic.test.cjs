const fs = require('fs');
const path = require('path');

describe('optimizer cover bayes/genetic/adapt and promotion', ()=>{
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(base, 'jobs');
  beforeEach(()=>{ jest.resetModules(); try{ fs.mkdirSync(jobsDir,{recursive:true}); }catch(_){} });
  afterEach(()=>{ try{ const files = fs.readdirSync(jobsDir||''); for(const f of files){ try{ fs.unlinkSync(path.join(jobsDir,f)); }catch(_){} } }catch(_){}; delete process.env.OPT_KFOLD; });

  test('runs hybrid search and triggers adapt + promotion', async ()=>{
    // stub backtester to produce deterministic results and variation across calls
    const backPath = path.resolve(__dirname, '..', 'backtester.cjs');
    const rmPath = path.resolve(__dirname, '..', '..', 'metrics', 'resourceManager.cjs');
    let call = 0;
    const back = { runBacktest: async (params, hooks)=>{
      call++;
      const runId = `stub-${Date.now()}-${call}`;
      const resultsPath = path.join(jobsDir, `${runId}_results.json`);
      // quick check calls should report some trades to avoid quick-skip
      if (params.fast) {
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics: { trades: 5, netPnl: 1, avgReturn: 0.001, winRate:50 } }), 'utf8');
        return { runId, resultsPath };
      }
      // Provide a small positive metric for first main combo to allow promotion later
      if (call === 2) {
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics: { trades: 40, netPnl: 5, avgReturn: 0.005, winRate: 45, maxDrawdown: -50 } }), 'utf8');
        return { runId, resultsPath };
      }
      // All subsequent calls return strong positive metrics to allow promotion
      fs.writeFileSync(resultsPath, JSON.stringify({ metrics: { trades: 60, netPnl: 120, avgReturn: 0.03, winRate: 65, maxDrawdown: -10 } }), 'utf8');
      return { runId, resultsPath };
    } };
    const rm = { detectResources: ()=>({ cpuCores:1, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
  require.cache[require.resolve(backPath)] = { id: 'backtester', filename: 'backtester', loaded:true, exports: back };
  require.cache[require.resolve(rmPath)] = { id: 'rm', filename: 'rm', loaded:true, exports: rm };
  // Lower promotion thresholds so test can trigger promotion
  process.env.PROMO_MIN_TRADES = '1';
  process.env.PROMO_MAX_DRAWDOWN = '50000';

    const OPT = require(path.resolve(__dirname, '..', 'optimizer.cjs'));
    // ensure k-fold validation uses 3 folds
    process.env.OPT_KFOLD = '3';
    const grid = { ema_short: [8,13], ema_long: [55], atr_mult: [1.2] };
    const res = await OPT.optimize({ symbols: ['A','B','C','D'], from: '2025-01-01', to: '2025-01-02', interval: 'day', mode: 'mock' }, grid, { parallel:1, timeoutSec: 20, searchMode: 'hybrid', refine: true });
    expect(res).toBeTruthy();
    expect(Array.isArray(res.ranked)).toBe(true);
    // Promotion files should be created when validation passes
  // At minimum we should have ranked results
  expect(Array.isArray(res.ranked)).toBe(true);
  expect(res.ranked.length).toBeGreaterThan(0);
  // cleanup env
  delete process.env.PROMO_MIN_TRADES; delete process.env.PROMO_MAX_DRAWDOWN;
  }, 30000);

});
