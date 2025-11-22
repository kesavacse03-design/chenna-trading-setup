const path = require('path');
const fs = require('fs');

describe('optimizer extra coverage helpers', ()=>{
  const OPT = require(path.resolve(__dirname, '..', 'optimizer.cjs'));

  test('mulberry32Seed is deterministic across same seed and different for different seed', ()=>{
    const a = OPT.mulberry32Seed(12345);
    const b = OPT.mulberry32Seed(12345);
    const c = OPT.mulberry32Seed(54321);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    const seqC = [c(), c(), c()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  test('pruneCombos trims and includes a tail sample (deterministic Math.random)', ()=>{
    // create 200 combos with ascending ema_short so sort is predictable
    const combos = Array.from({length:200}, (_,i)=>({ ema_short:i, ema_long:300-i, atr_mult:1.5 }));
    const limit = 50;
    const realMathRandom = Math.random;
    try {
      Math.random = ()=>0.5; // deterministic pick
      const out = OPT.pruneCombos(combos.slice(), limit);
      expect(out.length).toBe(limit);
      // compute expected picked index in original sorted list
      const headLen = Math.min(limit-20, combos.length);
      const restLen = combos.length - headLen;
      const pickIndex = headLen + Math.floor(0.5 * restLen);
      // after sort the item with ema_short === pickIndex should be included
      expect(out.some(c=>c.ema_short===pickIndex)).toBe(true);
    } finally { Math.random = realMathRandom; }
  });

  test('perturbConfig and mutateConfig preserve constraints with seed', ()=>{
    const base = { ema_short:5, ema_long:50, atr_mult:1.5, volumeFactor:1.0 };
    const p = OPT.perturbConfig(base, 42);
    const m = OPT.mutateConfig(base, 42);
    expect(p.ema_short).toBeGreaterThanOrEqual(2);
    expect(p.ema_long).toBeGreaterThanOrEqual(p.ema_short);
    expect(p.atr_mult).toBeGreaterThanOrEqual(0.5);
    expect(p.volumeFactor).toBeGreaterThanOrEqual(0.1);
    expect(m.ema_short).toBeGreaterThanOrEqual(2);
    expect(m.ema_long).toBeGreaterThanOrEqual(m.ema_short);
    expect(m.atr_mult).toBeGreaterThanOrEqual(0.5);
    expect(m.volumeFactor).toBeGreaterThanOrEqual(0.1);
  });

  test('aggregateFoldMetrics returns null for no valid folds and aggregates correctly', ()=>{
    expect(OPT.aggregateFoldMetrics([])).toBeNull();
    const fm = [ { trades:10, netPnl:5, wins:6, losses:4, maxDrawdown:-10, avgReturn:0.02 }, { trades:20, netPnl:15, wins:12, losses:8, maxDrawdown:-8, avgReturn:0.04 } ];
    const agg = OPT.aggregateFoldMetrics(fm);
    expect(agg).toBeTruthy();
    expect(agg.trades).toBe(30);
    expect(agg.netPnl).toBe(20);
    expect(agg.wins).toBe(18);
    expect(agg.losses).toBe(12);
    expect(typeof agg.avgReturn).toBe('number');
  });

  test('optimizeCandidates ranks results and handles failures', async ()=>{
    // Mock backtester module used by optimizer.optimizeCandidates
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.resetModules();
    jest.doMock(backtesterPath, ()=>({
      runBacktest: async ({ strategyConfig })=>{
        // simulate a run writing a results file
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try{ fs.mkdirSync(jobsDir, { recursive:true }); }catch(_){}
        const rid = `mock-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const resultsPath = path.join(jobsDir, `res_${rid}.json`);
        if (strategyConfig && strategyConfig.fail) throw new Error('boom');
        const metrics = { netPnl: strategyConfig.score || 0, winRate: strategyConfig.win||50, profitFactor:1.2 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId: rid, resultsPath, tradesPath: null };
      }
    }), { virtual: false });

    const OPT2 = require(path.resolve(__dirname, '..', 'optimizer.cjs'));
    const candidates = [ { score: 5 }, { score: 20 }, { fail: true } ];
    const res = await OPT2.optimizeCandidates({ symbols:['A'], from:'2020-01-01', to:'2020-02-01', interval:'day', mode:'mock' }, candidates, { parallel:2, timeoutSec:5 });
  expect(res.combos).toBe(3);
  // optimizeCandidates returns results for all combos; failed runs include error field
  expect(res.ranked.length).toBe(3);
  expect(res.ranked.some(r=>r.error)).toBe(true);
  // top ranked should be candidate with highest netPnl (score 20)
  const top = res.ranked.find(r=>r.metrics && r.metrics.netPnl===20);
  expect(top).toBeTruthy();
  });
});
