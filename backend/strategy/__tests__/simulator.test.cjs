const { Simulator } = require('../simulator.cjs');

describe('Simulator basic fills', () => {
  it('computeATR returns null for insufficient data and number for adequate data', () => {
    const s = new Simulator();
    expect(s.computeATR([])).toBeNull();
    const candles = [
      { high: 10, low: 9, close: 9.5 },
      { high: 11, low: 9.2, close: 10.1 },
      { high: 10.8, low: 9.5, close: 10.0 }
    ];
    const atr = s.computeATR(candles);
    expect(typeof atr).toBe('number');
    expect(atr).toBeGreaterThan(0);
  });

  it('marketOrder applies slippage and returns deterministic fields', () => {
    const s = new Simulator();
    const last = [ { open: 100, high: 101, low: 99, close: 100 } ];
    const next = { open: 100.5, high: 101.2, low: 100.0, close: 100.8, date: '2025-11-09T10:00:00Z' };
    const out = s.marketOrder({ symbol: 'TST', qty: 10, side: 'buy' }, last, next);
    expect(out).toHaveProperty('price');
    expect(out.price).toBeGreaterThanOrEqual(next.open);
    expect(out).toHaveProperty('fee');
    expect(out.fee).toBeGreaterThanOrEqual(0);
  });

  it('limitOrder fills when price within candle range and returns unfilled otherwise', () => {
    const s = new Simulator();
    const next = { high: 105, low: 95, open: 100, date: '2025-11-09T10:00:00Z' };
    const filled = s.limitOrder({ symbol: 'T', qty: 5, limit: 100, side: 'sell' }, [], next);
    expect(filled).toHaveProperty('price');
    expect(filled.price).toBe(100);
    const unfilled = s.limitOrder({ symbol: 'T', qty: 5, limit: 200, side: 'sell' }, [], next);
    expect(unfilled.status).toBe('unfilled');
  });
});
