const { MockDataAdapter, UpstoxAdapter } = require('../dataAdapter.cjs');
const fs = require('fs');

describe('dataAdapter edgecases', ()=>{
  test('MockDataAdapter deterministic output length and keys', async ()=>{
    const m = new MockDataAdapter();
    const a = await m.fetch({ symbol: 'TEST', from: '2025-10-01', to: '2025-10-02', interval: '60m' });
    const b = await m.fetch({ symbol: 'TEST', from: '2025-10-01', to: '2025-10-02', interval: '60m' });
    expect(Array.isArray(a)).toBe(true);
    expect(a.length).toBe(b.length);
    expect(a[0]).toHaveProperty('open');
    expect(a[0]).toHaveProperty('high');
    expect(a[0]).toHaveProperty('low');
    expect(a[0]).toHaveProperty('close');
    expect(a[0]).toHaveProperty('volume');
  });

  test('UpstoxAdapter mock mode returns array and does not call http', async ()=>{
    process.env.CTS_UPSTOX_MOCK = '1';
    const u = new UpstoxAdapter();
    const out = await u.fetch({ symbol: 'AAPL', from: '2025-10-01', to: '2025-10-02', interval: '60m' });
    expect(Array.isArray(out)).toBe(true);
    // should be an array of candles
    expect(out.length).toBeGreaterThan(0);
    delete process.env.CTS_UPSTOX_MOCK;
  });

  test('UpstoxAdapter handles 404-shaped response (returns empty array)', async ()=>{
    process.env.CTS_UPSTOX_MOCK = '0';
    const u = new UpstoxAdapter();
    // simulate _fetchWithRetries returning a 404-shaped object by monkeypatching
    u._fetchWithRetries = async () => ({ ok: true, data: { status: 404, data: [] } });
    const out = await u.fetch({ symbol: 'MISSING', from: '2025-10-01', to: '2025-10-02', interval: '60m' });
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(0);
    delete process.env.CTS_UPSTOX_MOCK;
  });
});
