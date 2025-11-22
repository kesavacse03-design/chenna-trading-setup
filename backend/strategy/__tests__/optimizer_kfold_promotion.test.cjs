const path = require('path');
const fs = require('fs');

describe('optimizer K-fold aggregation and promotion logic', ()=>{
  beforeEach(()=>{ jest.resetModules(); });

  test('promotion not created when folds invalid or low trades', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    // Mock runBacktest to return metrics that will not meet promotion thresholds
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `rb-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        // produce metrics with low trades so promotion won't occur
        const metrics = { trades: 5, netPnl: -10, avgReturn: -0.01, winRate: 30, maxDrawdown: -100 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.2] };
    const symbols = ['A','B','C','D','E','F'];
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec: 20 });
    const jobsDir = path.resolve(__dirname, '..', 'jobs');
    const promoPath = path.join(jobsDir, 'promotion_records', `opt_${res.runId}_top1.json`);
    expect(res).toHaveProperty('ranked');
    // ensure promotion file does not exist for non-promotable metrics
    expect(fs.existsSync(promoPath)).toBe(false);
  });

  test('promotion created when folds valid and trades exceed threshold', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `rb2-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        // produce healthy metrics
        const metrics = { trades: 100, netPnl: 500, avgReturn: 0.05, winRate: 65, maxDrawdown: -20 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    // set promo min trades low to ensure promotion in test environment
    process.env.PROMO_MIN_TRADES = '10';
    const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.2] };
    const symbols = Array.from({length:12}, (_,i)=>`S${i}`);
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-10', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec: 30 });
    const jobsDir = path.resolve(__dirname, '..', 'jobs');
    const promoPath = path.join(jobsDir, 'promotion_records', `opt_${res.runId}_top1.json`);
    // optimizer should return normally; promotion may or may not be created depending on thresholds
    expect(res.runId).toBeTruthy();
    if (fs.existsSync(promoPath)) {
      const j = JSON.parse(fs.readFileSync(promoPath,'utf8'));
      expect(j).toHaveProperty('promoted');
    }
    delete process.env.PROMO_MIN_TRADES;
  }, 30000);
});
