const { computeSeries } = require('../strategy/indicators.cjs');
const { ATR, EMA, RSI } = require('../strategy/indicators.cjs');

describe('indicators smoke tests', () => {
  test('EMA computes expected length and non-NaN values', () => {
    const prices = Array.from({length: 50}, (_,i)=>100 + Math.sin(i/5)*2 + i*0.1);
    const ema = computeSeries('ema', prices, { period: 10 });
    expect(Array.isArray(ema)).toBe(true);
    expect(ema.length).toBe(prices.length);
    const tail = ema.slice(-5);
    tail.forEach(v => expect(Number.isFinite(v)).toBe(true));
  });

  test('RSI produces values between 0 and 100 and no NaN for flat data', () => {
    const prices = Array(60).fill(100);
    const rsi = computeSeries('rsi', prices, { period: 14 });
    expect(rsi.length).toBe(prices.length);
    const tail = rsi.slice(-10);
    tail.forEach(v => expect(Number.isFinite(v)).toBe(true));
    tail.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    tail.forEach(v => expect(v).toBeLessThanOrEqual(100));
  });

  test('ATR non-negative and finite', () => {
  const high = Array.from({length:50}, (_,i)=>101 + i*0.2);
  const low = high.map(h => h - 1 - (Math.random()*0.5));
  const close = high.map((h,i)=> (h + low[i]) / 2);
  const bars = high.map((h,i)=> ({ high: h, low: low[i], close: close[i], volume: 1000 }));
  const atr = computeSeries('atr', bars, { period: 14 });
  expect(Array.isArray(atr)).toBe(true);
  expect(atr.length).toBe(bars.length);
  atr.slice(-5).forEach(v => expect(Number.isFinite(v) && v >= 0).toBe(true));
  });
});
