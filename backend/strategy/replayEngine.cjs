const fs = require('fs');
const path = require('path');

class ReplayEngine {
  constructor() {
    this.data = [];
    this.idx = 0;
    this.timer = null;
    this.running = false;
    this.onCandle = null;
  }

  loadFromCache(filePath) {
    // Support multiple call signatures:
    //  - loadFromCache(filePath)
    //  - loadFromCache(baseDir, symbol, from, to, interval)
    let p = filePath;
    if (arguments.length > 1) {
      const baseDir = arguments[0];
      const symbol = arguments[1];
      const from = arguments[2];
      const to = arguments[3];
      const interval = arguments[4];
      p = path.join(baseDir, 'cache', `${symbol}_${from}_${to}_${interval}.json`);
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const arr = Array.isArray(raw?.ohlcv) ? raw.ohlcv : (Array.isArray(raw) ? raw : []);
    // Normalize at load time
    this.data = arr.map(it => {
      if (Array.isArray(it)) {
        const [ts,o,h,l,c,v] = it;
        return { date: (typeof ts === 'string' || typeof ts === 'number') ? new Date(ts).toISOString() : null, open: Number(o), high: Number(h), low: Number(l), close: Number(c), volume: Number(v || 0) };
      }
      return { date: it.date || it.time || null, open: Number(it.open), high: Number(it.high), low: Number(it.low), close: Number(it.close), volume: Number(it.volume || 0) };
    }).filter(c => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
    this.idx = 0;
  }

  // Backtester calls start(params, opts, onCandle) — support both signatures.
  start(a, b, c) {
    if (typeof a === 'number' || (typeof b === 'function' && typeof a !== 'object')) {
      // old signature start(speedMs, onCandle)
      const speedMs = a; const onCandle = b;
      this.onCandle = onCandle;
      this.running = true;
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => { this.step(); }, speedMs);
      return;
    }
    // new signature start(params, opts, onCandle)
    const params = a || {};
    const opts = b || {};
    const onCandle = c || null;
    this.onCandle = onCandle;
    // do not start a timer — backtester uses synchronous step()
    this.running = true;
  }

  step() {
    if (this.idx >= this.data.length) { this.running = false; return null; }
    let out = this.data[this.idx];
    this.idx += 1;
    // Normalize array-form candles [ts,open,high,low,close,vol] into object shape
    try {
      if (Array.isArray(out)) {
        const [ts, open, high, low, close, volume] = out;
        out = { date: (typeof ts === 'string' || typeof ts === 'number') ? new Date(ts).toISOString() : null, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume ?? 0) };
      }
      // Coerce types and ensure fields exist
      if (out && typeof out === 'object') {
        out.open = Number(out.open);
        out.high = Number(out.high);
        out.low = Number(out.low);
        out.close = Number(out.close);
        out.volume = Number(out.volume || 0);
        out.date = out.date ? String(out.date) : null;
      }
    } catch(_) { /* best-effort */ }
    if (this.onCandle) this.onCandle(out);
    // Reduce noise: only log if explicitly enabled
    if (String(process.env.REPLAY_LOG) === '1' || String(process.env.VERBOSE_LOGGING) === '1') {
      console.log(`REPLAY: emitted candle ${out.date} ${out.open} ${out.high} ${out.low} ${out.close}`);
    }
    return out;
  }

  pause() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.running = false;
  }

  reset() {
    this.idx = 0;
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

module.exports = { ReplayEngine };

