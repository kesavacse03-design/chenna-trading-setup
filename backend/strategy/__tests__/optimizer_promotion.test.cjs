const fs = require('fs');
const path = require('path');

describe('Optimizer promotion record', () => {
  const optPath = path.resolve(__dirname, '..', 'optimizer.cjs');
  if (!fs.existsSync(optPath)) return;
  const { optimize } = require(optPath);

  it('produces promotion file for small grid', async () => {
    const symbols = ['PERSISTENT','POWERGRID','INFY','TCS','RELIANCE'];
    const grid = { ema_short:[8], ema_long:[50], atr_mult:[1.5], volumeFactor:[1.0] };
    const res = await optimize({ symbols, from:'2025-07-15', to:'2025-08-04', interval:'day', mode:'mock' }, grid, { parallel:2, timeoutSec:60, searchMode:'grid', refine:false });
    expect(res).toBeTruthy();
    const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
    const promoFile = fs.readdirSync(jobsDir).find(f => /promotion\.json$/.test(f));
    expect(promoFile).toBeTruthy();
  const promo = JSON.parse(fs.readFileSync(path.join(jobsDir, promoFile), 'utf8'));
  expect(promo).toHaveProperty('strategy');
  expect(promo).toHaveProperty('kfold');
  expect(Array.isArray(promo.kfold.folds)).toBe(true);
  expect(promo.kfold.folds.length).toBeGreaterThan(0);
  }, 60000);
});
