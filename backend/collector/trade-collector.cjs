// backend/collector/trade-collector.cjs
const EventEmitter = require('events');

class TradeCollector extends EventEmitter {
  constructor({ logger = console } = {}) {
    super();
    this.logger = logger;
    this.trades = [];
    this.openTrades = new Map();
  }

  attach(emitter) {
    emitter.on('signal', sig => this._onSignal(sig));
    emitter.on('strategy:empty', info => this.logger.debug('[collector] strategy empty', info));
    emitter.on('replay:zero-bars', info => this.logger.warn('[collector] replay zero bars', info));
  }

  _onSignal(sig) {
    try {
      if (!sig || !sig.type) {
        this.logger.warn('[collector] malformed signal', sig);
        this.emit('collector:malformed-signal', sig);
        return;
      }

      const { symbol = 'UNKNOWN', price, ts, type } = sig;
      if (price == null || ts == null) {
        this.logger.warn('[collector] signal missing price/ts', sig);
        this.emit('collector:signal-missing-fields', sig);
        return;
      }

      if (type === 'entry') {
        if (this.openTrades.has(symbol)) {
          this.logger.debug(`[collector] open trade exists for ${symbol}, ignoring entry`);
          return;
        }
        const trade = {
          id: `${symbol}-${ts}`,
          symbol,
          entryTs: ts,
          entryPrice: price,
          exitTs: null,
          exitPrice: null,
          pnl: null,
          direction: sig.direction ?? 'LONG',
          reason: sig.reason ?? 'signal-entry',
          trace: sig.trace ?? []
        };
        this.openTrades.set(symbol, trade);
        this.trades.push(trade);
        this.logger.info(`[collector] opened trade ${trade.id} @ ${price}`);
        this.emit('trade:opened', trade);
        return;
      }

      if (type === 'exit' || type === 'exit-all') {
        const ot = this.openTrades.get(symbol);
        if (!ot) {
          this.logger.debug(`[collector] exit for ${symbol} but no open trade`);
          this.emit('collector:exit-no-open', { symbol, sig });
          return;
        }
        ot.exitTs = ts;
        ot.exitPrice = price;
        ot.pnl = (ot.exitPrice - ot.entryPrice) * (ot.direction === 'LONG' ? 1 : -1);
        this.openTrades.delete(symbol);
        this.logger.info(`[collector] closed trade ${ot.id} pnl=${ot.pnl}`);
        this.emit('trade:closed', ot);
        return;
      }

      this.logger.warn('[collector] unknown signal type', type);
      this.emit('collector:unknown-type', sig);
    } catch (err) {
      this.logger.error('[collector] error processing signal', err);
      this.emit('collector:error', err);
    }
  }

  getAllTrades() { return this.trades; }

  getMetrics() {
    const trades = this.trades.filter(t => typeof t.pnl === 'number');
    const wins = trades.filter(t => t.pnl > 0).length;
    const losses = trades.filter(t => t.pnl <= 0).length;
    const netPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const total = wins + losses;
    const accuracy = total === 0 ? 0 : (wins / total) * 100;
    return { trades, wins, losses, netPnl, accuracy, total };
  }
}

module.exports = TradeCollector;
