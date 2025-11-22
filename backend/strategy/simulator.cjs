// Simple deterministic simulator
class Simulator {
  constructor() { }

  // Compute ATR(14) naive fallback: if candles length < 2, return null
  computeATR(prevCandles) {
    if (!Array.isArray(prevCandles) || prevCandles.length < 2) return null;
    // simple true range average over available candles
    const trs = [];
    for (let i = 1; i < prevCandles.length; i++) {
      const p = prevCandles[i-1]; const c = prevCandles[i];
      const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
      trs.push(tr);
    }
    if (!trs.length) return null;
    const sum = trs.reduce((a,b)=>a+b,0);
    return sum / trs.length;
  }

  marketOrder({ symbol, qty, side='buy' }, lastCandles, nextCandle) {
    // In permissive/mock smoke runs, use smaller slippage to avoid filling too close to bar extremes
    const spread = (nextCandle.high - nextCandle.low) || 0;
    const atr = this.computeATR(lastCandles) || null;
    const permissive = String(process.env.BACKTEST_PERMISSIVE || process.env.MOCK_MODE || '') === '1';
    const baseSlip = (atr !== null ? atr * (permissive ? 0.03 : 0.1) : spread * (permissive ? 0.15 : 0.5));
    const slippage = Math.max(spread * (permissive ? 0.05 : 1), baseSlip);
    // deterministic: buys lift price, sells lower price
    const base = nextCandle.open;
    const filledPrice = +( (side==='buy' ? base + slippage : base - slippage) ).toFixed(2);
    const fee = +(0.0002 * filledPrice * qty).toFixed(4);
    const out = { symbol, type: 'market', price: filledPrice, qty, side, slippage: +slippage.toFixed(4), fee, ts: nextCandle.date };
    if (String(process.env.VERBOSE_LOGGING) === '1') console.log(`SIM: market fill for ${symbol} ${side} at ${filledPrice} slippage ${out.slippage} fee ${out.fee}`);
    return out;
  }

  limitOrder({ symbol, qty, limit, side='sell' }, lastCandles, nextCandle) {
    // If limit within next candle range, fill at limit
    if (limit <= nextCandle.high && limit >= nextCandle.low) {
      const filledPrice = limit;
      const fee = +(0.0002 * filledPrice * qty).toFixed(4);
      const out = { symbol, type: 'limit', price: filledPrice, qty, side, slippage: 0, fee, ts: nextCandle.date };
      if (String(process.env.VERBOSE_LOGGING) === '1') console.log(`SIM: limit fill for ${symbol} ${side} at ${filledPrice} fee ${out.fee}`);
      return out;
    }
    return { symbol, type: 'limit', status: 'unfilled', triedAt: nextCandle.date };
  }

  // Generic submit API used by backtester
  submit(order, lastCandles, nextCandle) {
    const type = order.type || 'market';
    if (type === 'market') return this.marketOrder(order, lastCandles, nextCandle);
    if (type === 'limit') return this.limitOrder(order, lastCandles, nextCandle);
    throw new Error('unsupported order type: ' + type);
  }
}

module.exports = { Simulator };


