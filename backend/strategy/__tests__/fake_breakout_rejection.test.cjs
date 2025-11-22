const { BreakoutStrategy } = require('../strategyBase.cjs');

describe('Fake breakout rejection logging', () => {
  it('logs REJECTED when wick ratio exceeds threshold', () => {
    const strat = new BreakoutStrategy();
  strat.setConfig({ N:5, wick_ratio_threshold:0.5, volumeFactor:0.5 });
    // seed with N candles
    for (let i=0;i<6;i++) {
      strat.onCandle({ date:`2025-10-0${i+1}T09:15:00Z`, open:100, high:101, low:99, close:100+i*0.1, volume:1000 });
    }
    // Candle with large upper shadow vs body
  // giant upper shadow: high far above close/open with tiny body
  strat.onCandle({ date:'2025-10-10T09:15:00Z', open:110, high:130, low:109, close:110.2, volume:900 });
    const logs = strat.getLogs();
    const rej = logs.find(l => l.action==='REJECTED');
    expect(rej).toBeTruthy();
  expect(String(rej.reason||'')).toMatch(/wickRatio/);
  });
});
