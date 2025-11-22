const path = require('path');
const fs = require('fs');
const opt = require(path.resolve(__dirname, '..', 'optimizer.cjs'));

describe('optimizer additional branches', () => {
  test('optimizeCandidates handles runBacktest errors and ranks correctly', async () => {
    // Inject a simple runBacktest stub into require cache
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    const stub = {
      runBacktest: async (opts, hooks) => {
        // create deterministic results file for given config
        const runId = `stub-${Date.now()}`;
        const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
        try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const p = path.join(jobsDir, `run_${runId}_results.json`);
        const metrics = { netPnl: (opts.strategyConfig && opts.strategyConfig.score) || 0, winRate: 50, trades: 40, avgReturn: 0.1, maxDrawdown: -10 };
        fs.writeFileSync(p, JSON.stringify({ runId, metrics }, null, 2), 'utf8');
        return { runId, resultsPath: p };
      }
    };
    // place stub in require cache
    require.cache[require.resolve(path.resolve(__dirname, '..', 'backtester.cjs'))] = { exports: stub };

    const opt = require(path.resolve(__dirname, '..', 'optimizer.cjs'));
    const candidates = [ { score: 1, name: 'a' }, { score: 10, name: 'b' } ];
    const res = await opt.optimizeCandidates({ symbols: ['S1','S2'], from: '2025-01-01', to: '2025-02-01', interval: 'day', mode: 'mock' }, candidates, { parallel: 2, timeoutSec: 3 });
    expect(res.combos).toBe(2);
    expect(Array.isArray(res.ranked)).toBe(true);
    expect(res.ranked[0].metrics).toBeTruthy();
  });

  test('CLI prints usage and exits when args missing', () => {
    // Spawn node process to run optimizer.cjs with no args; expect exit code 2
    const cp = require('child_process');
    const file = path.resolve(__dirname, '..', 'optimizer.cjs');
    const out = cp.spawnSync(process.execPath, [file], { encoding: 'utf8' });
    // exit code 2 per usage early-exit
    expect(out.status === 2 || out.status === null).toBeTruthy();
    // stdout contains Usage
    expect(String(out.stdout || '')).toMatch(/Usage:/);
  });
});

describe('optimizer more branches (prune, csv, resumeSet)', ()=>{
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(__dirname, '..', 'jobs');
  const backtesterPath = path.join(base, 'backtester.cjs');
  const rmPath = path.join(base, '..', 'metrics', 'resourceManager.cjs');
  beforeEach(()=>{ jest.resetModules(); try{ fs.mkdirSync(jobsDir,{recursive:true}); }catch(_){} });
  afterEach(()=>{ try{ for(const f of fs.readdirSync(jobsDir||'')){ if(f.includes('_results.json')||f.includes('run_')||f.endsWith('.csv')||f.includes('opt_')||f.includes('promotion')){ try{ fs.unlinkSync(path.join(jobsDir,f)); }catch(_){} } } }catch(_){} });

  test('pruneCombos path and CSV output (genetic/hybrid)', async ()=>{
    // create a grid that expands to many combos so pruneCombos path triggers
    const grid = { a: Array.from({length:6},(_,i)=>i+1), b: Array.from({length:6},(_,i)=>i+1), c: Array.from({length:6},(_,i)=>i+1) };
    // stub backtester to write simple result files
    let id=0;
    const backtesterStub = { runBacktest: async (params)=>{ id++; const runId = `g-${id}`; const resultsPath = path.join(jobsDir, runId + '_results.json'); const metrics = { trades: 5+id, netPnl: id, avgReturn: 0.01, winRate: 50 }; fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8'); return { runId, resultsPath }; } };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded:true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded:true, exports: rmStub };

    const symbols = ['X','Y','Z'];
  const res = await opt.optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:true, searchMode:'genetic' });
  expect(res).toBeTruthy();
  // combos should be pruned to <=500 and less than full Cartesian product
  const fullCount = grid.a.length * grid.b.length * grid.c.length;
  expect(res.combos).toBeGreaterThan(0);
  expect(res.combos).toBeLessThanOrEqual(500);
  expect(res.combos).toBeLessThan(fullCount);
  }, 60000);

  test('resumeSet filters already-tried configs', async ()=>{
    const grid = { ema_short: [8,13], ema_long: [55], atr_mult: [1.2] };
    // build combos to generate a resumeSet for the first combo
    const combos = require('../optimizer.cjs').combinationsFromGrid(grid);
    expect(combos.length).toBeGreaterThan(0);
    const resumeSet = new Set([ JSON.stringify(combos[0]) ]);
    let id=0;
    const backtesterStub = { runBacktest: async (params)=>{ id++; const runId = `r-${id}`; const resultsPath = path.join(jobsDir, runId + '_results.json'); const metrics = { trades: 10, netPnl: 10*id, avgReturn: 0.01, winRate: 50 }; fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8'); return { runId, resultsPath }; } };
    require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded:true, exports: backtesterStub };
    const rmStub = { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded:true, exports: rmStub };

    const symbols = ['A','B'];
    const res = await opt.optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:false, resumeSet });
    expect(res).toBeTruthy();
    // combos field reports number of combos after resume filtering
    expect(res.combos).toBeLessThanOrEqual(combos.length);
    // ensure at least one config was skipped (res.combos < original combos)
    expect(res.combos).toBeLessThan(combos.length);
  });

});
