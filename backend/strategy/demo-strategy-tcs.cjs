const path = require('path');
const fs = require('fs');
const { ReplayEngine } = require('./replayEngine.cjs');
const { Simulator } = require('./simulator.cjs');
const { BreakoutStrategy } = require('./strategyBase.cjs');

function tryRun(symbol, cacheFile){
  const cachePath = path.resolve(__dirname, 'cache', cacheFile);
  if (!fs.existsSync(cachePath)) { console.error('Cache file not found:', cachePath); return; }
  const re = new ReplayEngine(); re.loadFromCache(cachePath);
  const sim = new Simulator();
  const strat = new BreakoutStrategy();
  const last = [];
  for (let i=0;i<500;i++){
    const c = re.step(); if (!c) break;
    strat.onCandle(c);
    const pending = strat.getPending();
    if (pending){
      const next = re.data[re.idx];
      if (next){
        const fill = sim.marketOrder({ symbol, qty: pending.qty, side: pending.side }, last.slice(-30), next);
        strat.onFill(fill);
        console.log('TRADE_LOG:', JSON.stringify({ symbol, entryTs: fill.ts, entryPrice: fill.price, qty: fill.qty, stop: strat.pos?strat.pos.stop:null, target: strat.pos?strat.pos.target:null, reason: pending.reason }));
        return;
      }
    }
    last.push(c);
  }
  console.log('No trade found for', symbol, 'after stepping; last 5 candles:');
  console.log(JSON.stringify(last.slice(-5), null, 2));
}

tryRun('TCS','TCS_2025-11-01_2025-11-01_5m.json');
