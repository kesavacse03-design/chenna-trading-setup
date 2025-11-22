const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

describe('optimizer pruneCombos seeded and main resume-file child-run', ()=>{
  const base = path.resolve(__dirname, '..');
  const jobsDir = path.resolve(base, 'jobs');
  const optimizerPath = path.resolve(base, 'optimizer.cjs');
  beforeEach(()=>{ jest.resetModules(); try{ fs.mkdirSync(jobsDir,{recursive:true}); }catch(_){} });
  afterEach(()=>{ try{ const files = fs.readdirSync(jobsDir||''); for(const f of files){ try{ fs.unlinkSync(path.join(jobsDir,f)); }catch(_){} } }catch(_){} });

  test('pruneCombos uses seeded randomness when SEED is set', ()=>{
    const OPT = require(path.resolve(__dirname, '..', 'optimizer.cjs'));
    // create 200 combos
    const combos = Array.from({length:200}, (_,i)=>({ ema_short:i, ema_long:300-i, atr_mult:1.5 }));
    process.env.SEED = '42';
    const out1 = OPT.pruneCombos(combos.slice(), 50);
    delete process.env.SEED;
    // repeat with same seed to check determinism
    process.env.SEED = '42';
    const out2 = OPT.pruneCombos(combos.slice(), 50);
    delete process.env.SEED;
    expect(out1.length).toBe(50);
    expect(out2.length).toBe(50);
    // order or selection should match when using same seed
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
  });

  test('main() --resume-file path loads resume and writes out file (child process)', ()=>{
    // Prepare a resume file with tried configs to ensure code path exercised
    const resumeDoc = { ranked: [ { config: { ema_short: 8, ema_long:55, atr_mult:1.2 } } ] };
    const resumePath = path.join(jobsDir, 'resume_test.json');
    fs.writeFileSync(resumePath, JSON.stringify(resumeDoc, null, 2), 'utf8');

    // Create a small preload module that stubs backtester and resourceManager in child process
    const preloadPath = path.join(jobsDir, 'preload_stub.cjs');
    const preloadCode = `
      const fs = require('fs');
      const path = require('path');
      // backtester stub writes a simple results file
      const back = { runBacktest: async (params)=>{ const jobsDir = path.resolve(__dirname,'..','jobs'); const runId = 'child-'+Date.now(); const resultsPath = path.join(jobsDir, runId + '_results.json'); fs.writeFileSync(resultsPath, JSON.stringify({ metrics:{ trades:10, netPnl:1, avgReturn:0.01, winRate:50 } })); return { runId, resultsPath }; } };
      const rm = { detectResources: ()=>({ cpuCores:1, gpuDevices:0 }), planConcurrency: p=>1, startMonitor: ()=>({ stop: ()=>{} }) };
      // Resolve paths relative to the optimizer module layout
      require.cache[require.resolve(path.resolve(__dirname,'..','backtester.cjs'))] = { id: 'backtester', filename: 'backtester', loaded:true, exports: back };
      require.cache[require.resolve(path.resolve(__dirname,'..','..','metrics','resourceManager.cjs'))] = { id: 'rm', filename: 'rm', loaded:true, exports: rm };
    `;
    fs.writeFileSync(preloadPath, preloadCode, 'utf8');

    // Run child process: node -r <preload> backend/strategy/optimizer.cjs --symbols A,B --from 2025-01-01 --to 2025-01-02 --out jobs/child_out.json --grid "ema_short:8;ema_long:55;atr_mult:1.2" --resume-file <resumePath>
    const outFile = path.join(jobsDir, 'child_out.json');
    const node = process.execPath;
    const args = ['-r', preloadPath, optimizerPath, '--symbols', 'A,B', '--from', '2025-01-01', '--to', '2025-01-02', '--out', outFile, '--grid', 'ema_short:8;ema_long:55;atr_mult:1.2', '--resume-file', resumePath, '--parallel', '1', '--timeout', '10'];
    const res = spawnSync(node, args, { cwd: process.cwd(), env: Object.assign({}, process.env), timeout: 20000 });
    // child should succeed and write the output file
    expect(fs.existsSync(outFile)).toBe(true);
  }, 60000);

});
