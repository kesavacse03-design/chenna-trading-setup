const { ATR, EMA, RSI, VWAP, computeSeries } = require('../backend/strategy/indicators.cjs');

function makeSeries(len){
  const out = [];
  let price = 100;
  for (let i=0;i<len;i++){
    // simple random-walk deterministic
    const change = Math.sin(i/3)*0.5 + (i%5===0?1:0)*0.2;
    price = +(price + change).toFixed(4);
    out.push({ high: price + 0.5, low: price - 0.5, close: price, volume: 100 + (i%3)*10 });
  }
  return out;
}

function summary(arr){
  const total = arr.length; const defined = arr.filter(x=>x!==null && x!==undefined).length; const nulls = total - defined;
  return { total, defined, nulls, sample: arr.slice(-5) };
}

(async function(){
  const data = makeSeries(60);
  console.log('Series length', data.length);

  const atr = computeSeries('ATR', data, { period: 14 });
  console.log('ATR', summary(atr));

  const ema = computeSeries('EMA', data.map(d=>d.close), { period: 13, seed: data.slice(0,13).map(d=>d.close) });
  console.log('EMA', summary(ema));

  const rsi = computeSeries('RSI', data.map(d=>d.close), { period: 14 });
  console.log('RSI', summary(rsi));

  const vwap = computeSeries('VWAP', data, {});
  console.log('VWAP', summary(vwap));

  console.log('Samples (last 5):');
  console.log('ATR last 5', atr.slice(-5));
  console.log('EMA last 5', ema.slice(-5));
  console.log('RSI last 5', rsi.slice(-5));
  console.log('VWAP last 5', vwap.slice(-5));
})();
