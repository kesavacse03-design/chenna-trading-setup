const fs = require('fs');
const path = require('path');

describe('Optimizer adaptive stage trigger', () => {
  const optPath = path.resolve(__dirname, '..', 'optimizer.cjs');
  if (!fs.existsSync(optPath)) return;
  const { optimize } = require(optPath);

  it('runs ADAPT_STAGE when top expectancy <=0', async () => {
    // Use config likely to produce low/no trades by extreme filters
    const symbols = ['A_LOW','B_LOW'];
    const grid = { ema_short:[5], ema_long:[200], atr_mult:[3.5], volumeFactor:[5.0] }; // unrealistic strong filters
    const res = await optimize({ symbols, from:'2025-10-01', to:'2025-10-10', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:40, refine:true, searchMode:'grid' });
    expect(res).toBeTruthy();
    const logFiles = fs.readdirSync(path.resolve(__dirname, '..', '..', 'jobs')).filter(f=>f.includes(res.runId) && f.endsWith('_logs.txt'));
    expect(logFiles.length).toBeGreaterThan(0);
    const logContent = fs.readFileSync(path.join(path.resolve(__dirname, '..', '..', 'jobs'), logFiles[0]), 'utf8');
    expect(/ADAPT_STAGE start/.test(logContent)).toBe(true);
  }, 60000);
});
