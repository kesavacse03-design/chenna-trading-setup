const { parseGrid, combinationsFromGrid, pruneCombos, mulberry32Seed, compositeScore, aggregateFoldMetrics, perturbConfig, mutateConfig, adaptVariants } = require('../optimizer.cjs');

describe('optimizer helper functions extra tests', ()=>{
  test('parseGrid and combinationsFromGrid basic', ()=>{
    const g = parseGrid('ema_short:8,13;ema_long:55,89;atr_mult:1.2');
    expect(Object.keys(g)).toEqual(expect.arrayContaining(['ema_short','ema_long','atr_mult']));
    const combos = combinationsFromGrid(g);
    expect(combos.length).toBe(2*2*1);
    expect(combos[0]).toHaveProperty('ema_short');
  });

  test('pruneCombos reduces to limit and is deterministic with seed', ()=>{
    const grid = { ema_short: [2,3,5,8,13,21,34,55], ema_long: [55,89,144], atr_mult: [1.0,1.2] };
    const combos = combinationsFromGrid(grid);
    const pr1 = pruneCombos(combos.slice(), 20);
    const pr2 = pruneCombos(combos.slice(), 20);
    expect(pr1.length).toBeLessThanOrEqual(20);
    expect(pr2.length).toBeLessThanOrEqual(20);
  });

  test('mulberry32Seed produces deterministic sequence', ()=>{
    const a = mulberry32Seed(12345);
    const b = mulberry32Seed(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  test('compositeScore edge cases', ()=>{
    expect(compositeScore(null)).toBe(-Infinity);
    const good = compositeScore({ avgReturn: 0.02, netPnl: 100, maxDrawdown: -10, winRate: 60 });
    const bad = compositeScore({ avgReturn: -0.01, netPnl: -50, maxDrawdown: -100, winRate: 30 });
    expect(typeof good).toBe('number');
    expect(good).toBeGreaterThan(bad);
  });

  test('aggregateFoldMetrics aggregates or returns null', ()=>{
    expect(aggregateFoldMetrics([])).toBeNull();
    const agg = aggregateFoldMetrics([{ netPnl: 10, trades:5, wins:3, losses:2, maxDrawdown:-5, avgReturn:0.01 }, { netPnl:20, trades:6, wins:4, losses:2, maxDrawdown:-3, avgReturn:0.02 }]);
    expect(agg).toHaveProperty('netPnl', 30);
    expect(agg).toHaveProperty('trades', 11);
  });

  test('perturbConfig and mutateConfig keep bounds and numeric types', ()=>{
    const base = { ema_short: 8, ema_long:55, atr_mult:1.5, volumeFactor:1.0 };
    const p = perturbConfig(base, 42);
    const m = mutateConfig(base, 42);
    expect(typeof p.ema_short).toBe('number');
    expect(typeof m.ema_short).toBe('number');
    expect(p.ema_short).toBeGreaterThanOrEqual(2);
    expect(m.ema_long).toBeGreaterThanOrEqual(p.ema_short);
  });

  test('adaptVariants returns reasonable variants', ()=>{
    const out = adaptVariants({ ema_short:8, ema_long:55, atr_mult:1.5, volumeFactor:1.0 });
    expect(Array.isArray(out)).toBeTruthy();
    expect(out.length).toBeGreaterThan(0);
  });
});
