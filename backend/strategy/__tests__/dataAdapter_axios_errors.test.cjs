const path = require('path');
const fs = require('fs');

// Mock axios to return various responses to exercise _fetchWithRetries
jest.mock('axios');

describe('UpstoxAdapter axios error branches', ()=>{
  let axios;
  beforeEach(()=>{
    // ensure we re-require modules so the adapter loads the mocked axios instance
    jest.resetModules();
    axios = require('axios');
    axios.get = jest.fn();
  });

  test('axios returns 500 then 200, adapter retries and returns data', async ()=>{
    // mock sequence: first 500, then 200
    axios.get.mockResolvedValueOnce({ status: 500, data: 'err' });
    axios.get.mockResolvedValueOnce({ status: 200, data: { candles: [{ date: 'd', open:1 }] } });
    const { UpstoxAdapter } = require('../dataAdapter.cjs');
    const a = new UpstoxAdapter();
    a.mockMode = false;
    const r = await a._fetchWithRetries('http://example', [1,1]);
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.data.candles)).toBe(true);
  });

  test('axios non-retryable 400 returns error', async ()=>{
    axios.get.mockResolvedValueOnce({ status: 400, data: { message: 'bad' } });
    const { UpstoxAdapter } = require('../dataAdapter.cjs');
    const a = new UpstoxAdapter(); a.mockMode=false;
    const r = await a._fetchWithRetries('http://example', [1]);
    expect(r.ok).toBe(false);
  });
});
