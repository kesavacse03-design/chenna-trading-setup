const fs = require('fs');
const path = require('path');

describe('Backtest integration under fallback', () => {
  it('runs mini backtest and writes trades CSV with fallback active', async () => {
    process.env.CTS_UPSTOX_MOCK = '0'; // use real adapter path but we will trip circuit
    const { runBacktest } = require('../../strategy/backtester.cjs');
    const { MarketDataAdapter, loadConfig } = require('..\\index.cjs');
    delete global.__MARKETDATA_ADAPTER__;
  process.env.MARKETDATA_DISABLE_SNAPSHOTS='1';
  const m = new MarketDataAdapter(loadConfig());
    // cause fallback
    for (let i=0;i<5;i++) m.health.cb.record(502, 100);
    await m._maybeTrip();
    // three symbols, tiny range; ensure TEST_FORCE_TRADE for determinism
    process.env.TEST_FORCE_TRADE = '1';
    const out = await runBacktest({ symbols:['MSFT','AAPL','GOOG'], from:'2025-10-01', to:'2025-10-03', interval:'day', mode:'upstox' }, { onLog:()=>{} });
    const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
    const csvPath = path.join(jobsDir, `run_${out.runId}_trades.csv`);
    const jsonPath = path.join(jobsDir, `job_${out.runId}.json`);
    expect(fs.existsSync(csvPath)).toBe(true);
    expect(fs.existsSync(jsonPath)).toBe(true);
    const statusPath = path.join(jobsDir, 'marketdata_status.json');
    expect(fs.existsSync(statusPath)).toBe(true);
  const snap = m.health.writeSnapshotNow();
  expect(fs.existsSync(snap)).toBe(true);
  });
});
