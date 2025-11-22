const { pruneCombos } = require('../optimizer.cjs');

test('pruneCombos head/tail selection deterministic with SEED', ()=>{
  process.env.SEED = '4242';
  const combos = Array.from({length:200}, (_,i)=>({ ema_short: i%10, ema_long: 50 + (i%5), atr_mult: 1.0 + ((i%3)/10) }));
  const pr = pruneCombos(combos, 100);
  expect(pr.length).toBeLessThanOrEqual(100);
  // Check deterministic selection by calling again
  const pr2 = pruneCombos(combos, 100);
  expect(JSON.stringify(pr)).toEqual(JSON.stringify(pr2));
  delete process.env.SEED;
});
