const { parseGrid, combinationsFromGrid, pruneCombos, compositeScore } = require('../optimizer.cjs');

describe('optimizer utility functions - focused', ()=>{
  test('parseGrid parses numbers and strings', ()=>{
    const g = parseGrid('ema_short:8,13,21;label:foo,bar;atr:1.5,2');
    expect(g.ema_short).toEqual([8,13,21]);
    expect(g.label).toEqual(['foo','bar']);
    expect(g.atr).toEqual([1.5,2]);
  });

  test('combinationsFromGrid returns Cartesian product of configs', ()=>{
    const grid = { a: [1,2], b: ['x','y'] };
    const combos = combinationsFromGrid(grid);
    expect(Array.isArray(combos)).toBe(true);
    expect(combos.length).toBe(4);
    // each combo should have both keys
    combos.forEach(c=>{ expect(c).toHaveProperty('a'); expect(c).toHaveProperty('b'); });
  });

  test('pruneCombos respects limit and seeded randomness is deterministic', ()=>{
    // create 200 combos with ema_short increasing
    const combos = Array.from({length:200}, (_,i)=> ({ ema_short: i%50, ema_long: 200 - (i%50), atr_mult: 1.5 + (i%5)*0.1 }));
    process.env.SEED = '12345';
    const pruned1 = pruneCombos(combos.slice(), 120);
    process.env.SEED = '12345';
    const pruned2 = pruneCombos(combos.slice(), 120);
    expect(pruned1.length).toBeLessThanOrEqual(120);
    expect(pruned1.length).toBe(pruned2.length);
    // deterministic tail picks should match when same seed used
    expect(JSON.stringify(pruned1)).toBe(JSON.stringify(pruned2));
    delete process.env.SEED;
  });

  test('compositeScore handles null/empty metrics', ()=>{
    expect(compositeScore(null)).toBe(-Infinity);
    expect(Number.isFinite(compositeScore({}))).toBe(true);
    const m = { avgReturn: 0.05, netPnl: 100, maxDrawdown: -20, winRate: 60 };
    const s = compositeScore(m);
    expect(typeof s).toBe('number');
    expect(s).toBeGreaterThan(-Infinity);
  });
});
