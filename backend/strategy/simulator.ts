// Typed facade for the CommonJS Simulator implementation to avoid duplicate identifiers.
import type { Candle } from './replayEngine';

export type OrderType = 'market' | 'limit';
export interface OrderReq { side: 'buy'|'sell'; qty: number; type: OrderType; price?: number; symbol?: string; }
export interface Fill { price: number; qty: number; fee: number; slippage: number; ts?: string; side?: 'buy'|'sell'; symbol?: string; type?: OrderType; }

declare const require: any;
const cjs: any = (() => { try { return require('./simulator.cjs'); } catch { return {}; } })();

export class Simulator {
  private impl: any;
  constructor(){ this.impl = cjs.Simulator ? new cjs.Simulator() : null; }
  computeATR(prevCandles: Candle[]): number | null { return this.impl?.computeATR ? this.impl.computeATR(prevCandles) : null; }
  marketOrder(req: { symbol: string; qty: number; side?: 'buy'|'sell' }, last: Candle[], next: Candle): Fill {
    return this.impl?.marketOrder ? this.impl.marketOrder(req, last, next) : { price: Number(next.open), qty: req.qty, fee: 0, slippage: 0, ts: String(next.date||'') };
  }
  limitOrder(req: { symbol: string; qty: number; limit: number; side?: 'buy'|'sell' }, last: Candle[], next: Candle): Fill {
    return this.impl?.limitOrder ? this.impl.limitOrder(req, last, next) : { price: Number(req.limit), qty: req.qty, fee: 0, slippage: 0, ts: String(next.date||'') };
  }
  submit(order: OrderReq, lastCandles: Candle[] = [], nextCandle?: Candle): Fill {
    // Backtester uses submit(order, [], nextCandle) in CJS
    if (!nextCandle) throw new Error('nextCandle required');
    if (order.type === 'limit') return this.limitOrder({ symbol: order.symbol||'', qty: order.qty, limit: Number(order.price||0), side: order.side }, lastCandles, nextCandle);
    return this.marketOrder({ symbol: order.symbol||'', qty: order.qty, side: order.side||'buy' }, lastCandles, nextCandle);
  }
}

export default Simulator;
