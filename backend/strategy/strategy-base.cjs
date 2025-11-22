// backend/strategy/strategy-base.cjs
const EventEmitter = require('events');

class StrategyBase extends EventEmitter {
  constructor({ logger = console } = {}) {
    super();
    this.logger = logger;
  }

  async onCandle(candle, context = {}) {
    try {
      const signals = await this.generateSignals(candle, context);

      if (!signals || (Array.isArray(signals) && signals.length === 0)) {
        this.logger.debug(`[strategy] no signals for ts=${candle.ts}`);
        this.emit('strategy:empty', { ts: candle.ts, symbol: context.symbol });
        return [];
      }

      const normalized = (Array.isArray(signals) ? signals : [signals]).map(s => ({
        ...s,
        ts: s.ts ?? candle.ts,
        price: s.price ?? candle.close,
        symbol: s.symbol ?? context.symbol ?? 'UNKNOWN'
      }));

      normalized.forEach(sig => this.emit('signal', sig));
      this.logger.info(`[strategy] emitted ${normalized.length} signal(s) for ts=${candle.ts}`);
      return normalized;
    } catch (err) {
      this.logger.error('[strategy] ERROR in generateSignals:', err);
      this.emit('strategy:error', { error: err, ts: candle.ts, symbol: context.symbol });
      return [];
    }
  }

  async generateSignals() { return []; }
}

module.exports = StrategyBase;
