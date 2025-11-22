const { runBacktest } = require('./backtester.cjs');

(async () => {
  const symbols = ['MOCK1','TCS','RELIANCE'];
  const from = '2025-10-01';
  const to = '2025-10-01';
  const interval = '5m';
  const mode = 'mock';

  const logs = [];
  const hooks = {
    onLog: (line) => { logs.unshift(line); if (logs.length>200) logs.length=200; console.log('[LOG]', line); },
    onProgress: (p) => { console.log('[PROG]', JSON.stringify(p)); },
    isCancelled: () => false,
  };

  console.log('Starting demo UI job for symbols:', symbols.join(','));
  const start = Date.now();
  const { runId, resultsPath, tradesPath } = await runBacktest({ symbols, from, to, interval, mode }, hooks);
  const duration = ((Date.now()-start)/1000).toFixed(1);
  console.log('Run finished:', runId, 'duration(s):', duration);
  // print last ~12 log lines
  console.log('\n--- last log lines (most recent first) ---');
  logs.slice(0,12).forEach(l => console.log(l));
  console.log('\nResults:', resultsPath);
  console.log('Trades CSV:', tradesPath);
})();
