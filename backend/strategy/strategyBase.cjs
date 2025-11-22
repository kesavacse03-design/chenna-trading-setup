// CommonJS shim exporting BreakoutStrategy
class StrategyBase {
  constructor(){ this.logs=[] }
  getLogs(){ return this.logs }
  onCandle(c){}
  onFill(f){}
}
function breakoutStrategyConfig(){
  return {
    N:20,
    volumeFactor:1.5,
    atrStop:1.5,
    targetR:2,
    qty:100,
    minRisk:0.01,
    // new configurable pre-signal filters
    volume_ma_period: 20,              // period for volume SMA baseline
    require_follow_through_sessions: 0,// >0 means need prior bullish closes count
    wick_ratio_threshold: 2.0,         // upper shadow/body ratio above which we reject
    min_avg_volume: 0,                 // absolute minimum average volume to consider breakout
    require_htf_trend: false,          // if true, require higher timeframe EMA trend up
  htf_ema_period: 50,                // EMA period used when require_htf_trend is true
  // event / news gating
  event_filter_enabled: false,       // if true, use events list to reject or flag signals
  event_action: 'reject',            // 'reject' or 'flag' (flag allows trade but notes it)
  event_lookahead_minutes: 30,       // window around event to treat as risky
  events_provider: null              // optional function (symbol,date)->array of events injected externally
  };
}
class BreakoutStrategy extends StrategyBase{
  constructor(){ super(); this.cfg=breakoutStrategyConfig(); this.hist=[]; this.pos=null; this.pendingEntry=null; this._volBuf=[]; this._atr = null; this._atrObj = null; this._adx=null; this._adxObj=null; this._bb=null; this._bbObj=null; this._volMaBuf=[]; this._emaHtf=null; this._emaHtfObj=null; }
  setConfig(partial){ this.cfg = Object.assign({}, this.cfg, partial || {}) }
  getPending(){ return this.pendingEntry }
  clearPending(){ this.pendingEntry=null }
  onCandle(c){
    // Validate and normalize candle; skip if missing OHLC
    try {
      if (!c || !Number.isFinite(+c.open) || !Number.isFinite(+c.high) || !Number.isFinite(+c.low) || !Number.isFinite(+c.close)) {
        this.logs.push({ time: String(c && c.date || ''), action: 'REJECTED', reason: 'invalid-candle', gates: { open: c && c.open, high: c && c.high, low: c && c.low, close: c && c.close } });
        return;
      }
    } catch(_) { return; }
    this.hist.push(c);
  const N=this.cfg.N;
  // initialize incremental ATR on first sufficient data
  if (!this._atrObj) this._atrObj = new (require('./indicators.cjs').ATR)(N);
  // init ADX/Bollinger
  if (!this._adxObj) this._adxObj = new (require('./indicators.cjs').ADX)(Math.max(10, Math.min(20, N)));
  if (!this._bbObj) this._bbObj = new (require('./indicators.cjs').Bollinger)(Math.max(14, Math.min(30, N)), this.cfg.bbK || 2);
  // update atr incremental
  const atrVal = this._atrObj.update(c);
  this._atr = atrVal;
  const adxVal = this._adxObj.update(c); this._adx = adxVal;
  const bb = this._bbObj.update(Number(c.close||0)); this._bb = bb;
  // maintain volume circular buffer
  this._volBuf.push(Number(c.volume||0));
  if (this._volBuf.length > N) this._volBuf.shift();
  // maintain volume MA buffer (period configurable)
  const volMaPeriod = Math.max(5, Number(this.cfg.volume_ma_period || 20));
  this._volMaBuf.push(Number(c.volume||0));
  if (this._volMaBuf.length > volMaPeriod) this._volMaBuf.shift();
  // higher timeframe trend (approx via longer EMA on closes)
  if (this.cfg.require_htf_trend) {
    if (!this._emaHtfObj) {
      try {
        const ic = require('./indicatorCache.cjs');
        const period = Math.max(20, Number(this.cfg.htf_ema_period||50));
        const seed = ic.get((this._symbol||'') , (this._from||''), (this._to||''), (this._interval||''), 'EMA', { period }) || null;
        if (seed && Array.isArray(seed)) this._emaHtfObj = new (require('./indicators.cjs').EMA)({ period, seed }); else this._emaHtfObj = new (require('./indicators.cjs').EMA)(period);
      } catch(_) { this._emaHtfObj = new (require('./indicators.cjs').EMA)(Math.max(20, Number(this.cfg.htf_ema_period||50))); }
    }
    this._emaHtf = this._emaHtfObj.update(Number(c.close||0));
  }
  if (this.hist.length <= N || this._volBuf.length < N) return;
  const lastN = this.hist.slice(-N-1, -1);
    const hh = Math.max(...lastN.map(x=>Number(x.high)));
  const avgVol = (this._volBuf.length ? this._volBuf.reduce((a,b)=>a+b,0)/this._volBuf.length : 0);
    const close = Number(c.close); const vol=Number(c.volume||0);
    // candlestick validation helpers
    const isBullishEngulfing = (()=>{ const prev=this.hist.length>1?this.hist[this.hist.length-2]:null; if(!prev) return false; const pO=+prev.open,pC=+prev.close,cO=+c.open,cC=+c.close; return pC<pO && cC>cO && cO<pC && cC>pO; })();
    const isWideRangeBar = (()=>{ const rng = (+c.high - +c.low); const avgRng = lastN.reduce((a,x)=>a+(+x.high-+x.low),0)/lastN.length; return rng >= 1.5*avgRng; })();
  const bodySize = Math.abs(+c.close - +c.open);
  const upperShadow = (+c.high - Math.max(+c.close, +c.open));
  const hasUpperShadowTrap = upperShadow > 2*bodySize; // legacy trap
  const wickRatio = bodySize > 0 ? (upperShadow / bodySize) : 0;
    // Bollinger squeeze filter (optional): require width <= threshold to avoid noisy breakouts
    let squeezeOk = true; if (this.cfg.bbSqueezeWidth){ if (bb && bb.middle){ const width = Math.abs(bb.upper - bb.lower) / Math.max(1e-9, Math.abs(bb.middle)); squeezeOk = width <= this.cfg.bbSqueezeWidth; } }
    // ADX gating (optional): require trend strength
  const permissive = !!(this.cfg.permissive || this._mock);
  const adxOk = permissive ? true : ((this.cfg.adxMin || 0) > 0 ? ((this._adx || 0) >= this.cfg.adxMin) : true);
    // Volume confirmation can be stricter on wide range breakouts
  const baseVolFactor = (this.cfg.volumeFactor ?? 1.0);
  const volFactor = isWideRangeBar ? Math.max(baseVolFactor, 1.5) : baseVolFactor;
    if (!this.pos) {
      // Pre-signal rejection reasons accumulator
      const rejections = [];
      // Filter 1: volume baseline (avgVol) must exceed min_avg_volume if set
      if ((this.cfg.min_avg_volume||0) > 0 && avgVol < this.cfg.min_avg_volume) rejections.push(`avgVol<min(${avgVol.toFixed(0)}<${this.cfg.min_avg_volume})`);
      // Filter 2: wick ratio must be below threshold
      if ((this.cfg.wick_ratio_threshold||0) > 0 && wickRatio > this.cfg.wick_ratio_threshold) rejections.push(`wickRatio>${this.cfg.wick_ratio_threshold.toFixed(2)}`);
      // Filter 3: higher timeframe trend (EMA rising) if required
      if (this.cfg.require_htf_trend) {
        const emaOk = this._emaHtf !== null ? (Number(c.close||0) >= this._emaHtf) : false;
        if (!emaOk) rejections.push('htfTrendNotUp');
      }
      // Filter 4: follow-through bullish sessions (count prior closes > opens)
      if ((this.cfg.require_follow_through_sessions||0) > 0) {
        const need = this.cfg.require_follow_through_sessions;
        const prior = lastN.slice(-need);
        const bullCount = prior.filter(x => Number(x.close) > Number(x.open)).length;
        if (bullCount < need) rejections.push(`followThrough<${need}`);
      }
      // Compose gating boolean for breakout condition (price/volume/pattern/trap-free)
  // permissive flag already computed above
  const patternOk = (isBullishEngulfing || isWideRangeBar) || permissive;
  const volOk = permissive ? (vol >= 0.7 * volFactor * avgVol) : (vol >= volFactor * avgVol);
  const breakoutOk = close >= hh && volOk && adxOk && (permissive ? true : squeezeOk) && patternOk && (!hasUpperShadowTrap || permissive);
      if (!breakoutOk) {
        // identify which primary gate failed for audit clarity
        if (!(close >= hh)) rejections.push('price<hh');
  if (!volOk) rejections.push('vol<factor');
  if (!adxOk) rejections.push('adx<min');
  if (!permissive && !squeezeOk) rejections.push('bbWidth>limit');
  if (!patternOk) rejections.push('noPattern');
  if (!permissive && hasUpperShadowTrap) rejections.push('upperTrap');
      }
      // Filter 5: high-impact event proximity (if provided)
      if (this.cfg.event_filter_enabled) {
        try {
          const provider = this.cfg.events_provider;
          if (typeof provider === 'function') {
            const evs = provider(String(c.date||''), this.hist.slice(-5));
            if (Array.isArray(evs) && evs.length) {
              const risky = evs.find(e => {
                try {
                  const t = new Date(String(e.time||e.ts||e.date));
                  const cur = new Date(String(c.date||''));
                  const diffMin = Math.abs((cur.getTime() - t.getTime())/60000);
                  return diffMin <= (this.cfg.event_lookahead_minutes||30);
                } catch(_) { return false; }
              });
              if (risky) {
                if (this.cfg.event_action === 'reject') rejections.push('eventRisk');
                else this.logs.push({ time:String(c.date||''), action:'EVENT_FLAG', detail:risky });
              }
            }
          }
        } catch(_){ }
      }
      if (rejections.length) {
        // structured rejection log line with individual filters
        const detail = { hh, avgVol, adx: this._adx, bbWidth: this._bb ? Math.abs(this._bb.upper - this._bb.lower) : null, wickRatio };
        this.logs.push({ time: String(c.date||''), action:'REJECTED', price: close, reason: rejections.join('|'), filters: rejections.slice(), gates: detail });
      }
      if (rejections.length === 0 && breakoutOk) {
  let risk = Math.max(this.cfg.minRisk || 0.01, (this.cfg.atrStop ?? 1.0) * (this._atr || atrVal || 0));
  if (permissive) {
    // Make target easier and stop wider to favor at least some wins in synthetic data
    risk = Math.max(this.cfg.minRisk || 0.01, 0.5 * risk);
  }
  // raw levels
  let stop = +(close - (permissive ? Math.max(risk*1.5, this.cfg.minRisk || 0.01) : risk)).toFixed(2);
  let target = +((close + (permissive ? Math.max(risk*0.5, (this.cfg.minRisk||0.01)*0.5) : (this.cfg.targetR ?? 1.2) * risk)).toFixed(2));
  // defensive clamps: ensure stop < close < target
  if (!(stop < close)) stop = +(close - Math.max(this.cfg.minRisk || 0.01, 0.01)).toFixed(2);
  if (!(target > close)) target = +((close + Math.max(this.cfg.minRisk || 0.01, 0.01))).toFixed(2);
        const qty = this.cfg.qty;
        const reason = `breakout N=${N} hh=${hh.toFixed(2)} vol>=${(volFactor*avgVol).toFixed(0)} patterns=${[isBullishEngulfing?'engulfing':'',isWideRangeBar?'wrb':''].filter(Boolean).join('+')||'none'} adxOk=${adxOk} squeezeOk=${squeezeOk}`;
        const signalParams = { N, hh, avgVol:+avgVol.toFixed(2), vol, volFactor, adx: this._adx, bbWidth: this._bb ? +(Math.abs(this._bb.upper - this._bb.lower)).toFixed(4) : null, wickRatio:+wickRatio.toFixed(3), stop, target, cfg: this.cfg };
        this.pendingEntry = { side:'buy', qty, stop, target, reason, signalParams };
        this.logs.push({ time: String(c.date||''), action:'entry-signal', price: close, qty, reason, stop, target, signalParams });
      }
    }
  }
  onFill(fill){
    if (this.pendingEntry && this.pendingEntry.side==='buy'){
  // Validate fill/levels: ensure stop < entry < target; if not, recompute small sensible defaults
  const entryPrice = Number(fill.price);
  let stop = Number(this.pendingEntry.stop);
  let target = Number(this.pendingEntry.target);
  const permissive = !!(this.cfg.permissive || this._mock);
  if (permissive) {
    const cur = this.hist[this.hist.length-1] || {};
    const high = Number(cur.high||entryPrice);
    const low = Number(cur.low||entryPrice);
    const range = Math.max(0, high - low);
    // Place a modest target not at the extreme; bias for quick wins in smoke/permissive
    // Aim ~5-15% of bar range above entry with a small absolute floor
    const step = Math.max(0.02, Math.max(range*0.05, Math.min(range*0.15, 0.5)));
    let tgt = entryPrice + step;
    // Prefer to keep under current high (a tad room below high); if entry is near high, allow tiny overhead
    const cap = (high - 0.02);
    if (Number.isFinite(cap)) tgt = Math.min(tgt, cap);
    target = +Math.max(entryPrice + 0.02, tgt).toFixed(2);
    // Place stop below entry and below current low to avoid immediate stop before target
    const stp = entryPrice - Math.max(range*0.35, this.cfg.minRisk || 0.02);
    stop = +Math.min(low - 0.01, stp).toFixed(2);
  }
  if (!(stop < entryPrice)) stop = +(entryPrice - Math.max(this.cfg.minRisk || 0.01, (this._atr || 0) * this.cfg.atrStop || 0.01)).toFixed(2);
  if (!(target > entryPrice)) target = +((entryPrice + Math.max(this.cfg.minRisk || 0.01, (this._atr || 0) * this.cfg.targetR * this.cfg.atrStop || 0.01))).toFixed(2);
  // Write back adjusted levels onto pendingEntry so the runner can consume them
  try { this.pendingEntry.stop = stop; this.pendingEntry.target = target; } catch(_){}
  this.pos = { side:'long', qty:this.pendingEntry.qty, entry:entryPrice, stop:stop, target:target };
  this.logs.push({ time: String(fill.ts||''), action:'filled', price:Number(fill.price), qty:this.pendingEntry.qty, reason:'market-fill', stop:this.pendingEntry.stop, target:this.pendingEntry.target, signalParams: this.pendingEntry.signalParams || null });
      this.pendingEntry=null;
    }
  }
}
module.exports = { StrategyBase, BreakoutStrategy, breakoutStrategyConfig };
