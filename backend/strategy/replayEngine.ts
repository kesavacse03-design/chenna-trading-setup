import * as fs from 'fs';
import * as path from 'path';

export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export interface ReplayConfig { interval: string; }
export type OnCandle = (c: Candle) => void;

// Single, CJS-compatible implementation
export class ReplayEngine {
  private data: Candle[] = [];
  private idx = 0;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  public onCandle: OnCandle | null = null;

  // Overloads: loadFromCache(filePath) and loadFromCache(baseDir, symbol, from, to, interval)
  loadFromCache(filePath: string): void;
  loadFromCache(baseDir: string, symbol: string, from: string, to: string, interval: string): void;
  loadFromCache(a: string, b?: string, c?: string, d?: string, e?: string) {
    let p = a;
    if (b && c && d && e) {
      p = path.join(a, 'cache', `${b}_${c}_${d}_${e}.json`);
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    this.data = Array.isArray((raw as any)?.ohlcv) ? (raw as any).ohlcv : (Array.isArray(raw) ? (raw as any) : []);
    this.idx = 0;
  }

  // Overloads to mirror CJS: start(speedMs, onCandle) and start(params, opts, onCandle)
  start(speedMs: number, onCandle: OnCandle): void;
  start(params: any, opts: ReplayConfig, onCandle: OnCandle): void;
  start(a: any, b: any, c?: any) {
    if (typeof a === 'number' && typeof b === 'function') {
      const speedMs = a; const onCandle: OnCandle = b;
      this.onCandle = onCandle; this.running = true;
      if (this.data.length && this.onCandle) this.onCandle(this.data[this.idx]);
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => { this.step(); }, speedMs);
      return;
    }
    // params signature
    this.onCandle = c || null; this.running = true;
  }

  step() {
    if (this.idx >= this.data.length) { this.running = false; return null; }
    const out = this.data[this.idx];
    this.idx += 1;
    if (this.onCandle) this.onCandle(out);
    return out;
  }

  pause() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.running = false; }
  reset() { this.idx = 0; this.running = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

export default ReplayEngine;
