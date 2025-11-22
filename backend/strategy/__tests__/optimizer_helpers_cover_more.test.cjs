const { parseGrid, combinationsFromGrid, pruneCombos, compositeScore, perturbConfig, mutateConfig, adaptVariants, aggregateFoldMetrics, mulberry32Seed } = require('../optimizer.cjs');

describe('optimizer helper coverage extras', ()=>{
  test('parseGrid and combinations', ()=>{
    expect(parseGrid(null)).toEqual({});
    const g = parseGrid('ema_short:8,13;ema_long:50;atr_mult:1.5,2');
    expect(Object.keys(g)).toEqual(expect.arrayContaining(['ema_short','ema_long','atr_mult']));
    const combos = combinationsFromGrid(g);
    expect(combos.length).toBeGreaterThan(0);
    expect(combos[0]).toHaveProperty('ema_short');
  });

  test('pruneCombos with seed and limit', ()=>{
    const combos = [];
    for (let i=0;i<300;i++){ combos.push({ ema_short: 5 + (i%10), ema_long: 40 + (i%20), atr_mult: 1.2 + ((i%5)/10) }); }
    process.env.SEED = '12345';
    const pruned = pruneCombos(combos, 120);
    expect(pruned.length).toBeLessThanOrEqual(120);
    // ensure stable given seed by calling again
    process.env.SEED = '12345';
    const pruned2 = pruneCombos(combos, 120);
    expect(pruned.map(JSON.stringify)).toEqual(pruned2.map(JSON.stringify));
    delete process.env.SEED;
  });

  test('compositeScore edge and typical', ()=>{
    expect(compositeScore(null)).toBe(-Infinity);
    const m = { avgReturn: 0.2, netPnl: 50, maxDrawdown: -10, winRate: 60 };
    const s = compositeScore(m);
    expect(typeof s).toBe('number');
  });

  test('perturb and mutate constraints', ()=>{
    const base = { ema_short:8, ema_long:55, atr_mult:1.5, volumeFactor:1.0 };
    const p = perturbConfig(base, 7);
    expect(p.ema_short).toBeGreaterThanOrEqual(2);
    expect(p.ema_long).toBeGreaterThanOrEqual(p.ema_short);
    expect(p.atr_mult).toBeGreaterThanOrEqual(0.5);
    const m = mutateConfig(base, 42);
    expect(m.ema_short).toBeGreaterThanOrEqual(2);
    expect(m.ema_long).toBeGreaterThanOrEqual(m.ema_short);
  });

  test('adaptVariants produces variants', ()=>{
    const out = adaptVariants({ ema_short:8, ema_long:55, atr_mult:1.5, volumeFactor:1.0 });
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(5);
  });

  test('aggregateFoldMetrics aggregates properly', ()=>{
    const fm = [ { trades: 5, netPnl: 10, wins:3, losses:2, maxDrawdown: -5, avgReturn: 0.2 }, { trades: 5, netPnl: 20, wins:4, losses:1, maxDrawdown: -3, avgReturn: 0.25 } ];
    const agg = aggregateFoldMetrics(fm);
    expect(agg).toBeTruthy();
    expect(agg.trades).toBe(10);
    expect(agg.netPnl).toBe(30);
    expect(agg.avgReturn).toBeGreaterThan(0);
  });

  test('mulberry32Seed deterministic', ()=>{
    const r = mulberry32Seed(1234);
    const a = r(); const b = r();
    expect(a).not.toBe(b);
    const r2 = mulberry32Seed(1234);
    const a2 = r2(); expect(a).toBeCloseTo(a2, 6);
  });
});
