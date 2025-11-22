describe('upstox adapter wrapper methods', ()=>{
  test('getProviderName and lookup/subscribe/tick basic behavior', async ()=>{
    const { UpstoxAdapter } = require('../adapters/upstox.cjs');
    const a = new UpstoxAdapter();
    expect(typeof a.getProviderName()).toBe('string');
    const inst = await a.lookupInstrument('ABC');
    expect(inst).toHaveProperty('symbol', 'ABC');
    const tick = await a.getTick('ABC');
    expect(tick).toBeNull();
    const sub = a.subscribeTicks('ABC', ()=>{});
    expect(typeof sub.unsubscribe).toBe('function');
    sub.unsubscribe();
  });

  test('getHistorical delegates to underlying adapter and returns array from mock mode', async ()=>{
    // enable mock mode before loading the module
    process.env.CTS_UPSTOX_MOCK = '1';
    jest.resetModules();
    const { UpstoxAdapter } = require('../adapters/upstox.cjs');
    const a = new UpstoxAdapter();
    const hist = await a.getHistorical('MOCK', '2025-01-01', '2025-01-01', 'day');
    // in mock mode the underlying adapter returns an array of candles
    expect(Array.isArray(hist)).toBe(true);
    delete process.env.CTS_UPSTOX_MOCK;
  });
});
