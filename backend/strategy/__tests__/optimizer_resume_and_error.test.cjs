const fs = require('fs');
const path = require('path');

describe('optimizer resumeSet filtering and worker error branches', ()=>{
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(base, 'jobs');
  const backtesterPath = path.join(base, 'backtester.cjs');
  const rmPath = path.join(base, '..', 'metrics', 'resourceManager.cjs');

  beforeEach(()=>{ jest.resetModules(); try{ fs.mkdirSync(jobsDir,{recursive:true}); }catch(_){} });
  afterEach(()=>{ try{ const files = fs.readdirSync(jobsDir||''); for(const f of files){ try{ fs.unlinkSync(path.join(jobsDir,f)); }catch(_){} } }catch(_){} });

  test('resumeSet filters out already tried configs', async ()=>{
    // two combos, mark one as tried
    const optimize = require(path.resolve(__dirname, '..', 'optimizer.cjs'));

    // backtester: always return valid metrics
    const backtesterStub = {
      runBacktest: async (params)=>{
        const rid = `r-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
        const resultsPath = path.join(jobsDir, `${rid}_results.json`);
        const metrics = { trades: 10, netPnl: 5, avgReturn: 0.01, winRate:50 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId: rid, resultsPath };
      }
    };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:1, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: rmStub };

    const grid = { ema_short: [8,13], ema_long: [55], atr_mult: [1.2] };
    // mark ema_short:8 as tried
    const triedCfg = { ema_short:8, ema_long:55, atr_mult:1.2 };
    const resumeSet = new Set([ JSON.stringify(triedCfg) ]);

    const res = await optimize.optimize({ symbols:['A','B'], from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, resumeSet });
    expect(res).toBeTruthy();
    // combos count should reflect one filtered
    expect(res.combos).toBeGreaterThanOrEqual(1);
    // none of the ranked configs should match the tried one
    const hasTried = (res.ranked||[]).some(r=> JSON.stringify(r.config) === JSON.stringify(triedCfg));
    expect(hasTried).toBe(false);
  }, 30000);

  test('worker catches backtester errors and records error entries', async ()=>{
    const optimize = require(path.resolve(__dirname, '..', 'optimizer.cjs'));
    // backtester: throw for ema_short===8, succeed otherwise
    const backtesterStub = {
      runBacktest: async (params)=>{
        if (params.strategyConfig && params.strategyConfig.ema_short===8) throw new Error('simulated failure');
        const rid = `ok-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
        const resultsPath = path.join(jobsDir, `${rid}_results.json`);
        const metrics = { trades: 20, netPnl: 30, avgReturn: 0.02, winRate:60 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId: rid, resultsPath };
      }
    };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:1, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: rmStub };

    const grid = { ema_short: [8,13], ema_long: [55], atr_mult: [1.2] };
    const res = await optimize.optimize({ symbols:['X'], from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:false });
    expect(res).toBeTruthy();
  const hasFailure = (res.ranked||[]).some(r=> r && (r.error || r.runId==null || r.metrics==null));
  expect(hasFailure).toBe(true);
  }, 30000);

});
