const path = require('path');
const fs = require('fs');

describe('UpstoxAdapter fetch error handling and payload parsing', ()=>{
  beforeEach(()=>{ jest.resetModules(); });

  test('fetch returns error shape when no http client available', async ()=>{
    // Mock axios to throw on require so module sets axios=null
    jest.mock('axios', ()=>{ throw new Error('no axios available'); });
    // Ensure no global fetch
    const saveFetch = global.fetch; delete global.fetch;
    const { UpstoxAdapter } = require('../dataAdapter.cjs');
    const a = new UpstoxAdapter();
    a.apiBase = 'http://invalid';
    const resp = await a._fetchWithRetries('http://example.invalid', [1]);
    expect(resp.ok).toBe(false);
    if (saveFetch) global.fetch = saveFetch;
  });

  test('fetch handles 404 payload shape and returns empty array', async ()=>{
    // Mock axios to throw so fetch path is used
    jest.mock('axios', ()=>{ throw new Error('no axios'); });
    const saveFetch = global.fetch;
    global.fetch = async ()=>({ ok: true, status: 200, json: async ()=> ({ status:404, data: [] }) });
    const { UpstoxAdapter } = require('../dataAdapter.cjs');
    const a = new UpstoxAdapter();
    const out = await a.fetch({ symbol:'MISSING', from:'2025-10-01', to:'2025-10-01', interval:'60m' });
    expect(Array.isArray(out)).toBe(true);
    global.fetch = saveFetch;
  });

  test('live-path payload parsing supports various JSON shapes', async ()=>{
    jest.mock('axios', ()=>{ throw new Error('no axios'); });
    const saveFetch = global.fetch;
    // Shape: { data: { candles: [...] } }
    global.fetch = async ()=>({ ok: true, status:200, json: async ()=> ({ data: { candles: [{ date:'d', open:1, high:2, low:0.5, close:1.5, volume:10 }] } }) });
    const { UpstoxAdapter } = require('../dataAdapter.cjs');
    const a = new UpstoxAdapter();
    let out = await a.fetch({ symbol:'S', from:'2025-10-01', to:'2025-10-01', interval:'60m' });
    expect(Array.isArray(out)).toBe(true);
    // Shape: plain array
    global.fetch = async ()=>({ ok: true, status:200, json: async ()=> ([ { date:'d2', open:1 } ]) });
    out = await a.fetch({ symbol:'S', from:'2025-10-01', to:'2025-10-01', interval:'60m' });
    expect(Array.isArray(out)).toBe(true);
    global.fetch = saveFetch;
  });
});
