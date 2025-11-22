const path = require('path');

// Explicitly resolve Prisma client from chenna-CTS/backend/node_modules
const prismaClientPath = path.resolve(__dirname, '../../chenna-CTS/backend/node_modules/@prisma/client');
const { PrismaClient } = require(prismaClientPath);
const prisma = new PrismaClient();

class InstrumentResolver {
  constructor() {
    this.cache = new Map();
    this.lastReload = null;
    this._reloadInterval = null;
  }

  /**
   * Reload instruments from database into in-memory cache
   */
  async reload() {
    try {
      const instruments = await prisma.instrument.findMany({
        where: { isActive: true }
      });

      this.cache.clear();
      for (const inst of instruments) {
        const key = (inst.instrumentKey || '').toUpperCase();
        const sym = (inst.symbol || '').toUpperCase();
        const tradingSym = (inst.tradingSymbol || '').toUpperCase();

        const payload = {
          key,
          sym,
          segment: inst.segment || inst.exchange,
          raw: inst
        };

        if (sym && key) {
          this.cache.set(`symbol:${sym}`, payload);
          this.cache.set(`key:${key}`, payload);
          if (tradingSym && tradingSym !== sym) {
            this.cache.set(`symbol:${tradingSym}`, payload);
          }
        }
      }

      this.lastReload = Date.now();
      console.log(`[InstrumentResolver] Loaded ${instruments.length} instruments into cache`);
    } catch (err) {
      console.error('[InstrumentResolver] Failed to reload from database:', err.message);
    }
  }

  /**
   * Resolve instrument by symbol
   */
  async resolveBySymbol(symbol) {
    if (!symbol) return null;
    const s = String(symbol).toUpperCase();

    // Auto-reload if cache is stale (1 hour)
    if (!this.lastReload || Date.now() - this.lastReload > 3600000) {
      await this.reload();
    }

    return this.cache.get(`symbol:${s}`) || null;
  }

  /**
   * Resolve instrument by key
   */
  async resolveByKey(key) {
    if (!key) return null;
    const k = String(key).toUpperCase();

    // Auto-reload if cache is stale (1 hour)
    if (!this.lastReload || Date.now() - this.lastReload > 3600000) {
      await this.reload();
    }

    return this.cache.get(`key:${k}`) || null;
  }

  /**
   * Start auto-reload interval
   * @param {number} ms - Interval in milliseconds
   */
  startAutoReload(ms) {
    this.stopAutoReload();
    if (!ms || Number(ms) <= 0) return;

    const interval = Number(ms);
    this._reloadInterval = setInterval(async () => {
      try {
        await this.reload();
      } catch (err) {
        console.error('[InstrumentResolver] Auto-reload failed:', err.message);
      }
    }, interval);
  }

  /**
   * Stop auto-reload interval
   */
  stopAutoReload() {
    if (this._reloadInterval) {
      clearInterval(this._reloadInterval);
      this._reloadInterval = null;
    }
  }
}

module.exports = { InstrumentResolver };
