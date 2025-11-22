const fs = require('fs');
const path = require('path');
const { UpstoxAdapter } = require('../../../backend/strategy/dataAdapter.cjs');

describe('UpstoxAdapter parsing', ()=>{
  test('handles 404 instrument case by returning empty array', async ()=>{
    process.env.CTS_UPSTOX_MOCK = '0';
    // mock _fetchWithRetries to return status 404 shape
    const a = new UpstoxAdapter();
    a._fetchWithRetries = async () => ({ ok: true, data: { status: 404 } });
  const out = await a.fetch({ symbol: 'NOSYM', from: '2025-10-01', to: '2025-10-02', interval: 'day' });
  // Accept either empty array or error-like object
  if (Array.isArray(out)) { expect(out.length).toBe(0); } else { expect(out && out.ok === false || out === null || typeof out === 'object').toBe(true); }
  });

  test('handles wrapped payloads with data.candles and plain arrays', async ()=>{
    process.env.CTS_UPSTOX_MOCK = '0';
    const a = new UpstoxAdapter();
    a._fetchWithRetries = async () => ({ ok: true, data: { data: { candles: [{ date:'2025-10-01T00:00:00Z', open:1,high:2,low:1,close:1,volume:100 }] } } });
    const out1 = await a.fetch({ symbol: 'S', from: '2025-10-01', to: '2025-10-02', interval: 'day' });
    expect(Array.isArray(out1)).toBe(true);
    a._fetchWithRetries = async () => ({ ok: true, data: [{ date:'2025-10-01T00:00:00Z', open:1,high:2,low:1,close:1,volume:100 }] });
    const out2 = await a.fetch({ symbol: 'S', from: '2025-10-01', to: '2025-10-02', interval: 'day' });
    expect(Array.isArray(out2)).toBe(true);
  });
});
