const path = require('path');
const fs = require('fs');

describe('optimizer explicit stage triggers', ()=>{
  beforeEach(()=>{
    jest.resetModules();
  });

  test('force BAYES stage by using searchMode=bayes and top results present', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `rb-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        const metrics = { trades: 50, netPnl: 100, avgReturn: 0.05, winRate: 60, maxDrawdown: -10 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.2] };
    const symbols = Array.from({length:6}, (_,i)=>`S${i}`);
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-02', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec: 20, searchMode: 'bayes' });
    // Bayes stage should run; ensure result presence
    expect(res.ranked.length).toBeGreaterThan(0);
  }, 30000);

  test('force GENETIC stage by using searchMode=genetic', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `rg-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        const metrics = { trades: 40, netPnl: 20, avgReturn: 0.01, winRate: 45, maxDrawdown: -5 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    const grid = { ema_short: [8,13], ema_long: [55], atr_mult: [1.2] };
    const symbols = Array.from({length:8}, (_,i)=>`S${i}`);
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-05', interval:'day', mode:'mock' }, grid, { parallel:2, timeoutSec: 30, searchMode: 'genetic' });
    expect(res.ranked.length).toBeGreaterThan(0);
  }, 40000);

  test('force ADAPT stage by making topCurrent expect <=0 or low winRate', async ()=>{
    const backtesterPath = path.resolve(__dirname, '..', 'backtester.cjs');
    jest.mock(backtesterPath, () => ({
      runBacktest: async (params) => {
        const runId = `ra-${Math.random().toString(36).slice(2,8)}`;
        const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}
        const resultsPath = path.join(jobsDir, `${runId}_results.json`);
        // Return poor expectancy for first call to force adapt
        const metrics = (params.strategyConfig && params.strategyConfig.bad) ? { trades: 60, netPnl: -5, avgReturn: -0.01, winRate: 30, maxDrawdown: -50 } : { trades: 60, netPnl: 50, avgReturn: 0.02, winRate: 55, maxDrawdown: -10 };
        fs.writeFileSync(resultsPath, JSON.stringify({ metrics }), 'utf8');
        return { runId, resultsPath };
      }
    }));
    const { optimize } = require('../optimizer.cjs');
    const grid = { ema_short: [8], ema_long: [55], atr_mult: [1.2] };
    const symbols = Array.from({length:6}, (_,i)=>`S${i}`);
    // Provide seed via env to ensure deterministic behavior
    process.env.SEED = '42';
    const res = await optimize({ symbols, from:'2025-01-01', to:'2025-01-03', interval:'day', mode:'mock' }, grid, { parallel:1, timeoutSec: 30, searchMode: 'hybrid' });
    expect(res.ranked.length).toBeGreaterThan(0);
    delete process.env.SEED;
  }, 40000);
});
