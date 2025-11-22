const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

describe('optimizer CLI execution (child process)', ()=>{
  beforeEach(()=>{ jest.resetModules(); });

  test('runs optimizer in a child Node process with mocked backtester', async ()=>{
    const base = path.resolve(__dirname, '..');
    const optPath = path.join(base, 'optimizer.cjs');
    const jobsDir = path.resolve(__dirname, '..', 'jobs');
    try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}

    // Create a small runner script that stubs required modules and invokes optimizer.__main
    const backtesterPath = path.join(base, 'backtester.cjs');
    const rmPath = path.join(base, '..', 'metrics', 'resourceManager.cjs');

    // Create a small preload script that stubs backtester and resource manager via require.cache
    const preloadPath = path.join(jobsDir, `preload_stub_${Date.now()}.cjs`);
    const preloadCode = `const fs = require('fs'); const path = require('path');\n` +
      `const backtesterPath = ${JSON.stringify(backtesterPath)}; require.cache[backtesterPath] = { id: backtesterPath, filename: backtesterPath, loaded: true, exports: { runBacktest: async (params, hooks) => { const runId = 'mp-' + Math.random().toString(36).slice(2,8); const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}; const resultsPath = path.join(jobsDir, runId + '_results.json'); const metrics = { trades: 10, netPnl: 20, avgReturn: 0.02, winRate: 55, maxDrawdown: -10 }; fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8'); return { runId, resultsPath }; } } };\n`+
      `const rmPath = ${JSON.stringify(rmPath)}; require.cache[rmPath] = { id: rmPath, filename: rmPath, loaded: true, exports: { detectResources: ()=>({ cpuCores:2, gpuDevices:0 }), planConcurrency: (p)=>Math.max(1,Math.min(2,p)), startMonitor: ()=>({ stop: ()=>{} }) } };\n`;
    fs.writeFileSync(preloadPath, preloadCode, 'utf8');

    // Spawn Node with -r preload so optimizer runs as the main module while stubs are present
    await new Promise((resolve, reject)=>{
      const child = spawn(process.execPath, ['-r', preloadPath, optPath, '--symbols', 'A,B,C', '--from', '2025-01-01', '--to', '2025-01-02', '--out', path.join('jobs','cli_out.json'), '--grid', 'ema_short:8;ema_long:55;atr_mult:1.2'], { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d=>{ stdout += String(d); });
      child.stderr.on('data', d=>{ stderr += String(d); });
      child.on('error', err=> reject(err));
      child.on('exit', code=>{
        if (code === 0) return resolve();
        const msg = `child exit ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        return reject(new Error(msg));
      });
    });
    const outPath = path.join(path.resolve(__dirname, '..'), 'jobs', 'cli_out.json');
    expect(fs.existsSync(outPath)).toBeTruthy();

  // cleanup
  try { fs.unlinkSync(outPath); } catch(_){ }
  try { fs.unlinkSync(preloadPath); } catch(_){}
  }, 60000);
});
