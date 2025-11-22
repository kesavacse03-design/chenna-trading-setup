// CompositeStrategy: configurable mix of indicators and simple candlestick pattern gating
// Supported config keys (all optional):
// {
//   kind: 'composite',
//   ema_short: 8, ema_long: 50,
//   rsi_period: 14, rsi_min: 25, rsi_max: 80,
//   atr_mult: 1.2, volumeFactor: 1.0, targetR: 1.2, qty: 100, minRisk: 0.01,
//   // Candlestick confirmations
//   usePatterns: { engulfing: true, doji: false, hammer: true },
//   // Optional gates / regimes
//   enableVWAP: false,
//   enableSupertrend: false, supertrend_period: 10, supertrend_mult: 3,
//   adx_period: 14, adx_min: 0,
//   bb_period: 20, bb_k: 2, regime: 'none', // 'none' | 'squeeze' | 'expansion'
//   stoch_k: 14, stoch_d: 3, stoch_mode: 'none', // 'none' | 'range' | 'cross'
//   stoch_kMin: 0, stoch_kMax: 100,
//   direction: 'long' // only long supported in simulator
// }
const { EMA, RSI, ATR, SMA, Bollinger, VWAP, Stochastic, ADX, SuperTrend } = require('./indicators.cjs');

class CompositeStrategy {
  constructor(){
    this.cfg = {
      kind: 'composite', ema_short: 8, ema_long: 50,
      rsi_period: 14, rsi_min: 20, rsi_max: 80,
      atr_mult: 1.2, volumeFactor: 1.0, targetR: 1.2, qty: 100, minRisk: 0.01,
      usePatterns: { engulfing: false, doji: false, hammer: false },
      // optional gates
      enableVWAP: false,
      enableSupertrend: false, supertrend_period: 10, supertrend_mult: 3,
      adx_period: 14, adx_min: 0,
      bb_period: 20, bb_k: 2, regime: 'none',
      stoch_k: 14, stoch_d: 3, stoch_mode: 'none', stoch_kMin: 0, stoch_kMax: 100,
      direction: 'long'
    };
    this.hist = [];
    this._emaS = new EMA(this.cfg.ema_short);
    this._emaL = new EMA(this.cfg.ema_long);
    this._rsi = new RSI(this.cfg.rsi_period);
    this._atr = new ATR(Math.max(5, Math.round((this.cfg.ema_short+this.cfg.ema_long)/2)));
    this._bb = new Bollinger(this.cfg.bb_period, this.cfg.bb_k);
    this._vwap = new VWAP();
    this._stoch = new Stochastic(this.cfg.stoch_k, this.cfg.stoch_d);
    this._adx = new ADX(this.cfg.adx_period);
    this._st = new SuperTrend(this.cfg.supertrend_period, this.cfg.supertrend_mult);
    this._volBuf = [];
    this.pendingEntry = null;
  }
  setConfig(partial){
    this.cfg = Object.assign({}, this.cfg, partial||{});
    // re-init indicator periods if changed
    if (partial && (partial.ema_short || partial.ema_long)){
      const es = this.cfg.ema_short||8; const el = this.cfg.ema_long||50;
      this._emaS = new EMA(es); this._emaL = new EMA(el);
    }
    if (partial && partial.rsi_period){ this._rsi = new RSI(this.cfg.rsi_period||14); }
    const atrP = Math.max(5, Math.round(((this.cfg.ema_short||8)+(this.cfg.ema_long||50))/2));
    this._atr = new ATR(atrP);
    // update aux indicators
    if (partial && (partial.bb_period || partial.bb_k)){
      this._bb = new Bollinger(this.cfg.bb_period||20, this.cfg.bb_k||2);
    }
    if (partial && (partial.stoch_k || partial.stoch_d)){
      this._stoch = new Stochastic(this.cfg.stoch_k||14, this.cfg.stoch_d||3);
    }
    if (partial && partial.adx_period){ this._adx = new ADX(this.cfg.adx_period||14); }
    if (partial && (partial.supertrend_period || partial.supertrend_mult)){
      this._st = new SuperTrend(this.cfg.supertrend_period||10, this.cfg.supertrend_mult||3);
    }
  }
  getPending(){ return this.pendingEntry }
  clearPending(){ this.pendingEntry=null }

  // basic candlestick helpers
  static isDoji(c){ const body = Math.abs(Number(c.close)-Number(c.open)); const range = Number(c.high)-Number(c.low); return range>0 && (body/range) < 0.1; }
  static isBullishEngulfing(prev, curr){ if (!prev||!curr) return false; const pOpen=+prev.open, pClose=+prev.close, cOpen=+curr.open, cClose=+curr.close; const prevBear = pClose < pOpen; const currBull = cClose > cOpen; return prevBear && currBull && cOpen < pClose && cClose > pOpen; }
  static isHammer(c){ const o=+c.open, h=+c.high, l=+c.low, cl=+c.close; const body=Math.abs(cl-o), lower= Math.min(o,cl)-l, upper=h-Math.max(o,cl); return body>0 && lower >= 2*body && upper <= body; }

  onCandle(c){
    this.hist.push(c);
    const close = Number(c.close||0); const vol = Number(c.volume||0);
  const emaS = this._emaS.update(close);
  const emaL = this._emaL.update(close);
  const rsi = this._rsi.update(close);
  const atr = this._atr.update(c);
  const bb = this._bb.update(close);
  const vwap = this._vwap.update(c);
  const stoch = this._stoch.update(c);
  const adx = this._adx.update(c);
  const st = this._st.update(c);
    // volume buffer
  // maintain a rolling volume buffer (window=20)
  this._volBuf.push(vol); if (this._volBuf.length > 20) this._volBuf.shift();
  const avgVol = this._volBuf.length ? (this._volBuf.reduce((a,b)=>a+b,0)/this._volBuf.length) : 0;
    // compute isWideRangeBar locally (same logic as strategyBase)
    const N = Math.max(5, (this.cfg.N || 20));
    const lastN = this.hist.length > N + 1 ? this.hist.slice(-N-1, -1) : this.hist.slice(0, Math.max(0, this.hist.length-1));
    const isWideRangeBar = (()=>{ if (!lastN.length) return false; const rng = (+c.high - +c.low); const avgRng = lastN.reduce((a,x)=>a+(+x.high-+x.low),0)/lastN.length; return rng >= 1.5*avgRng; })();
  if (emaS === null || emaL === null || rsi === null || atr === null) return;

  // Optional gates readiness: if enabled and null, wait for readiness
  if (this.cfg.enableVWAP && vwap === null) return;
  if ((this.cfg.regime && this.cfg.regime!=='none') && bb === null) return;
  if ((this.cfg.stoch_mode && this.cfg.stoch_mode!=='none') && stoch === null) return;
  if ((this.cfg.adx_min||0) > 0 && adx === null) return;
  if (this.cfg.enableSupertrend && st === null) return;

    // pattern checks (optional)
    let patternOk = true;
    const prev = this.hist.length>1 ? this.hist[this.hist.length-2] : null;
    const cfgPat = this.cfg.usePatterns || {};
    if (cfgPat.engulfing) patternOk = patternOk && CompositeStrategy.isBullishEngulfing(prev, c);
    if (cfgPat.doji) patternOk = patternOk && CompositeStrategy.isDoji(c);
    if (cfgPat.hammer) patternOk = patternOk && CompositeStrategy.isHammer(c);

  // gates
  const trendOk = emaS >= emaL; // uptrend for longs
  const rsiOk = rsi >= (this.cfg.rsi_min||0) && rsi <= (this.cfg.rsi_max||100);
  // compute volFactor respecting fractional values; keep isWideRange multiplier behaviour
  const baseVolFactor = (this.cfg.volumeFactor ?? 1.0);
  const volFactor = isWideRangeBar ? Math.max(baseVolFactor, 1.5) : baseVolFactor;
  const volOk = avgVol>0 ? (vol >= volFactor * avgVol) : true;
    // VWAP gate
    const vwapOk = this.cfg.enableVWAP ? (close >= vwap) : true;
    // ADX regime
    const adxOk = (this.cfg.adx_min||0) > 0 ? ((adx||0) >= (this.cfg.adx_min||0)) : true;
    // Bollinger regime gating
    let regimeOk = true;
    if (this.cfg.regime && String(this.cfg.regime).toLowerCase() !== 'none' && bb){
      const width = bb.middle ? Math.abs(bb.upper - bb.lower) / Math.max(1e-9, Math.abs(bb.middle)) : Math.abs(bb.upper - bb.lower);
      const thr = this.cfg.bb_width ?? 0.02; // optional bb_width threshold in relative terms
      // normalize common regime names: allow 'bull'/'bear' map to expansion/squeeze semantics
      let r = String(this.cfg.regime).toLowerCase();
      if (r === 'bull') r = 'expansion';
      else if (r === 'bear') r = 'squeeze';
      if (r === 'squeeze') regimeOk = width <= thr;
      else if (r === 'expansion') regimeOk = width >= thr;
      else regimeOk = true; // unknown regimes treated as no-op
    }
    // Stochastic gate
    let stochOk = true;
    if (this.cfg.stoch_mode && this.cfg.stoch_mode !== 'none' && stoch){
      if (this.cfg.stoch_mode === 'range'){
        const kMin = this.cfg.stoch_kMin ?? 0; const kMax = this.cfg.stoch_kMax ?? 100;
        stochOk = stoch.k >= kMin && stoch.k <= kMax;
      } else if (this.cfg.stoch_mode === 'cross'){
        // require K > D (bullish)
        stochOk = stoch.k > stoch.d;
      }
    }
    // SuperTrend gate
    const stOk = this.cfg.enableSupertrend ? ((st && st.trend>0) ? true : false) : true;

    if (!this.pendingEntry && patternOk && trendOk && rsiOk && volOk && vwapOk && adxOk && regimeOk && stochOk && stOk) {
  const risk = Math.max(this.cfg.minRisk||0.01, (this.cfg.atr_mult ?? 1.0) * (atr||0));
      let stop = +(close - risk).toFixed(2);
  // use nullish coalescing so explicit 0 won't be replaced inadvertently
  let target = +((close + (this.cfg.targetR ?? 1.2) * risk)).toFixed(2);
      if (!(stop < close)) stop = +(close - Math.max(this.cfg.minRisk||0.01, 0.01)).toFixed(2);
      if (!(target > close)) target = +((close + Math.max(this.cfg.minRisk||0.01, 0.01))).toFixed(2);
      const qty = this.cfg.qty || 100;
      const reason = `comp: emaS>=emaL rsi[${(this.cfg.rsi_min||0)}..${(this.cfg.rsi_max||100)}] vol>=${((this.cfg.volumeFactor||1.0)*avgVol).toFixed(0)} gates:${[
        this.cfg.enableVWAP?'vwap':'',
        (this.cfg.adx_min||0)>0?`adx>=${this.cfg.adx_min}`:'',
        (this.cfg.regime&&this.cfg.regime!=='none')?`bb-${this.cfg.regime}`:'',
        (this.cfg.stoch_mode&&this.cfg.stoch_mode!=='none')?`stoch-${this.cfg.stoch_mode}`:'',
        this.cfg.enableSupertrend?'st':'',
      ].filter(Boolean).join(',')}`;
      this.pendingEntry = { side:'buy', qty, stop, target, reason };
    }
  }

  onFill(fill){
    // CompositeStrategy delegates fill handling to Simulator via pending entry values only.
    // No position tracking here; Simulator will capture trade and manage exits.
    this.pendingEntry = null;
  }
}

module.exports = { CompositeStrategy };
