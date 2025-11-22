#!/usr/bin/env node
// Generate candidate composite strategy configs combining indicators & patterns.
// Exports buildCandidates(pool, limits)
// pool: {
//   ema_short:[5,8,13], ema_long:[34,50,89], rsi_period:[14], rsi_min:[15,20], rsi_max:[70,80],
//   atr_mult:[0.8,1.0,1.2], volumeFactor:[0.8,1.0,1.2], targetR:[1.0,1.2,1.5], patterns:['engulfing','hammer','none'],
//   // new options
//   enableVWAP:[false,true],
//   adx_min:[0,15,20,25], adx_period:[14],
//   regime:['none','squeeze','expansion'], bb_period:[20], bb_k:[2], bb_width:[0.02,0.04],
//   stoch_mode:['none','range','cross'], stoch_k:[14], stoch_d:[3], stoch_kMin:[0,20], stoch_kMax:[80,100],
//   enableSupertrend:[false,true], supertrend_period:[10], supertrend_mult:[2,3]
// }
// limits: { maxCombos: number }

function cart(arrs){ return arrs.reduce((acc, curr)=> acc.flatMap(a=> curr.map(b=> [].concat(a,b))), [[]]); }

function buildCandidates(pool, limits={}){
  const max = limits.maxCombos || 200;
  const patterns = pool.patterns || ['none'];
  const baseArrays = [
    pool.ema_short || [8],
    pool.ema_long || [50],
    pool.rsi_period || [14],
    pool.rsi_min || [20],
    pool.rsi_max || [80],
    pool.atr_mult || [1.2],
    pool.volumeFactor || [1.0],
    pool.targetR || [1.2],
    patterns,
    pool.enableVWAP || [false],
    pool.adx_min || [0],
    pool.adx_period || [14],
    pool.regime || ['none'],
    pool.bb_period || [20],
    pool.bb_k || [2],
    pool.bb_width || [0.03],
    pool.stoch_mode || ['none'],
    pool.stoch_k || [14],
    pool.stoch_d || [3],
    pool.stoch_kMin || [0],
    pool.stoch_kMax || [100],
    pool.enableSupertrend || [false],
    pool.supertrend_period || [10],
    pool.supertrend_mult || [3]
  ];
  const combos = cart(baseArrays).map(c => {
    const [emaS, emaL, rsiP, rsiMin, rsiMax, atrM, volF, targetR, pat,
      enableVWAP, adx_min, adx_period, regime, bb_period, bb_k, bb_width,
      stoch_mode, stoch_k, stoch_d, stoch_kMin, stoch_kMax,
      enableSupertrend, supertrend_period, supertrend_mult] = c;
    const usePatterns = { engulfing: pat==='engulfing', hammer: pat==='hammer', doji: false };
    return {
      kind:'composite', ema_short: emaS, ema_long: emaL, rsi_period: rsiP, rsi_min: rsiMin, rsi_max: rsiMax,
      atr_mult: atrM, volumeFactor: volF, targetR, qty:100, usePatterns,
      enableVWAP, adx_min, adx_period, regime, bb_period, bb_k, bb_width,
      stoch_mode, stoch_k, stoch_d, stoch_kMin, stoch_kMax,
      enableSupertrend, supertrend_period, supertrend_mult
    };
  });
  // Prune if exceeds max: simple heuristic keep earliest plus random tail
  if (combos.length > max){
    const head = combos.slice(0, Math.min(max-30, combos.length));
    const rest = combos.slice(head.length);
    for (let i=0; i<30 && rest.length; i++){ head.push(rest[Math.floor(Math.random()*rest.length)]); }
    return head.slice(0,max);
  }
  return combos;
}

module.exports = { buildCandidates };
