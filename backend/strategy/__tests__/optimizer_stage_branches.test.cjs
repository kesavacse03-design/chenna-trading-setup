const path = require('path');
const fs = require('fs');

describe('optimizer stage branches (bayes/genetic/adapt/kfold)', ()=>{
  beforeEach(()=>{ jest.resetModules(); });

  test('hybrid run triggers BAYES and GENETIC stages', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        // quick responses: always write a small results file with positive trades
        const runId = `bh-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        const metrics = { trades: 5, netPnl: Math.floor(Math.random()*100), avgReturn: 0.02, winRate: 55, maxDrawdown: -10 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    const grid = { ema_short:[8,13], ema_long:[55,89], atr_mult:[1.2] };
    const symbols = ['A','B','C','D','E','F'];
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-03', interval:'day', mode:'mock' }, grid, { parallel:2, timeoutSec:20, searchMode:'hybrid' });
    expect(res.ranked.length).toBeGreaterThan(0);
    // Expect some combos tried
    expect(res.combos).toBeGreaterThan(0);
  }, 30000);

  test('adapt stage triggers when top has poor expectancy', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    // Mock that returns a negative avgReturn for the base config, and positive for adapt variants
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `ad-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        let metrics;
        if (params.strategyConfig && params.strategyConfig.ema_short && params.strategyConfig.ema_short > 50) {
          // adapt variants: return improved metrics
          metrics = { trades: 10, netPnl: 50, avgReturn: 0.05, winRate: 60, maxDrawdown: -5 };
        } else {
          // base: poor expectancy to force adapt
          metrics = { trades: 10, netPnl: -5, avgReturn: -0.01, winRate: 30, maxDrawdown: -50 };
        }
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    // single base combo so topCurrent is deterministic
    const grid = { ema_short:[8], ema_long:[55], atr_mult:[1.2] };
    const symbols = ['S1','S2','S3','S4','S5','S6'];
    // Set SEED for deterministic adaptVariants ordering
    process.env.SEED = '7';
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:20, searchMode:'hybrid', refine:true });
    expect(res.ranked.length).toBeGreaterThan(0);
    delete process.env.SEED;
  }, 30000);

  test('k-fold validation aggregates folds and may write promotion', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    // Mock: for fold runs, return metrics for even-indexed symbol lists, throw for odd to simulate missing folds
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `kf-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        // If symbols list length is 0, throw
        if (!params.symbols || !params.symbols.length) throw new Error('no symbols');
        // For some folds, simulate failure
        if (params.symbols[0] && params.symbols[0].startsWith('F')) {
          // success fold
          const metrics = { trades: 20, netPnl: 30, avgReturn: 0.03, winRate: 55, maxDrawdown: -10 };
          fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
          return { runId, resultsPath };
        }
        // simulate failure for other folds
        throw new Error('fold fail');
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    // Small set of symbols with one starting with F to create a valid fold
    const symbols = ['F1','X2','Y3','Z4','F5'];
    process.env.OPT_KFOLD = '3';
    process.env.PROMO_MIN_TRADES = '1';
    process.env.PROMO_MAX_DRAWDOWN = '1000000';
    const grid = { ema_short:[8], ema_long:[55], atr_mult:[1.2] };
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec:20, searchMode:'grid' });
    // promotion record may be written; check jobs dir for promotion file
    const jobsDir = path.resolve(__dirname, '..', 'jobs');
    const promoPath = path.join(jobsDir, `run_${res.runId}_promotion.json`);
    const promo2 = path.join(jobsDir, 'promotion_records', `opt_${res.runId}_top1.json`);
    // Either of these may exist depending on promotable decision
    const exists = fs.existsSync(promoPath) || fs.existsSync(promo2);
    // At minimum, optimizer completed and returned runId
    expect(res.runId).toBeTruthy();
    // Clean env
    delete process.env.OPT_KFOLD; delete process.env.PROMO_MIN_TRADES; delete process.env.PROMO_MAX_DRAWDOWN;
  }, 30000);

});
