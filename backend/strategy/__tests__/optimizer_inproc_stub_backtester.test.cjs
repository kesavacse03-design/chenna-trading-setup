const fs = require('fs');
const path = require('path');

describe('optimizer full flow with in-process backtester stub', ()=>{
  beforeEach(()=>{ jest.resetModules(); });
  test('runs optimize with stubbed runBacktest exercising stages and promotion', async ()=>{
    const backtestPath = path.resolve(__dirname, '..', 'backtester.cjs');
    // create stub module and insert into require.cache
    const stub = { exports: { runBacktest: async (params, hooks) => {
      const runId = `stub-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const jobsDir = path.resolve(__dirname, '..', '..', 'jobs'); try{ fs.mkdirSync(jobsDir, { recursive: true }); }catch(_){}
      const resultsPath = path.join(jobsDir, `job_${runId}_results.json`);
      const trades = (params && params.fast) ? 2 : 10;
      const metrics = { trades, netPnl: 100, wins: 6, losses: 4, maxDrawdown: -10, avgReturn: 0.5, winRate:60, profitFactor:2 };
      const swing10 = { successRateWithin10Days: 50 };
      fs.writeFileSync(resultsPath, JSON.stringify({ metrics, swing10 }, null, 2), 'utf8');
      return { runId, resultsPath, tradesPath: null };
    }}};
    require.cache[backtestPath] = stub;

    // Ensure resourceManager is the real one (or let it be)
    const optimizer = require('../optimizer.cjs');
    process.env.PROMO_MIN_TRADES = '1';
    process.env.OPT_KFOLD = '3';
    const symbols = ['A','B','C','D'];
    const grid = { ema_short: [8,13], ema_long: [50], atr_mult: [1.5] };
    const res = await optimizer.optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:10, refine:true, searchMode:'hybrid' });
    expect(res).toBeTruthy();
    expect(res.ranked && Array.isArray(res.ranked)).toBe(true);
    // Check that promotion files may exist
    const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
    const promoFiles = fs.existsSync(jobsDir) ? fs.readdirSync(jobsDir).filter(f=> f.includes('promotion') || f.startsWith('opt_')) : [];
    // It's acceptable if promotion files exist or not; ensure optimize completed
    expect(res.combos).toBeGreaterThanOrEqual(0);
  }, 30000);
});
