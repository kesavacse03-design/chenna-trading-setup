const fs = require('fs');
const path = require('path');

describe('optimizer large grid downselect and bayes/genetic stages', ()=>{
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(base, 'jobs');
  beforeEach(()=>{ jest.resetModules(); try{ fs.mkdirSync(jobsDir,{recursive:true}); }catch(_){} });
  afterEach(()=>{ try{ const files = fs.readdirSync(jobsDir||''); for(const f of files){ try{ fs.unlinkSync(path.join(jobsDir,f)); }catch(_){} } }catch(_){}; delete process.env.SEED; });

  test('downselect from >500 combos then run bayes and genetic', async ()=>{
    const backPath = path.resolve(__dirname, '..', 'backtester.cjs');
    const rmPath = path.resolve(__dirname, '..', '..', 'metrics', 'resourceManager.cjs');
    let id = 0;
    const back = { runBacktest: async (params)=>{
      id++; const runId = `stub-${Date.now()}-${id}`; const resultsPath = path.join(jobsDir, `${runId}_results.json`);
      // quick runs should have some trades
      const metrics = { trades: 10 + (id%5), netPnl: id%3===0?10:5, avgReturn: 0.01 * (id%3+1), winRate: 50 + (id%10) };
      fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
      return { runId, resultsPath };
    } };
    const rm = { detectResources: ()=>({ cpuCores:1, gpuDevices:0 }), planConcurrency: ()=>1, startMonitor: ()=>({ stop: ()=>{} }) };
    require.cache[require.resolve(backPath)] = { id: 'back', filename: 'back', loaded:true, exports: back };
    require.cache[require.resolve(rmPath)] = { id: 'rm', filename: 'rm', loaded:true, exports: rm };

    const OPT = require(path.resolve(__dirname, '..', 'optimizer.cjs'));
    // build a grid with >500 combos
    const shorts = Array.from({length:40}, (_,i)=>8 + i);
    const longs = Array.from({length:20}, (_,i)=>50 + i*2);
    const atrs = [1.0,1.2,1.4,1.6];
    const grid = { ema_short: shorts, ema_long: longs, atr_mult: atrs };
    process.env.SEED = '12345';
    // run bayes stage
    const r1 = await OPT.optimize({ symbols: ['A','B','C'], from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec: 20, searchMode: 'bayes', refine: true });
    expect(r1).toBeTruthy(); expect(Array.isArray(r1.ranked)).toBe(true);
    // run genetic stage
    const r2 = await OPT.optimize({ symbols: ['A','B','C'], from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec: 20, searchMode: 'genetic', refine: true });
    expect(r2).toBeTruthy(); expect(Array.isArray(r2.ranked)).toBe(true);
  }, 45000);

});
