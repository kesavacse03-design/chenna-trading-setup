const { UpstoxAdapter } = require('../adapters/upstox.cjs');

test('UpstoxAdapter thin wrapper calls strategy adapter in mock mode', async ()=>{
  process.env.CTS_UPSTOX_MOCK = '1';
  const u = new UpstoxAdapter();
  const out = await u.getHistorical('SYM', '2025-10-01', '2025-10-01', '60m');
  expect(Array.isArray(out)).toBe(true);
  delete process.env.CTS_UPSTOX_MOCK;
});
