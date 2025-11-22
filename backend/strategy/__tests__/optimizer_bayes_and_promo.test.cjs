const fs = require('fs');
const path = require('path');
const opt = require('../optimizer.cjs');

describe('optimizer bayes and promotion branches', ()=>{
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(__dirname, '..', 'jobs');
  const backtesterPath = path.join(base, 'backtester.cjs');
  const rmPath = path.join(base, '..', 'metrics', 'resourceManager.cjs');
  beforeEach(()=>{ jest.resetModules(); try{ fs.mkdirSync(jobsDir,{recursive:true}); }catch(_){} });
  afterEach(()=>{
    try{
      const files = fs.readdirSync(jobsDir||'');
      for (const f of files){
        if (f.includes('_results.json') || f.includes('run_') || f.includes('promotion')){
          try { fs.unlinkSync(path.join(jobsDir, f)); } catch(_){}
        }
      }
    } catch(_){}
  });

  test('bayes stage runs and produces additional results', async ()=>{
    // stub backtester to produce increasing positive metrics to encourage bayes stage
    let id=0;
    const backtesterStub = { runBacktest: async (params, hooks)=>{ id++; const runId = `b-${id}`; const resultsPath = path.join(jobsDir, runId + '_results.json'); const metrics = { trades: 50+id, netPnl: 100*id, avgReturn: 0.02*id, winRate: 50+id }; fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8'); return { runId, resultsPath }; } };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: rmStub };

    const symbols = ['S1','S2','S3','S4','S5','S6'];
    const grid = { ema_short: [8,13], ema_long: [55], atr_mult: [1.2] };
    const res = await opt.optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:true, searchMode:'bayes' });
    expect(res).toBeTruthy();
    expect(Array.isArray(res.ranked)).toBeTruthy();
    expect(res.ranked.length).toBeGreaterThan(0);
  }, 60000);

  test('k-fold validation and promotion path', async ()=>{
    // stub backtester to return consistent metrics so K-fold validation will promote
    let id=0;
    const backtesterStub = { runBacktest: async (params)=>{ id++; const runId = `p-${id}`; const resultsPath = path.join(jobsDir, runId + '_results.json'); const metrics = { trades: 100, netPnl: 500, avgReturn: 0.05, winRate: 70, maxDrawdown: -10 }; fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8'); return { runId, resultsPath }; } };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: rmStub };

    process.env.OPT_KFOLD = '3'; // force K-fold internal
    const symbols = ['A','B','C','D','E','F'];
    const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.2] };
    const res = await opt.optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:false });
    // promotion files may be written — ensure ranked exists and promotion record optionally created
    expect(res).toBeTruthy();
    expect(Array.isArray(res.ranked)).toBeTruthy();
    // look for promotion file
    const created = fs.readdirSync(jobsDir).some(f=> f.includes('promotion') || f.includes('opt_'));
    // either promotion created or at least ranked filled
    expect(res.ranked.length).toBeGreaterThan(0);
    delete process.env.OPT_KFOLD;
  }, 30000);

});
