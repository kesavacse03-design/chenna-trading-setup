const { runBacktest } = require('./backtester.cjs');
const fs = require('fs');
const path = require('path');

async function runBatch(symbolCount) {
  const symbols = [];
  for (let i=0;i<symbolCount;i++) symbols.push(`SYM${String(i).padStart(3,'0')}`);
  const from = '2020-01-01';
  const to = '2020-01-31';
  const interval = '5m';
  console.log(`Starting perf run for ${symbolCount} symbols`);
  const hooks = { onLog: (l)=>console.log('[bt]',l), onProgress: (p)=>console.log('[bt-progress]',p) };
  process.env.BACKTEST_PERF = '1';
  const out = await runBacktest({ symbols, from, to, interval, mode: 'mock' }, hooks);
  console.log('Completed perf run:', out);
  return out;
}

(async ()=>{
  try {
    await runBatch(50);
    await new Promise(r=>setTimeout(r,2000));
    await runBatch(200);
    console.log('Perf batch finished');
  } catch (e) {
    console.error('Perf runner failed', e && e.stack || e);
    process.exit(1);
  }
})();
