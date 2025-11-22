const { EMA, RSI } = require('../strategy/indicators.cjs');

test('EMA basic smoothing', () => {
  const ema = new EMA(3);
  const vals = [10, 11, 12, 13, 14, 15];
  const outs = [];
  for (const v of vals) outs.push(ema.update(v));
  // After seed window, EMA should be defined, finite and non-decreasing
  const defined = outs.filter(x => x !== null && x !== undefined);
  expect(defined.length).toBeGreaterThan(0);
  const last = defined[defined.length - 1];
  expect(Number.isFinite(last)).toBe(true);
  for (let i = 1; i < defined.length; i++) {
    expect(defined[i]).toBeGreaterThanOrEqual(defined[i - 1]);
  }
});

test('RSI basic range', () => {
  const rsi = new RSI(3);
  const vals = [50, 52, 54, 56, 58, 60]; // steady gains
  const outs = [];
  for (const v of vals) outs.push(rsi.update(v));
  const last = outs[outs.length-1];
  expect(last).toBeGreaterThan(70); // should be a high RSI
});
