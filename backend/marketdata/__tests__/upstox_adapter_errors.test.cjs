// Tests ensuring the Upstox wrapper and underlying adapter handle retryable and non-retryable responses
jest.mock('axios');
let axios;

describe('UpstoxAdapter _fetchWithRetries axios/fetch branches', ()=>{
  beforeEach(()=>{ jest.resetModules(); axios = require('axios'); axios.get = jest.fn(); global.fetch = undefined; });

  test('axios retryable 500 then success', async ()=>{
    axios.get.mockResolvedValueOnce({ status: 500, data: 'err' });
    axios.get.mockResolvedValueOnce({ status: 200, data: { candles: [{ date:'d' }] } });
    const { UpstoxAdapter } = require('../../strategy/dataAdapter.cjs');
    const a = new UpstoxAdapter(); a.mockMode=false;
    const r = await a._fetchWithRetries('http://x', [1,1]);
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.data.candles)).toBe(true);
  });

  test('axios non-retryable 400 returns error', async ()=>{
    axios.get.mockResolvedValueOnce({ status: 400, data: { message: 'bad' } });
    const { UpstoxAdapter } = require('../../strategy/dataAdapter.cjs');
    const a = new UpstoxAdapter(); a.mockMode=false;
    const r = await a._fetchWithRetries('http://x', [1]);
    expect(r.ok).toBe(false);
  });

  test('fetch branch handles non-ok then ok', async ()=>{
    // force absence of axios during module load
    jest.resetModules();
    jest.doMock('axios', () => { throw new Error('no axios'); });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async ()=>'err' })
      .mockResolvedValueOnce({ ok: true, status:200, json: async ()=> ({ candles: [{date:'d'}] }) });
    const { UpstoxAdapter } = require('../../strategy/dataAdapter.cjs');
    const a = new UpstoxAdapter(); a.mockMode=false;
    const r = await a._fetchWithRetries('http://x', [1,1]);
    expect(r.ok).toBe(true);
    jest.dontMock('axios');
  });
});
