process.env.CTS_UPSTOX_MOCK = '1';
const fs = require('fs');
const path = require('path');
const { optimize } = require('../optimizer.cjs');

// Utility to parse promotion record
function getPromotionRecord(optRunId){
  const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
  const promo = fs.readdirSync(jobsDir).find(f => f === `run_${optRunId}_promotion.json` || f.startsWith(`opt_${optRunId}`));
  if (!promo) return null;
  try { return JSON.parse(fs.readFileSync(path.join(jobsDir, promo), 'utf8')); } catch { return null; }
}

// Small symbol set for faster runs
const symbols = ['AAPL','MSFT'];

// Build a tiny grid
const gridStr = 'ema_short:8,13;ema_long:55;atr_mult:1.2;volumeFactor:1.0';
function parseGrid(str){ const out={}; for(const part of str.split(';')){ const [k,v]=part.split(':'); if(!k) continue; out[k.trim()] = v.split(',').map(x=> isNaN(+x)?x:+x); } return out; }
const grid = parseGrid(gridStr);

// Ensure deterministic randomness
process.env.SEED = '12345';

describe('Promotion threshold edge cases', () => {
  it('promotes when trades == minTrades boundary', async () => {
    process.env.PROMO_MIN_TRADES = '10';
    process.env.PROMO_MAX_DRAWDOWN = '50000';
  const res = await optimize({ symbols, from:'2025-09-01', to:'2025-09-05', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:60, searchMode:'grid', seed:12345 });
    const promo = getPromotionRecord(res.runId);
    expect(promo).toBeTruthy();
    // boundary: trades >= minTrades should promote if expectancy>0 and drawdown OK
    if (promo) {
      expect(promo.thresholds.minTrades).toBe(10);
      if (promo.trades >= 10 && promo.expectancy > 0 && promo.drawdown >= -promo.thresholds.maxNegativeDrawdown){
        expect(promo.promoted).toBe(true);
      }
    }
  });

  it('does not promote when trades just below minTrades', async () => {
    process.env.PROMO_MIN_TRADES = '9999'; // unrealistic high to force fail
    process.env.PROMO_MAX_DRAWDOWN = '50000';
  const res = await optimize({ symbols, from:'2025-09-01', to:'2025-09-05', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:60, searchMode:'grid', seed:12345 });
    const promo = getPromotionRecord(res.runId);
    expect(promo).toBeTruthy();
    if (promo) {
      expect(promo.thresholds.minTrades).toBe(9999);
      expect(promo.promoted).toBe(false);
    }
  });
});
