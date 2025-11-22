const { EMA } = require('../indicators.cjs');
function naiveEMA(values, period){
  if (values.length < period) return null;
  // seed with SMA of first period
  let prev = values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for (let i=period;i<values.length;i++){
    const k = 2/(period+1);
    prev = (values[i]-prev)*k + prev;
  }
  return prev;
}
function testEMA(){
  const vals = [];
  for (let i=0;i<50;i++) vals.push(100 + Math.sin(i/5)*2 + i*0.1);
  const period = 10;
  const ema = new EMA(period);
  for (let i=0;i<vals.length;i++){
    const out = ema.update(vals[i]);
    const naive = naiveEMA(vals.slice(0,i+1), period);
    if (naive === null) { if (out !== null) throw new Error('expected null'); }
    else { const diff = Math.abs(out-naive); if (diff > 1e-6) throw new Error('EMA mismatch '+diff); }
  }
  console.log('EMA test passed');
}
if (require.main === module) testEMA();
module.exports = { testEMA };
