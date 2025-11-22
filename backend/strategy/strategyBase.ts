// Placeholder - to be implemented in Phase D
export interface Position { side: 'long'|'short'; qty: number; entry: number; stop?: number; target?: number; }
export interface TradeLog { time: string; action: string; price: number; qty: number; reason?: string; stop?: number; target?: number; }
export abstract class StrategyBase {
  protected logs: TradeLog[] = [];
  getLogs() { return this.logs; }
  onCandle(_c: any) { /* to implement */ }
  onFill(_fill: any) { /* to implement */ }
}

export function breakoutStrategyConfig() { return { N: 20, volumeFactor: 1.5, atrStop: 1.5, targetR: 2, qty: 100 }; }

export class BreakoutStrategy extends StrategyBase {
  private cfg = breakoutStrategyConfig();
  private hist: any[] = [];
  private pos: Position | null = null;
  private pendingEntry: { side: 'buy'|'sell'; qty: number; stop: number; target: number; reason: string } | null = null;
  setConfig(partial: Partial<ReturnType<typeof breakoutStrategyConfig>>) { this.cfg = { ...this.cfg, ...partial } as any; }
  getPending() { return this.pendingEntry; }
  clearPending() { this.pendingEntry = null; }

  onCandle(c: any) {
    this.hist.push(c);
  const N = this.cfg.N;
  if (this.hist.length <= N) return;
  // Exclude current candle from lookback to avoid self-reference
  const lastN = this.hist.slice(-N-1, -1);
  const hh = Math.max(...lastN.map(x => Number(x.high)));
  const avgVol = lastN.reduce((a, x) => a + Number(x.volume||0), 0) / N;
  const atr = lastN.reduce((a, x) => a + (Number(x.high)-Number(x.low)), 0) / N;
    const close = Number(c.close);
    const vol = Number(c.volume||0);
    if (!this.pos) {
      if (close >= hh && vol >= this.cfg.volumeFactor * avgVol) {
        const risk = Math.max(0.01, this.cfg.atrStop * atr);
        const stop = +((close - risk).toFixed(2));
        const target = +((close + this.cfg.targetR * risk).toFixed(2));
        const qty = this.cfg.qty;
        const reason = `breakout N=${N} close>=${hh.toFixed(2)} vol>=${(this.cfg.volumeFactor*avgVol).toFixed(0)}`;
        this.pendingEntry = { side: 'buy', qty, stop, target, reason };
        this.logs.push({ time: String(c.date||''), action: 'entry-signal', price: close, qty, reason, stop, target });
      }
    }
  }

  onFill(fill: any) {
    if (this.pendingEntry && this.pendingEntry.side === 'buy') {
      this.pos = { side: 'long', qty: this.pendingEntry.qty, entry: Number(fill.price), stop: this.pendingEntry.stop, target: this.pendingEntry.target };
      this.logs.push({ time: String(fill.ts||''), action: 'filled', price: Number(fill.price), qty: this.pendingEntry.qty, reason: 'market-fill', stop: this.pendingEntry.stop, target: this.pendingEntry.target });
      this.pendingEntry = null;
    }
  }
}
