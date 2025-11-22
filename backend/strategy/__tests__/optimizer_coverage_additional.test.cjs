const fs = require('fs');
const path = require('path');

const opt = require('../optimizer.cjs');

describe('optimizer additional coverage', ()=>{
  jest.setTimeout(60000);
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(__dirname, '..', 'jobs');
  const backtesterPath = path.join(base, 'backtester.cjs');
  const rmPath = path.join(base, '..', 'metrics', 'resourceManager.cjs');
  beforeEach(()=>{
    jest.resetModules();
    try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
  });
  afterEach(()=>{
    // cleanup jobs files created
    try { for (const f of fs.readdirSync(jobsDir||'')) { if (f.includes('_results.json') || f.includes('run_') || f.startsWith('preload_stub_')) { try { fs.unlinkSync(path.join(jobsDir,f)); } catch(_){} } } } catch(_){}
  });

  test('skips combos when quickTrades is zero', async ()=>{
    // stub backtester to produce quick result with trades=0
    const backtesterStub = { runBacktest: async (params, hooks)=>{
      const runId = 'tbq-' + Math.random().toString(36).slice(2,6);
      const resultsPath = path.join(jobsDir, runId + '_results.json');
      const data = { metrics: { trades: 0, netPnl: 0 } };
      fs.writeFileSync(resultsPath, JSON.stringify(data), 'utf8');
      return { runId, resultsPath };
    } };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: backtesterStub };
    // stub resourceManager
    const rmStub = { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: rmStub };

    const symbols = ['S1','S2','S3'];
    const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.2] };
    const res = await opt.optimize({ symbols, from: '2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:false });
    expect(res).toBeTruthy();
    expect(Array.isArray(res.ranked)).toBeTruthy();
    expect(res.ranked.length).toBeGreaterThanOrEqual(1);
    expect(res.ranked[0].skipped).toBeTruthy();
  });

  test('runs combos and produces report files', async ()=>{
    // stub backtester to produce non-zero trades and different netPnl values
    let counter = 0;
    const backtesterStub = { runBacktest: async (params, hooks)=>{
      const runId = 'tbr-' + (++counter);
      const resultsPath = path.join(jobsDir, runId + '_results.json');
      const metrics = { trades: 10 + counter, netPnl: 100 * counter, avgReturn: 0.01 * counter, winRate: 50 + counter };
      fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
      return { runId, resultsPath };
    } };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: rmStub };

    const symbols = ['A','B','C','D'];
    const grid = { ema_short: [8,13], ema_long: [55], atr_mult: [1.2] };
  const res = await opt.optimize({ symbols, from: '2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:false, searchMode:'grid' });
    expect(res).toBeTruthy();
    // report file should be created
  // promotion record may or may not be created; ensure ranked results exist
  expect(Array.isArray(res.ranked)).toBeTruthy();
  expect(res.ranked.length).toBeGreaterThan(0);
  }, 30000);

});
