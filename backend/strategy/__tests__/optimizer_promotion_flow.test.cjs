const fs = require('fs');
const path = require('path');

// Mock backtester to return promotable metrics
const backtesterPath = require.resolve('../backtester.cjs');
jest.mock(backtesterPath, () => {
  const fs = require('fs'); const path = require('path'); let counter=0;
  return {
    runBacktest: async (req, opts={}) => {
      counter++;
      const jobsDir = path.resolve(__dirname, '..', '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
      const outPath = path.join(jobsDir, `promo-mock-run-${counter}-results.json`);
      // produce promotable metrics: trades >= 1 and avgReturn > 0
      const metrics = { netPnl: 100, winRate: 60, maxDrawdown: -50, trades: 5, avgReturn: 0.05, profitFactor: 2 };
      fs.writeFileSync(outPath, JSON.stringify({ metrics, swing10: { successWithin10Days: 1 } }), 'utf8');
      return { runId: `promo-mock-run-${counter}`, resultsPath: outPath };
    }
  };
});

const { optimize } = require('../optimizer.cjs');

describe('optimizer promotion flow', ()=>{
  jest.setTimeout(30000);
  test('writes promotion record when promotable', async ()=>{
    // ensure promotion thresholds low so test promotes
    process.env.PROMO_MIN_TRADES = '1';
    process.env.PROMO_MAX_DRAWDOWN = '100000';
    const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.2] };
    const symbols = ['AAPL','MSFT','GOOG'];
    const res = await optimize({ symbols, from:'2025-10-01', to:'2025-10-05', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:30 });
    const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
    const promoDir = path.join(jobsDir, 'promotion_records');
    const files = fs.existsSync(promoDir) ? fs.readdirSync(promoDir) : [];
    expect(files.length).toBeGreaterThan(0);
    // cleanup env
    delete process.env.PROMO_MIN_TRADES;
    delete process.env.PROMO_MAX_DRAWDOWN;
  });
});
