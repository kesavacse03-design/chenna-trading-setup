const { MockDataAdapter, UpstoxAdapter } = require('../dataAdapter.cjs');

describe('MockDataAdapter', ()=>{
  test('generates deterministic candles and shape (day interval)', async ()=>{
    const m = new MockDataAdapter();
    const out1 = await m.fetch({ symbol: 'AAPL', from: '2025-10-01', to: '2025-10-02', interval: 'day' });
    const out2 = await m.fetch({ symbol: 'AAPL', from: '2025-10-01', to: '2025-10-02', interval: 'day' });
    expect(Array.isArray(out1)).toBe(true);
    expect(out1.length).toBeGreaterThan(0);
    expect(out1).toEqual(out2);
    const c = out1[0];
    expect(c).toHaveProperty('date');
    expect(c).toHaveProperty('open');
    expect(c).toHaveProperty('high');
    expect(c).toHaveProperty('low');
    expect(c).toHaveProperty('close');
    expect(c).toHaveProperty('volume');
  });

  test('generates minute candles for 1m interval', async ()=>{
    const m = new MockDataAdapter();
    const out = await m.fetch({ symbol: 'TEST', from: '2025-11-01', to: '2025-11-01', interval: '1m' });
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(10);
  });
});

describe('UpstoxAdapter mock mode', ()=>{
  beforeAll(()=>{ process.env.CTS_UPSTOX_MOCK = '1'; });
  afterAll(()=>{ delete process.env.CTS_UPSTOX_MOCK; });

  test('._fetchWithRetries returns ok payload in mock mode', async ()=>{
    const a = new UpstoxAdapter();
    const res = await a._fetchWithRetries('http://example.invalid');
    expect(res).toBeDefined();
    expect(res.ok).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data.candles).toBeDefined();
  });

  test('.fetch returns synthetic array via MockDataAdapter', async ()=>{
    const a = new UpstoxAdapter();
    const out = await a.fetch({ symbol: 'MSFT', from: '2025-10-01', to: '2025-10-02', interval: 'day' });
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });
});
