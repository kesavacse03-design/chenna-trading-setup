const { computePromotionRecord } = require('../optimizer.cjs');

describe('computePromotionRecord helper', ()=>{
  beforeEach(()=>{ delete process.env.PROMO_MIN_TRADES; delete process.env.PROMO_MAX_DRAWDOWN; });
  test('returns non-promotable when no valid folds', ()=>{
    const res = computePromotionRecord({ foldMetrics: [null, null], top: { config: { a:1 }, runId:'r1', metrics: null }, symbols: ['A','B'], runId:'opt-1' });
    expect(res).toBeTruthy();
    expect(res.promotable).toBe(false);
    expect(res.aggregated.trades).toBe(0);
  });
  test('returns non-promotable when trades below threshold', ()=>{
    process.env.PROMO_MIN_TRADES = '1000';
    const fm = [{ trades: 2, netPnl: 1, wins:1, losses:0, maxDrawdown: -5, avgReturn: 0.01 }];
    const res = computePromotionRecord({ foldMetrics: fm, top: { config:{}, runId:'r2', metrics: { avgReturn: 0.01, maxDrawdown: -5, trades:2 } }, symbols:['A'], runId:'opt-2' });
    expect(res.promotable).toBe(false);
    expect(res.aggregated.trades).toBe(2);
  });
  test('promotes when expectancy positive and trades exceed threshold', ()=>{
    process.env.PROMO_MIN_TRADES = '1';
    const fm = [ { trades: 10, netPnl: 100, wins:6, losses:4, maxDrawdown: -10, avgReturn: 0.5 } ];
    const res = computePromotionRecord({ foldMetrics: fm, top: { config:{}, runId:'r3', metrics: { avgReturn:0.5, maxDrawdown:-10, trades:10 } }, symbols:['A'], runId:'opt-3', avgCpuPercent: 12.3 });
    expect(res.promotable).toBe(true);
    expect(res.promotionRecord).toBeTruthy();
    expect(res.promotionRecord.promoted).toBe(res.promotable);
    expect(res.aggregated.trades).toBe(10);
  });
});
