const { compositeScore } = require('../strategy/optimizer.cjs');

describe('optimizer ranking helpers', () => {
  test('compositeScore orders better metrics higher', () => {
  const a = { netPnl: 1000, winRate: 40, maxDrawdown: 200 };
  const b = { netPnl: 2000, winRate: 60, maxDrawdown: 100 };
    const sa = compositeScore(a);
    const sb = compositeScore(b);
    expect(Number.isFinite(sa)).toBe(true);
    expect(Number.isFinite(sb)).toBe(true);
  expect(sb).toBeGreaterThanOrEqual(sa);
  });

  test('post-processing filter logic simulated: picks only with trades', () => {
    // Simulate small ranked array
    const ranked = [
      { metrics: { trades: 0 }, config: { id: 1 } },
      { metrics: { trades: 3 }, config: { id: 2 } },
      { metrics: { trades: 0 }, config: { id: 3 } },
    ];
    // Emulate the selection logic from optimizer: prefer entries with trades
    const withTrades = ranked.filter(r => r && r.metrics && Number(r.metrics.trades) > 0);
    expect(withTrades.length).toBe(1);
    expect(withTrades[0].config.id).toBe(2);
  });
});
