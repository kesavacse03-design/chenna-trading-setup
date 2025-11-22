const path = require('path');
const fs = require('fs');
const { ReplayEngine } = require('./replayEngine.cjs');
const { Simulator } = require('./simulator.cjs');
const { BreakoutStrategy } = require('./strategyBase.cjs');

(async ()=>{
  const cachePath = path.resolve(__dirname, 'cache', 'MOCK1_2025-10-01_2025-10-01_5m.json');
  if (!fs.existsSync(cachePath)) { console.error('Cache file not found:', cachePath); process.exit(2); }
  const re = new ReplayEngine(); re.loadFromCache(cachePath);
  const sim = new Simulator();
  const strat = new BreakoutStrategy();

  const last = [];
  let trades = [];

  for (let i=0;i<100;i++){
    const c = re.step(); if (!c) break;
    strat.onCandle(c);
    // If strategy has a pending entry, place market order to be filled next candle
    const pending = strat.getPending();
    if (pending){
      // we place market order; fill will be created using next candle if available
      const next = re.data[re.idx];
      if (next){
        const fill = sim.marketOrder({ symbol:'MOCK1', qty: pending.qty, side: pending.side }, last.slice(-30), next);
        strat.onFill(fill);
        trades.push({ symbol:'MOCK1', entryTs: fill.ts, entryPrice: fill.price, qty: fill.qty, stop: strat.pos?strat.pos.stop:null, target: strat.pos?strat.pos.target:null, reason: pending.reason });
        // stop after first trade logged
        console.log(JSON.stringify(trades[trades.length-1]));
        break;
      }
    }
    last.push(c);
  }
})();
