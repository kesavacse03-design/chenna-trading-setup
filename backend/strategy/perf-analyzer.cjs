const fs = require('fs');
const path = require('path');

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function readCsv(p){ try{ return fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean); }catch(e){ return []; } }

function stats(arr){ if(!arr.length) return {mean:0,median:0,p90:0,p99:0,max:0}; const s=arr.slice().sort((a,b)=>a-b); const sum=arr.reduce((a,b)=>a+b,0); const mean=sum/arr.length; const median=s[Math.floor(s.length/2)]; const p90=s[Math.floor(s.length*0.9)]; const p99=s[Math.floor(s.length*0.99)]; const max=s[s.length-1]; return {mean,median,p90,p99,max}; }

function analyze(runPerfPath, jobJsonPath, csvPath){
  const perf = readJson(runPerfPath);
  const job = readJson(jobJsonPath);
  const csv = readCsv(csvPath);
  const per = perf.perSymbol || [];
  const durations = per.map(p=>p.durationMs||0);
  const s = stats(durations);
  const top10 = per.slice().sort((a,b)=> (b.durationMs||0)-(a.durationMs||0)).slice(0,10);
  const totalTrades = job && job.summary && typeof job.summary.tradesCount === 'number' ? job.summary.tradesCount : (csv.length>1? csv.length-1:0);
  const avgTradesPerSymbol = per.length ? totalTrades / per.length : 0;
  const totalWallMs = durations.reduce((a,b)=>a+b,0);
  const cpuSecApprox = perf.cpuDelta ? ((perf.cpuDelta.user||0)+(perf.cpuDelta.system||0))/1e6 : null; // microseconds -> seconds
  // mem stats
  const samples = perf.samples || [];
  const memStart = samples.length ? (samples[0].mem.heapUsed/1024/1024) : (perf.memStart? perf.memStart.heapUsed/1024/1024 : null);
  const memEnd = samples.length ? (samples[samples.length-1].mem.heapUsed/1024/1024) : (perf.memEnd? perf.memEnd.heapUsed/1024/1024 : null);
  const memPeak = samples.length ? Math.max(...samples.map(x=>x.mem.heapUsed))/1024/1024 : null;
  let ioTimeMs = null;
  // try to find persist log lines timestamps in job.logs if available
  if (job && Array.isArray(job.logs) && job.logs.length){
    const writes = job.logs.filter(l=>/wrote job JSON|wrote job JSON|wrote job JSON/.test(l));
    // not precise: can't compute durations from logs reliably here
  }
  return { runId: perf.runId, totalWallMs, cpuSecApprox, memStart, memEnd, memPeak, stats: s, top10, totalTrades, avgTradesPerSymbol, ioTimeMs };
}

const runs = [
  { perf: path.resolve(__dirname,'output','run-1762088028735-perf.json'), job: path.resolve(__dirname,'..','jobs','job_run-1762088028735.json'), csv: path.resolve(__dirname,'output','run-1762088028735-trades.csv') },
  { perf: path.resolve(__dirname,'output','run-1762088345541-perf.json'), job: path.resolve(__dirname,'..','jobs','job_run-1762088345541.json'), csv: path.resolve(__dirname,'output','run-1762088345541-trades.csv') },
  { perf: path.resolve(__dirname,'output','run-1762091144648-perf.json'), job: path.resolve(__dirname,'..','jobs','job_run-1762091144648.json'), csv: path.resolve(__dirname,'output','run-1762091144648-trades.csv') },
];

for(const r of runs){
  try{
    const a = analyze(r.perf, r.job, r.csv);
    console.log('---');
    console.log('Run:', a.runId);
    console.log('Wall(ms,approx by sum durations):', Math.round(a.totalWallMs));
    console.log('CPU(s,approx):', a.cpuSecApprox === null ? 'N/A' : a.cpuSecApprox.toFixed(3));
    console.log('MemStart/Peak/End (MB):', [a.memStart && a.memStart.toFixed(2), a.memPeak && a.memPeak.toFixed(2), a.memEnd && a.memEnd.toFixed(2)].join(' / '));
    console.log('Per-symbol stats (ms):', { mean: Math.round(a.stats.mean), median: Math.round(a.stats.median), p90: Math.round(a.stats.p90), p99: Math.round(a.stats.p99), max: Math.round(a.stats.max) });
    console.log('Top slowest symbols:', a.top10.map(x=>`${x.symbol}:${x.durationMs}ms`).join(', '));
    console.log('Total trades:', a.totalTrades, 'Avg trades/symbol:', a.avgTradesPerSymbol.toFixed(2));
  }catch(e){ console.error('Failed to analyze', r, e && e.stack || e); }
}
