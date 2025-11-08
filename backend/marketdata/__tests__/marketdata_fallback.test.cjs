const fs = require('fs');
const path = require('path');

jest.useFakeTimers();
jest.spyOn(global, 'setInterval');

describe('MarketData fallback circuit', () => {
  const jobsDir = path.resolve(__dirname, '..', '..', 'jobs');
  beforeEach(() => { process.env.MARKETDATA_DISABLE_SNAPSHOTS='1'; try { fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){}; try { fs.rmSync(path.join(jobsDir,'marketdata_status.json')); } catch(_){} });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('trips to fallback and sets PAPER mode', async () => {
    delete global.__MARKETDATA_ADAPTER__;
    jest.resetModules();
    const { MarketDataAdapter, loadConfig } = require('..\\index.cjs');
    const cfg = loadConfig();
    const m = new MarketDataAdapter(cfg);
    // simulate 5 consecutive 502s
    for (let i=0;i<5;i++) { m.health.cb.record(502, 120); }
    await m._maybeTrip();
    const statusPath = path.join(jobsDir, 'marketdata_status.json');
    expect(fs.existsSync(statusPath)).toBe(true);
    const s = JSON.parse(fs.readFileSync(statusPath,'utf8'));
    expect(s.provider).toBe('CACHE');
    expect(s.execution_mode).toBe('PAPER');
  });
});
