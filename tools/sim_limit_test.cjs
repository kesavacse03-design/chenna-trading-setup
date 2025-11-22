const path = require('path');
const fs = require('fs');
const { ReplayEngine } = require(path.resolve(__dirname, '..', 'backend', 'strategy', 'replayEngine.cjs'));
const { Simulator } = require(path.resolve(__dirname, '..', 'backend', 'strategy', 'simulator.cjs'));
(async ()=>{
  const cachePath = path.resolve(__dirname, '..', 'backend', 'strategy', 'cache', 'MOCK1_2025-10-01_2025-10-01_5m.json');
  const re = new ReplayEngine();
  re.loadFromCache(cachePath);
  const sim = new Simulator();
  const first = re.step();
  if (!first) { console.error('no candle'); process.exit(2); }
  const limitPrice = +(first.high + 0.5).toFixed(2);
  const res = sim.limitOrder({ symbol: 'MOCK1', qty: 100, limit: limitPrice }, [], first);
  console.log(JSON.stringify(res));
})();
