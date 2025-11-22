const { UpstoxAdapter, MockDataAdapter } = require('../dataAdapter.cjs');

test('MockDataAdapter generates deterministic candles', async ()=>{
  const m = new MockDataAdapter();
  const out1 = await m.fetch({ symbol:'TST', from:'2025-10-01', to:'2025-10-01', interval:'60m' });
  const out2 = await m.fetch({ symbol:'TST', from:'2025-10-01', to:'2025-10-01', interval:'60m' });
  expect(Array.isArray(out1)).toBe(true);
  expect(out1.length).toBeGreaterThan(0);
  expect(JSON.stringify(out1)).toEqual(JSON.stringify(out2));
});

test('UpstoxAdapter mock mode returns array without network', async ()=>{
  process.env.CTS_UPSTOX_MOCK = '1';
  const u = new UpstoxAdapter();
  const res = await u.fetch({ symbol:'MOCK', from:'2025-10-01', to:'2025-10-01', interval:'60m' });
  expect(Array.isArray(res)).toBe(true);
  delete process.env.CTS_UPSTOX_MOCK;
});
