const { parseGrid, combinationsFromGrid, pruneCombos, compositeScore } = require('../optimizer.cjs');

describe('optimizer utilities', () => {
  test('parseGrid handles empty and numeric conversion', () => {
    expect(parseGrid('')).toEqual({});
    const g = parseGrid('ema_short:8,13,21;ema_long:55,89;atr_mult:1.2,1.5');
    expect(g.ema_short).toEqual([8,13,21]);
    expect(g.ema_long).toEqual([55,89]);
    expect(g.atr_mult).toEqual([1.2,1.5]);
  });

  test('combinationsFromGrid and pruneCombos limit', () => {
    const grid = { a: [1,2,3], b: [10,20,30], c: [100,200,300] };
    const combos = combinationsFromGrid(grid);
    // 3*3*3 = 27
    expect(Array.isArray(combos)).toBeTruthy();
    expect(combos.length).toBe(27);
    const pruned = pruneCombos(combos, 10);
    expect(pruned.length).toBeLessThanOrEqual(10);
    // ensure returned items are subset of original combos
    for (const p of pruned) expect(combos.some(c=> JSON.stringify(c)===JSON.stringify(p))).toBe(true);
  });

  test('compositeScore returns -Infinity for null and numeric for metrics', () => {
    expect(compositeScore(null)).toBe(-Infinity);
    const m = { avgReturn: 0.05, netPnl: 100, maxDrawdown: -50, winRate: 60 };
    const s = compositeScore(m);
    expect(typeof s).toBe('number');
    // higher expectancy -> higher score
    const m2 = { avgReturn: 0.06, netPnl: 120, maxDrawdown: -40, winRate: 65 };
    expect(compositeScore(m2)).toBeGreaterThan(s);
  });
});
