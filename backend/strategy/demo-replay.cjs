const path = require('path');
const { ReplayEngine } = require('./replayEngine.cjs');
const { Simulator } = require('./simulator.cjs');
const fs = require('fs');
(async ()=>{
  const cachePath = path.resolve(__dirname, 'cache', 'MOCK1_2025-10-01_2025-10-01_5m.json');
  if (!fs.existsSync(cachePath)) { console.error('Cache file not found:', cachePath); process.exit(2); }
  const re = new ReplayEngine();
  re.loadFromCache(cachePath);
  const sim = new Simulator();
  const lastCandles = [];
  const outCandles = [];

  // We will step and demonstrate market and limit fills.
  // For deterministic behavior, market orders are filled on the next candle using its open.
  // Step 1: emit first candle, place market buy (will be executed on next candle)
  const c1 = re.step();
  if (!c1) { console.error('no candles'); process.exit(2); }
  console.log(JSON.stringify(c1));
  // place market buy -> will be filled on next candle
  const pendingMarket = { symbol: 'MOCK1', qty: 100, side: 'buy' };
  // place limit sell at first candle high + 0.5
  const limitPrice = Number(c1.high) + 0.5;
  const pendingLimit = { symbol: 'MOCK1', qty: 100, limit: limitPrice, side: 'sell' };

  // Step 2: next candle - fills are evaluated against this candle
  const c2 = re.step();
  console.log(JSON.stringify(c2));
  // market fill using c2
  const marketFill = sim.marketOrder(pendingMarket, [c1], c2);
  console.log(JSON.stringify(marketFill));
  // limit (sell) evaluated on c2
  const limitFill = sim.limitOrder(pendingLimit, [c1], c2);
  console.log(JSON.stringify(limitFill));

  outCandles.push(c1, c2);

  // Step the next 3 candles and print them
  for (let i=0;i<3;i++){
    const c = re.step(); if (!c) break;
    console.log(JSON.stringify(c)); outCandles.push(c); lastCandles.push(c);
  }
})();
