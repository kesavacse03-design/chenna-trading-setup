const StrategyBase = require('./strategy-base.cjs');
class TestStrategy extends StrategyBase {
  async generateSignals(candle, context) {
    const idx = context.barIndex ?? 0;
    if (idx === 0) return { type: 'entry', price: candle.close, ts: candle.ts, symbol: context.symbol, direction: 'LONG', reason: 'test-entry' };
    if (idx === 1) return { type: 'exit', price: candle.close, ts: candle.ts, symbol: context.symbol, reason: 'test-exit' };
    return [];
  }
}
module.exports = TestStrategy;
