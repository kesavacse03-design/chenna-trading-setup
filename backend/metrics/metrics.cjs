// backend/metrics/metrics.cjs
function computeMetrics(trades = [], logger = console) {
  logger.info(`[metrics] computing metrics for ${trades.length} trade(s)`);
  const validTrades = trades.filter(t => typeof t.pnl === 'number');
  if (validTrades.length === 0) {
    logger.warn('[metrics] WARN: no trades with numeric pnl. metrics will be zeros.');
  }

  const wins = validTrades.filter(t => t.pnl > 0).length;
  const losses = validTrades.filter(t => t.pnl <= 0).length;
  const netPnl = validTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const total = wins + losses;
  const accuracy = total === 0 ? 0 : (wins / total) * 100;

  const metrics = { wins, losses, netPnl, total, accuracy };
  logger.info('[metrics] result=', metrics);
  return metrics;
}

module.exports = { computeMetrics };
