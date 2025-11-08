const fs = require('fs');
const path = require('path');

class CacheAdapter {
  constructor(opts = {}) {
    this.name = 'CACHE';
    this.baseDir = opts.baseDir || path.resolve(process.cwd(), 'data', 'cache', 'ohlc');
  }
  _file(symbol) { return path.join(this.baseDir, `${symbol}.json`); }

  getProviderName() { return this.name; }

  async getHistorical(symbol, from, to, interval = 'day') {
    try {
      const fp = this._file(symbol);
      if (!fs.existsSync(fp)) return [];
      const arr = JSON.parse(fs.readFileSync(fp, 'utf8')) || [];
      const fromTs = new Date(from).getTime();
      const toTs = new Date(to).getTime();
      return arr.filter(c => {
        const t = new Date(String(c.date)).getTime();
        return t >= fromTs && t <= toTs;
      });
    } catch (e) {
      return { ok: false, error: 'cache-read-failed', detail: String(e && e.message) };
    }
  }

  async getTick(symbol) { return null; }
  async lookupInstrument(symbol) { return { symbol }; }
  subscribeTicks(symbol, cb) { return { unsubscribe: () => {} }; }

  // atomic append helper for reconciliation
  appendCandles(symbol, candles) {
    try {
      const fp = this._file(symbol);
      let arr = [];
      if (fs.existsSync(fp)) arr = JSON.parse(fs.readFileSync(fp, 'utf8')) || [];
      // merge by date (dedupe)
      const byKey = new Map();
      for (const c of arr) byKey.set(String(c.date), c);
      for (const c of candles) byKey.set(String(c.date), c);
      const merged = Array.from(byKey.values()).sort((a,b)=>new Date(a.date)-new Date(b.date));
      const tmp = fp + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8');
      fs.renameSync(tmp, fp);
      return true;
    } catch (e) { return false; }
  }
}

module.exports = { CacheAdapter };
