// lightweight incremental indicators

class ATR {
  constructor(period){ this.period = period||14; this.trs = []; this.prevClose = null; }
  update(bar){
    try {
      const high = Number(bar.high||0); const low = Number(bar.low||0); const close = Number(bar.close||0);
      if (this.prevClose === null) { this.prevClose = close; return null; }
      const tr = Math.max(high-low, Math.abs(high - this.prevClose), Math.abs(low - this.prevClose));
      this.trs.push(tr);
      if (this.trs.length > this.period) this.trs.shift();
      this.prevClose = close;
      if (this.trs.length < this.period) return null;
      const sum = this.trs.reduce((a,b)=>a+b,0);
      return sum / this.trs.length;
    } catch (e) { return null; }
  }
}

class SMA {
  constructor(period){ this.period = period||14; this.buf = []; this.sum = 0; }
  update(value){ const v = Number(value||0); this.buf.push(v); this.sum += v; if (this.buf.length > this.period) this.sum -= this.buf.shift(); if (this.buf.length < this.period) return null; return this.sum / this.buf.length; }
}

class EMA {
  // constructor: either EMA(period) or EMA({ period, seed: [vals] })
  constructor(periodOrOpts){
    if (typeof periodOrOpts === 'object'){
      this.period = Number(periodOrOpts.period) || 14;
      this.k = 2/(this.period+1);
      this.prev = null; this.initialized = false; this.buf = [];
      if (Array.isArray(periodOrOpts.seed) && periodOrOpts.seed.length){
        // seed by computing simple average of seed window
        const s = periodOrOpts.seed.slice(-this.period);
        this.prev = s.reduce((a,b)=>a+Number(b||0),0)/s.length;
        this.initialized = true;
      }
    } else {
      this.period = Number(periodOrOpts) || 14; this.k = 2/(this.period+1); this.prev = null; this.initialized = false; this.buf = [];
    }
  }
  update(value){ const v = Number(value||0); if (!this.initialized){ this.buf.push(v); if (this.buf.length < (this.period||14)) { return null; } if (!this.prev && this.buf.length) { this.prev = this.buf.reduce((a,b)=>a+b,0)/this.buf.length; this.initialized = true; return this.prev; } }
  if (this.prev === null){ this.prev = v; return v; }
  // standard EMA update (use latest value first)
  this.prev = this.prev + this.k * (v - this.prev);
    return this.prev;
  }
}

class RSI {
  constructor(period){ this.period = period||14; this.gains = []; this.losses = []; this.prev = null; }
  update(value){
    const v = Number(value||0);
    if (this.prev === null){ this.prev = v; return null; }
    const diff = v - this.prev;
    const g = Math.max(0, diff);
    const l = Math.max(0, -diff);
  // record diffs then trim to period window
  this.gains.push(g);
  this.losses.push(l);
  if (this.gains.length > this.period) this.gains.shift();
  if (this.losses.length > this.period) this.losses.shift();
  // wait until we have a full period of diffs before producing RSI
  if (this.gains.length < this.period) { this.prev = v; return null; }
  // compute averages over available samples (should equal this.period)
  const avgG = this.gains.reduce((a,b)=>a+b,0)/this.gains.length;
  const avgL = this.losses.reduce((a,b)=>a+b,0)/this.losses.length;
  // advance prev after using diff
  this.prev = v;

    // Guard against degenerate or non-finite averages
    if (!isFinite(avgG) || !isFinite(avgL)) return 50; // neutral
    if (avgG === 0 && avgL === 0) return 50; // no movement
    if (avgL === 0) return 100; // only gains
    if (avgG === 0) return 0; // only losses

    const rs = avgG / avgL;
    if (!isFinite(rs)) return 50;
    return 100 - (100 / (1 + rs));
  }
}

// Bollinger Bands (SMA +/- k*StdDev)
class Bollinger {
  constructor(period, k){ this.period=period||20; this.k=k||2; this.buf=[]; }
  update(value){ const v=Number(value||0); this.buf.push(v); if (this.buf.length>this.period) this.buf.shift(); if (this.buf.length<this.period) return null; const n=this.buf.length; const mean=this.buf.reduce((a,b)=>a+b,0)/n; const variance=this.buf.reduce((a,b)=>a+Math.pow(b-mean,2),0)/n; const sd=Math.sqrt(variance); return { middle: mean, upper: mean + this.k*sd, lower: mean - this.k*sd }; }
}

// VWAP (cumulative typical price * volume / cumulative volume)
class VWAP {
  constructor(){ this.num=0; this.den=0; }
  update(bar){ const h=+bar.high||0,l=+bar.low||0,c=+bar.close||0; const v=+bar.volume||0; const tp=(h+l+c)/3; this.num += tp*v; this.den += v; if (this.den<=0) return null; return this.num/this.den; }
}

// Stochastic Oscillator (%K and %D)
class Stochastic {
  constructor(kPeriod=14, dPeriod=3){ this.kP=kPeriod; this.dP=dPeriod; this.win=[]; this.kBuf=[]; }
  update(bar){ const h=+bar.high||0,l=+bar.low||0,c=+bar.close||0; this.win.push({h,l,c}); if (this.win.length>this.kP) this.win.shift(); if (this.win.length<this.kP) return null; const hi=Math.max(...this.win.map(x=>x.h)); const lo=Math.min(...this.win.map(x=>x.l)); const k = (hi===lo)? 0 : ((c - lo)/(hi - lo))*100; this.kBuf.push(k); if (this.kBuf.length>this.dP) this.kBuf.shift(); const d = this.kBuf.reduce((a,b)=>a+b,0)/this.kBuf.length; return { k, d }; }
}

// ADX (simplified)
class ADX {
  constructor(period=14){ this.p=period; this.prev=null; this.trs=[]; this.pdm=[]; this.mdm=[]; this.dx=[]; this.adx=null; }
  update(bar){ const h=+bar.high||0,l=+bar.low||0,c=+bar.close||0; if (!this.prev){ this.prev={h,l,c}; return null; } const upMove=h - this.prev.h; const downMove=this.prev.l - l; const plusDM = (upMove>downMove && upMove>0) ? upMove : 0; const minusDM = (downMove>upMove && downMove>0) ? downMove : 0; const tr = Math.max(h-l, Math.abs(h - this.prev.c), Math.abs(l - this.prev.c)); this.trs.push(tr); this.pdm.push(plusDM); this.mdm.push(minusDM); if (this.trs.length>this.p){ this.trs.shift(); this.pdm.shift(); this.mdm.shift(); }
    this.prev={h,l,c}; if (this.trs.length<this.p) return null; const sumTR=this.trs.reduce((a,b)=>a+b,0); const sumP=this.pdm.reduce((a,b)=>a+b,0); const sumM=this.mdm.reduce((a,b)=>a+b,0); const pdi = sumTR>0 ? (sumP/sumTR)*100 : 0; const mdi = sumTR>0 ? (sumM/sumTR)*100 : 0; const diSum=pdi+mdi; const diDiff=Math.abs(pdi-mdi); const dx = diSum>0 ? (diDiff/diSum)*100 : 0; this.dx.push(dx); if (this.dx.length>this.p) this.dx.shift(); if (this.dx.length<this.p) return null; this.adx = this.dx.reduce((a,b)=>a+b,0)/this.dx.length; return this.adx; }
}

// SuperTrend (simplified)
class SuperTrend {
  constructor(period=10, mult=3){ this.atr = new ATR(period); this.mult=mult; this.prevUpper=null; this.prevLower=null; this.trend=0; }
  update(bar){ const atr = this.atr.update(bar); if (atr===null) return null; const hl2 = (Number(bar.high||0)+Number(bar.low||0))/2; let upper = hl2 + this.mult*atr; let lower = hl2 - this.mult*atr; if (this.prevUpper!==null){ upper = Math.min(upper, this.prevUpper); lower = Math.max(lower, this.prevLower); } const close = Number(bar.close||0); if (this.trend<=0){ this.trend = close > upper ? 1 : -1; } else { this.trend = close < lower ? -1 : 1; } this.prevUpper = upper; this.prevLower = lower; return { value: this.trend>0 ? lower : upper, trend: this.trend };
  }
}

module.exports = { ATR, SMA, EMA, RSI, Bollinger, VWAP, Stochastic, ADX, SuperTrend };

// Helper: compute full series for a given indicator over an ohlcv array
// Example usage: const series = require('./indicators.cjs').computeSeries('EMA', data.map(d=>d.close), { period: 20 });
function computeSeries(name, valuesOrOhlcv, opts){
  try {
    const Names = { ATR, SMA, EMA, RSI, BOLLINGER: Bollinger, VWAP, STOCHASTIC: Stochastic, ADX, SUPERTREND: SuperTrend };
    const key = String(name||'').toUpperCase();
    const Ctor = Names[key] || Names[String(name)] || Names[name.toLowerCase()] || null;
    if (!Ctor) return null;
    const out = [];
  // Pass the opts object through to the constructor when present.
  // Many indicators (EMA, SuperTrend, Bollinger) accept an options object
  // (e.g. { period, seed, mult }) — earlier code only passed a primitive
  // which prevented using seeds and multi-arg constructors. Pass opts
  // directly if provided, otherwise undefined/primitive will be used as-is.
    const ctorArg = (opts !== undefined && opts !== null) ? opts : undefined;
  const inst = new Ctor(ctorArg);
    // If valuesOrOhlcv items look like objects with 'close' treat as ohlcv
    const isOhlcv = Array.isArray(valuesOrOhlcv) && valuesOrOhlcv.length && typeof valuesOrOhlcv[0] === 'object' && valuesOrOhlcv[0].close !== undefined;
    for (let i=0;i<valuesOrOhlcv.length;i++){
      const v = valuesOrOhlcv[i];
      // For indicators that expect scalar price inputs (EMA, SMA, RSI), pass the close value
      const scalarKeys = new Set(['EMA','SMA','RSI']);
      const input = isOhlcv ? (scalarKeys.has(key) ? Number(v.close||0) : v) : v;
      const res = inst.update(input);
      out.push(res === undefined ? null : res);
    }
    return out;
  } catch (e){ return null; }
}

module.exports.computeSeries = computeSeries;
