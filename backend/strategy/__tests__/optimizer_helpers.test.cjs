const { perturbConfig, mutateConfig, adaptVariants, aggregateFoldMetrics } = require('../optimizer.cjs');

describe('optimizer helper functions', ()=>{
  test('perturbConfig adjusts numeric fields while respecting constraints', ()=>{
    const base = { ema_short: 8, ema_long: 55, atr_mult: 1.5, name: 'x' };
    const p = perturbConfig(base, 42);
    expect(typeof p.ema_short).toBe('number');
    expect(p.ema_short).toBeGreaterThanOrEqual(2);
    expect(p.ema_long).toBeGreaterThanOrEqual(p.ema_short);
  });

  test('mutateConfig adjusts numeric fields and preserves bounds', ()=>{
    const base = { ema_short: 8, ema_long: 55, atr_mult: 1.5 };
    const m = mutateConfig(base, 10);
    expect(m.ema_short).toBeGreaterThanOrEqual(2);
    expect(m.ema_long).toBeGreaterThanOrEqual(m.ema_short);
  });

  test('adaptVariants generates expected variants', ()=>{
    const base = { ema_short: 8, ema_long: 50, atr_mult:1.5, volumeFactor:1.0 };
    const arr = adaptVariants(base);
    expect(Array.isArray(arr)).toBeTruthy();
    expect(arr.length).toBeGreaterThanOrEqual(6);
    expect(arr[0]).toHaveProperty('ema_short');
  });

  test('aggregateFoldMetrics aggregates valid folds and returns null for none', ()=>{
    const good = [{ trades:10, netPnl:5, avgReturn:0.01, winRate:50, maxDrawdown:-2 }, null, { trades:5, netPnl:2, avgReturn:0.02 }];
    const agg = aggregateFoldMetrics(good);
    expect(agg).not.toBeNull();
    expect(agg.trades).toBeGreaterThanOrEqual(15);
    const none = [null, null];
    expect(aggregateFoldMetrics(none)).toBeNull();
  });
});
