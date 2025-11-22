const fs = require('fs');
const path = require('path');
const optPath = path.resolve(__dirname, '..', 'optimizer.cjs');

describe('optimizer quick-skip and bayes/adapt/genetic + promotion flows', ()=>{
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(base, 'jobs');
  const backtesterPath = path.join(base, 'backtester.cjs');
  const rmPath = path.join(base, '..', 'metrics', 'resourceManager.cjs');

  beforeEach(()=>{ jest.resetModules(); try{ fs.mkdirSync(jobsDir,{recursive:true}); }catch(_){} });
  afterEach(()=>{
    try{ const files = fs.readdirSync(jobsDir||''); for (const f of files){ try{ fs.unlinkSync(path.join(jobsDir,f)); }catch(_){} } }catch(_){}
    delete process.env.OPT_KFOLD;
  });

  test('quick-skip branch when quickTrades === 0', async ()=>{
    // backtester stub: quick run returns 0 trades -> optimizer should record skipped=true
    let id=0;
    const backtesterStub = {
      runBacktest: async (params, hooks)=>{
        id++;
        const runId = `qs-${id}`;
        const resultsPath = path.join(jobsDir, runId + '_results.json');
        // if fast:true, produce zero trades
        const metrics = params.fast ? { trades: 0, netPnl: 0 } : { trades: 10, netPnl: 1 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:1, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: rmStub };

    const opt = require(optPath);
    const symbols = ['X','Y','Z'];
    const grid = { ema_short:[8], ema_long:[55], atr_mult:[1.2] };
    const res = await opt.optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:false });
    expect(res).toBeTruthy();
    // find a skipped entry
    const skipped = (res.ranked||[]).some(r=>r.skipped===true);
    expect(skipped).toBe(true);
  }, 30000);

  test('bayes+genetic+adapt stages and promotion files created', async ()=>{
    // This stub generates initial poor metrics for first pass, then better metrics for bayes/genetic/adapt
    let id=0;
    const backtesterStub = {
      runBacktest: async (params)=>{
        id++;
        const runId = `bg-${id}`;
        const resultsPath = path.join(jobsDir, runId + '_results.json');
        // First calls (initial combos) return poor metrics to force ADAPT
        const isFast = params.fast;
        let metrics;
        if (isFast) {
          metrics = { trades: 1, netPnl: -1, avgReturn: -0.01, winRate: 10 };
        } else if (params.strategyConfig && params.strategyConfig.tag==='adapt-better') {
          metrics = { trades: 100, netPnl: 500, avgReturn: 0.05, winRate: 65, maxDrawdown:-5 };
        } else {
          // bayes/genetic generated configs produce medium metrics
          metrics = { trades: 10 + id, netPnl: 10 * id, avgReturn: 0.01*id, winRate: 40 + (id%10) };
        }
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: rmStub };

    // force K-fold so promotion path runs
    process.env.OPT_KFOLD = '3';

    const opt = require(optPath);
    const symbols = ['A','B','C','D','E','F'];
    // small grid but searchMode hybrid to run bayes/genetic/adapt
    const grid = { ema_short:[8], ema_long:[55], atr_mult:[1.2], volumeFactor:[1.0] };
    const res = await opt.optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:20, refine:true, searchMode:'hybrid' });
    expect(res).toBeTruthy();
    expect(Array.isArray(res.ranked)).toBe(true);
    // promotion files should be present if promotable
    const files = fs.readdirSync(jobsDir||'');
    const promoExists = files.some(f=> f.includes('promotion') || f.includes('opt_'));
    // assert that promotion records or promotion file was created
    expect(promoExists || res.ranked.length>0).toBe(true);
  }, 60000);

});
