const fs = require('fs');
const path = require('path');

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = arr.slice().sort((a,b)=>a-b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

function stats(arr) {
  if (!arr.length) return {};
  const sum = arr.reduce((a,b)=>a+b,0);
  const mean = sum / arr.length;
  const sorted = arr.slice().sort((a,b)=>a-b);
  const median = percentile(arr, 0.5);
  const p90 = percentile(arr, 0.9);
  const p99 = percentile(arr, 0.99);
  return { count: arr.length, mean: Math.round(mean), median: Math.round(median), p90: Math.round(p90), p99: Math.round(p99), min: sorted[0], max: sorted[sorted.length-1] };
}

async function analyze(runId) {
  const outDir = path.resolve(__dirname, 'output');
  const perfPath = path.join(outDir, `${runId}-perf.json`);
  const resultsPath = path.join(outDir, `${runId}-results.json`);
  const csvPath = path.join(outDir, `${runId}-trades.csv`);
  if (!fs.existsSync(perfPath)) { console.error('perf not found', perfPath); process.exit(2); }
  const perf = JSON.parse(fs.readFileSync(perfPath,'utf8'));
  const durations = (perf.perSymbol||[]).map(p=>p.durationMs||0).filter(n=>typeof n==='number');
  const s = stats(durations);
  const samples = perf.samples || [];
  let cpuUserDelta = null, cpuSysDelta = null, memPeak = null;
  if (samples.length) {
    const first = samples[0];
    const last = samples[samples.length-1];
    cpuUserDelta = ((last.cpu && last.cpu.user)||0) - ((first.cpu && first.cpu.user)||0);
    cpuSysDelta = ((last.cpu && last.cpu.system)||0) - ((first.cpu && first.cpu.system)||0);
    memPeak = Math.max(...samples.map(x=>x.mem && x.mem.rss || 0));
  }
  let csvRows = null;
  try { if (fs.existsSync(csvPath)) { const txt = fs.readFileSync(csvPath,'utf8').split(/\r?\n/); csvRows = Math.max(0, txt.filter(Boolean).length - 1); } } catch(e) {}
  let tradesCount = null;
  try { if (fs.existsSync(resultsPath)) { const j = JSON.parse(fs.readFileSync(resultsPath,'utf8')); tradesCount = j?.metrics?.trades ?? null; } } catch(e) {}

  return { runId, perfPath, resultsPath: fs.existsSync(resultsPath)?resultsPath:null, csvPath: fs.existsSync(csvPath)?csvPath:null, stats: s, cpuUserDelta, cpuSysDelta, memPeak, samples: samples.length, tradesCount, perSymbolCount: (perf.perSymbol||[]).length };
}

(async ()=>{
  const runId = process.argv[2];
  if (!runId) { console.error('Usage: node perf-summary.cjs <runId>'); process.exit(1); }
  const r = await analyze(runId);
  console.log(JSON.stringify(r, null, 2));
})();
