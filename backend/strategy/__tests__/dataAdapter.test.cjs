process.env.CTS_UPSTOX_MOCK = '1';
const { MockDataAdapter, UpstoxAdapter } = require('../dataAdapter.cjs');

describe('dataAdapter basics', () => {
  it('MockDataAdapter produces deterministic candles and shape', async () => {
    const m = new MockDataAdapter();
    const params = { symbol: 'TEST', from: '2025-11-01', to: '2025-11-01', interval: '1m' };
    const d1 = await m.fetch(params);
    const d2 = await m.fetch(params);
    expect(Array.isArray(d1)).toBeTruthy();
    expect(d1.length).toBeGreaterThan(0);
    // Deterministic for same inputs
    expect(JSON.stringify(d1)).toEqual(JSON.stringify(d2));
    const c = d1[0];
    expect(c).toHaveProperty('date');
    expect(c).toHaveProperty('open');
    expect(c).toHaveProperty('high');
    expect(c).toHaveProperty('low');
    expect(c).toHaveProperty('close');
    expect(c).toHaveProperty('volume');
  });

  it('UpstoxAdapter._fetchWithRetries respects mock mode', async () => {
    const a = new UpstoxAdapter();
    // in mock mode _fetchWithRetries should return ok with empty candles payload
    const res = await a._fetchWithRetries('http://example.invalid');
    expect(res).toBeDefined();
    expect(res.ok).toBeTruthy();
    expect(res.data).toBeDefined();
  });
});
