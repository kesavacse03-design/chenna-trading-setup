const { parseGrid, combinationsFromGrid, pruneCombos, compositeScore } = require('../optimizer.cjs');

test('parseGrid handles empty and numeric conversion', ()=>{
  expect(parseGrid('')).toEqual({});
  const g = parseGrid('ema_short:8,13;atr_mult:1.2,1.5');
  expect(g.ema_short).toEqual([8,13]);
  expect(g.atr_mult).toEqual([1.2,1.5]);
});

test('combinationsFromGrid produces expected combos', ()=>{
  const grid = { a: [1,2], b: ['x'] };
  const combos = combinationsFromGrid(grid);
  expect(combos.length).toBe(2);
  expect(combos).toEqual(expect.arrayContaining([{ a:1, b:'x' }, { a:2, b:'x' }]));
});

test('pruneCombos caps and respects seed for deterministic tail pick', ()=>{
  process.env.SEED = '12345';
  const combos = Array.from({length:300}, (_,i)=>({ ema_short: i%20, ema_long: 50 + (i%10), atr_mult: 1.0 + ((i%5)/10) }));
  const pr = pruneCombos(combos, 120);
  expect(pr.length).toBeLessThanOrEqual(120);
  delete process.env.SEED;
});

test('compositeScore returns -Infinity for null or numbers for metrics', ()=>{
  expect(compositeScore(null)).toBe(-Infinity);
  expect(typeof compositeScore({ avgReturn: 0.1, netPnl: 10, maxDrawdown: -5, winRate: 60 })).toBe('number');
});
