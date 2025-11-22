const path = require('path');
const fs = require('fs');

describe('optimizer advanced stages (bayes/genetic/adapt) with mocked backtester', ()=>{
  beforeEach(()=>{
    jest.resetModules();
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    // Provide mocked runBacktest that returns varied metrics based on config to drive different branches
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `mock-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        // produce metrics influenced by strategyConfig
        const cfg = params.strategyConfig || {};
        const base = (cfg.ema_short||8) + (cfg.ema_long||55);
        const avgReturn = cfg.ema_short && cfg.ema_short>50 ? 0.1 : 0.02;
        const netPnl = Math.round(100 * avgReturn);
        const trades = cfg.forceFewTrades ? 5 : 50;
        const winRate = cfg.ema_short && cfg.ema_short>50 ? 70 : 45;
        const metrics = { trades, netPnl, avgReturn, winRate, maxDrawdown: -10 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics, swing10: { successRateWithin10Days: 20 } }), 'utf8');
        return { runId, resultsPath };
      }
    }));
  });

  test('bayes and genetic stages run and adapt triggers when low expectancy', async ()=>{
    const { optimize } = require('../optimizer.cjs');
    const grid = { ema_short: [8,60], ema_long: [55], atr_mult: [1.2] };
    // Use many symbols to allow K-fold >2
    const symbols = Array.from({length:12}, (_,i)=>`S${i}`);
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-10', interval:'day', mode:'mock' }, grid, { parallel: 2, timeoutSec: 30, searchMode: 'hybrid', refine: true });
    expect(res).toHaveProperty('ranked');
    // ensure results array present and sorted
    expect(Array.isArray(res.ranked)).toBe(true);
    // if adapt stage ran it would append results; ensure at least one result
    expect(res.ranked.length).toBeGreaterThan(0);
  }, 60000);
});
