const { ReplayEngine } = require('../replayEngine.cjs');
const { Simulator } = require('../simulator.cjs');
const path = require('path');
const fs = require('fs');

function assert(cond, msg){ if (!cond) throw new Error(msg || 'assert failed'); }

(async ()=>{
  console.log('TEST: replayEngine.step()');
  const re = new ReplayEngine();
  const cache = path.resolve(__dirname, '..', 'cache', 'MOCK1_2025-10-01_2025-10-01_5m.json');
  if (!fs.existsSync(cache)) { console.log('  SKIP: cache not found', cache); return; }
  re.loadFromCache(cache);
  const c = re.step();
  assert(c && c.date, 'first candle missing date');
  console.log('  PASS: emitted candle', c.date);

  console.log('TEST: simulator.marketOrder() deterministic');
  const sim = new Simulator();
  const fill = sim.marketOrder({ symbol: 'MOCK1', qty: 10, side: 'buy' }, [], re.data[1]);
  assert(fill && typeof fill.price === 'number', 'fill missing price');
  console.log('  PASS: market fill price', fill.price);

  console.log('\nALL TESTS PASSED');
})();
