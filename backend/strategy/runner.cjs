#!/usr/bin/env node
const { runBacktest } = require('./backtester.cjs');

function parseArgs(argv){
	const out = { symbols: [], from: null, to: null, interval: '5m', mode: 'mock' };
	for (let i=0;i<argv.length;i++){
		const a = argv[i];
		const next = () => (i+1<argv.length?argv[i+1]:null);
		if (/^--symbols?$/i.test(a)) { const v = next(); if (v){ out.symbols = v.split(',').map(s=>s.trim()).filter(Boolean); i++; } }
		else if (/^--from$/i.test(a)) { const v = next(); if (v){ out.from = v; i++; } }
		else if (/^--to$/i.test(a)) { const v = next(); if (v){ out.to = v; i++; } }
		else if (/^--interval$/i.test(a)) { const v = next(); if (v){ out.interval = v; i++; } }
		else if (/^--mode$/i.test(a)) { const v = next(); if (v){ out.mode = v; i++; } }
		else if (/^--smoke$/i.test(a)) { out.symbols = ['TCS']; out.from = out.from || new Date().toISOString().slice(0,10); out.to = out.to || out.from; }
	}
	if (!out.symbols.length) out.symbols = ['TCS','RELIANCE'];
	if (!out.from) out.from = new Date().toISOString().slice(0,10);
	if (!out.to) out.to = out.from;
	return out;
}

(async () => {
	const args = parseArgs(process.argv.slice(2));
	const { resultsPath, tradesPath, runId } = await runBacktest(args);
	console.log(`[strategy.runner] Completed ${runId}`);
	console.log('results:', resultsPath);
	console.log('trades :', tradesPath);
})();
