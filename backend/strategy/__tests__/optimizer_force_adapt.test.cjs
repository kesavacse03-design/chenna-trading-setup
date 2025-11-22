const fs = require('fs');
const path = require('path');
const opt = require('../optimizer.cjs');

describe('optimizer force adapt stage', ()=>{
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(__dirname, '..', 'jobs');
  const backtesterPath = path.join(base, 'backtester.cjs');
  const rmPath = path.join(base, '..', 'metrics', 'resourceManager.cjs');
  beforeEach(()=>{ jest.resetModules(); try{ fs.mkdirSync(jobsDir,{recursive:true}); }catch(_){} });
  afterEach(()=>{ try{ for(const f of fs.readdirSync(jobsDir||'')){ if(f.includes('_results.json')||f.includes('run_')||f.includes('promotion')){ try{ fs.unlinkSync(path.join(jobsDir,f)); }catch(_){} } } }catch(_){} });

  test('adapt stage executes adaptVariants and produces adapted results', async ()=>{
    // stub backtester to return negative avgReturn for base configs, positive for adapt variants
    let id = 0;
    const backtesterStub = { runBacktest: async (params)=>{
      id++;
      const runId = `a-${id}`;
      const resultsPath = path.join(jobsDir, runId + '_results.json');
      const cfg = params && params.strategyConfig || {};
      // detect adapt variant: changed atr_mult or volumeFactor or ema_short not equal base
      const isAdapt = (typeof cfg.atr_mult === 'number' && Math.abs(cfg.atr_mult - 1.2) > 0.05) || (typeof cfg.volumeFactor === 'number' && Math.abs(cfg.volumeFactor - 1.0) > 0.05) || (cfg.ema_short && cfg.ema_short !== 8);
      const metrics = isAdapt ? { trades: 50, netPnl: 200, avgReturn: 0.05, winRate: 70, maxDrawdown: -5 } : { trades: 10, netPnl: -10, avgReturn: -0.01, winRate: 30, maxDrawdown: -50 };
      fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
      return { runId, resultsPath };
    } };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded:true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded:true, exports: rmStub };

    process.env.PROMO_MIN_TRADES = '1';
    process.env.PROMO_MAX_DRAWDOWN = '1000';
    const symbols = ['S1','S2','S3','S4','S5','S6'];
    const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.2], volumeFactor: [1.0] };
    const res = await opt.optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:20, refine:true, searchMode:'hybrid' });
    expect(res).toBeTruthy();
    // ensure adapt variants were evaluated by checking for any result where config differs from base atr_mult or volumeFactor
    const adaptSeen = (res.ranked||[]).some(r => (r.config && (typeof r.config.atr_mult === 'number' && Math.abs(r.config.atr_mult - 1.2) > 0.05) ) || (r.config && (typeof r.config.volumeFactor === 'number' && Math.abs(r.config.volumeFactor - 1.0) > 0.05)) );
    expect(adaptSeen).toBeTruthy();
    delete process.env.PROMO_MIN_TRADES; delete process.env.PROMO_MAX_DRAWDOWN;
  }, 60000);

});
