// backend/replay/replay-engine.cjs
const EventEmitter = require('events');

function createReplayEngine({ candles = [], emitEventName = 'candle', logger = console }) {
  const emitter = new EventEmitter();

  async function runReplay() {
    logger.info(`[replay] start: total candles received = ${candles.length}`);
    if (!Array.isArray(candles) || candles.length === 0) {
      logger.warn('[replay] WARN: replay engine received ZERO candles. Check data source & time filters.');
      emitter.emit('replay:zero-bars', { reason: 'no-candles', count: 0 });
      return emitter;
    }

    candles.sort((a, b) => (a.ts || a.time || a.t) - (b.ts || b.time || b.t));
    let emitted = 0;
    for (const c of candles) {
      const normalized = {
        ts: c.ts ?? c.time ?? c.t ?? null,
        open: c.open ?? c.o ?? null,
        high: c.high ?? c.h ?? null,
        low: c.low ?? c.l ?? null,
        close: c.close ?? c.c ?? null,
        volume: c.volume ?? c.v ?? 0
      };

      if (normalized.ts == null) {
        logger.warn('[replay] skipping candle with missing ts:', c);
        continue;
      }
      emitter.emit(emitEventName, normalized);
      emitted++;
    }

    logger.info(`[replay] finished. emitted ${emitted} / ${candles.length} candles`);
    if (emitted === 0) emitter.emit('replay:zero-bars', { reason: 'filtered-all', count: emitted });
    emitter.emit('replay:done', { emitted });
    return emitter;
  }

  return { emitter, runReplay };
}

module.exports = { createReplayEngine };
