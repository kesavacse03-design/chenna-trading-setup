const { selectCombos, parseGrid, combinationsFromGrid } = require('../optimizer.cjs');

describe('selectCombos helper', ()=>{
  test('downselects large grids and reports original count', ()=>{
    const grid = { ema_short: [2,3,4,5,6,7,8,9,10,11], ema_long:[30,40,50,60,70,80,90], atr_mult:[1,1.2,1.4,1.6] };
    const r = selectCombos(grid, { maxCombos: 200, pruneLimit: 120 });
    expect(r.original).toBeGreaterThan(200);
    expect(r.combos.length).toBeLessThanOrEqual(200);
  });

  test('applies resumeSet filtering', ()=>{
    const grid = parseGrid('ema_short:8,13;ema_long:50;atr_mult:1.5');
    const all = combinationsFromGrid(grid);
    expect(all.length).toBeGreaterThan(0);
    const json0 = JSON.stringify(all[0]);
    const resumeSet = new Set([ json0 ]);
    const r = selectCombos(grid, { maxCombos:500, pruneLimit:120, resumeSet });
    // ensure the previously-tried config is not present
    const found = r.combos.some(c => JSON.stringify(c) === json0);
    expect(found).toBe(false);
  });
});
