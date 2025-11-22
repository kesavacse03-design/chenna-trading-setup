const { runBacktest } = require('./backtester.cjs');
(async ()=>{
  const out = await runBacktest({ symbols: ['SYM001','SYM002','SYM003'], from:'2020-01-01', to:'2020-01-05', interval:'5m', mode:'mock' }, { onLog: l=>console.log('[log]',l), onProgress: p=>console.log('[prog]',p) });
  console.log('done', out);
})();
