const fs = require('fs');
const path = require('path');

describe('MarketData recovery', () => {
  const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
  beforeEach(() => { process.env.MARKETDATA_DISABLE_SNAPSHOTS='1'; try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}; try { fs.rmSync(path.join(jobsDir,'marketdata_status.json')); } catch(_){} });

  it('recovers to primary and sets LIVE mode after reconciliation', async () => {
    delete global.__MARKETDATA_ADAPTER__;
    jest.resetModules();
    const { MarketDataAdapter, loadConfig } = require('..\\index.cjs');
    const cfg = loadConfig();
    const m = new MarketDataAdapter(cfg);
    // Trip circuit manually
    for (let i=0;i<5;i++) m.health.cb.record(502, 50);
    await m._maybeTrip();
    expect(m.health.activeProvider).toBe('CACHE');
    // simulate good responses
    for (let i=0;i<8;i++) m.health.cb.record(200, 40);
  const ok = await m.attemptRecovery();
    expect(ok).toBe(true);
    expect(m.health.activeProvider).toBe('UPSTOX');
    const statusPath = path.join(jobsDir, 'marketdata_status.json');
    const s = JSON.parse(fs.readFileSync(statusPath,'utf8'));
    expect(s.execution_mode).toBe('LIVE');
  // write one-shot health snapshot
  const snap = m.health.writeSnapshotNow();
  expect(fs.existsSync(snap)).toBe(true);
  });
});
