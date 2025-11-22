const { runBacktest } = require('./backtester.cjs');
(async ()=>{
  const symbols = [];
  for (let i=0;i<50;i++) symbols.push(`SYM${String(i).padStart(3,'0')}`);
  process.env.BACKTEST_PERF = '1';
  const out = await runBacktest({ symbols, from:'2020-01-01', to:'2020-12-31', interval:'1d', mode:'mock' }, { onLog: l=>console.log('[bt]',l), onProgress: p=>console.log('[bt-progress]',p) });
  console.log('done', out);
})();
