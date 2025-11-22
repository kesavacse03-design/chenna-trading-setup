const { LiveEngine } = require('../liveRunner.cjs');

// Mock the adapter
jest.mock('../upstoxOrderAdapter.cjs', () => ({
  UpstoxOrderAdapter: jest.fn().mockImplementation(() => ({
    submit: jest.fn().mockResolvedValue({ orderId: 'test', symbol: 'TEST', side: 'buy', qty: 10, price: 100, ts: '2025-11-03', status: 'filled' })
  }))
}));

describe('LiveEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new LiveEngine();
    engine.onLog = jest.fn();
  });

  test('processCandle with entry signal', async () => {
    // Mock strategy to have pending signal
    engine.strat.getPending = jest.fn().mockReturnValue({ side: 'buy', qty: 10, stop: 95, target: 110, reason: 'test' });
    engine.strat.onFill = jest.fn();
    engine.strat.clearPending = jest.fn();

    const candle = { symbol: 'TEST', date: '2025-11-03', open: 100, high: 105, low: 95, close: 102, volume: 1000 };
    await engine.processCandle(candle, { isStopped: false, rateLimits: new Map(), maxExposure: 100000, currentExposure: 0, errors: [], initialCapital: 100000, currentCapital: 100000, metrics: { trades: 0, orders: 0, errors: 0 } });

    expect(engine.strat.onCandle).toHaveBeenCalledWith({ date: '2025-11-03', open: 100, high: 105, low: 95, close: 102, volume: 1000 });
    expect(engine.sim.submit).toHaveBeenCalled();
    expect(engine.openPositions.has('TEST')).toBe(true);
  });

  test('processCandle with exit on stop', async () => {
    engine.openPositions.set('TEST', { entry: 100, stop: 95, target: 110, qty: 10, ts: '2025-11-02', entryReason: 'test' });
    engine.strat.getPending = jest.fn().mockReturnValue(null);

    const candle = { symbol: 'TEST', date: '2025-11-03', open: 100, high: 105, low: 90, close: 92, volume: 1000 };
    await engine.processCandle(candle, { isStopped: false, rateLimits: new Map(), maxExposure: 100000, currentExposure: 1000, errors: [], initialCapital: 100000, currentCapital: 100000, metrics: { trades: 0, orders: 0, errors: 0 } });

    expect(engine.allTrades.length).toBe(1);
    expect(engine.allTrades[0].exitReason).toBe('stop');
    expect(engine.openPositions.has('TEST')).toBe(false);
  });
});
