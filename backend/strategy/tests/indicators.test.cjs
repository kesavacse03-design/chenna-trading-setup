const { ATR } = require('../indicators.cjs');

function naiveATR(candles, period){
  if (candles.length <= period) return null;
  const trs = [];
  // compute TR for the last `period` bars (each compares to previous close)
  for (let idx = candles.length - period; idx < candles.length; idx++){
    const cur = candles[idx];
    const prev = candles[idx-1];
    const tr = Math.max(Number(cur.high)-Number(cur.low), Math.abs(Number(cur.high)-Number(prev.close)), Math.abs(Number(cur.low)-Number(prev.close)));
    trs.push(tr);
  }
  if (trs.length < period) return null;
  return trs.reduce((a,b)=>a+b,0)/trs.length;
}

function makeCandles(n){
  const arr = [];
  for(let i=0;i<n;i++) arr.push({ high:100+i, low:90+i, close:95+i, volume:1000+i });
  return arr;
}

function testATR(){
  const period = 5;
  const c = makeCandles(20);
  const atr = new ATR(period);
  for(let i=0;i<c.length;i++){
    const out = atr.update(c[i]);
    const naive = naiveATR(c.slice(0,i+1), period);
    if (naive === null) {
      if (out !== null) throw new Error('expected null');
    } else {
      const diff = Math.abs(out - naive);
      if (diff > 1e-6) throw new Error('ATR mismatch ' + diff);
    }
  }
  console.log('ATR test passed');
}

if (require.main === module) testATR();
module.exports = { testATR };
