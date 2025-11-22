const fs = require('fs');

let runCounter = 0;
let runErrors = 0;
const perRunStats = {}; // runId -> { count, mean, median, p90, p99 }

function percentile(sorted, p) {
  if (!sorted || !sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}
function computeStats(arr) {
  if (!arr || !arr.length) return { count:0, mean:0, median:0, p90:0, p99:0, min:0, max:0 };
  const sorted = arr.slice().sort((a,b)=>a-b);
  const sum = arr.reduce((a,b)=>a+b,0);
  const mean = sum / arr.length;
  const median = percentile(sorted, 0.5);
  const p90 = percentile(sorted, 0.9);
  const p99 = percentile(sorted, 0.99);
  return { count: arr.length, mean, median, p90, p99, min: sorted[0], max: sorted[sorted.length-1] };
}

async function recordPerfFromFile(runId, perfPath) {
  try {
    if (!fs.existsSync(perfPath)) return null;
    const raw = fs.readFileSync(perfPath, 'utf8');
    const j = JSON.parse(raw);
    const durations = (j.perSymbol || []).map(p => Number(p.durationMs||0)).filter(n=>!Number.isNaN(n));
    const s = computeStats(durations);
    perRunStats[runId] = s;
    return s;
  } catch (e) { return null; }
}

function incrementRun() { runCounter += 1; }
function incrementError() { runErrors += 1; }

function getProcessMetrics() {
  try {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    return { rssMb: Math.round((mem.rss||0)/1024/1024), heapUsedMb: Math.round((mem.heapUsed||0)/1024/1024), cpuUserMs: Math.round((cpu.user||0)/1000) };
  } catch (e) { return { rssMb:0, heapUsedMb:0, cpuUserMs:0 }; }
}

function metricsText() {
  const proc = getProcessMetrics();
  const lines = [];
  // process metrics
  lines.push('# HELP backtest_process_mem_rss_mb Process RSS memory in MB');
  lines.push('# TYPE backtest_process_mem_rss_mb gauge');
  lines.push(`backtest_process_mem_rss_mb ${proc.rssMb}`);
  lines.push('# HELP backtest_process_heap_used_mb Process heap used in MB');
  lines.push('# TYPE backtest_process_heap_used_mb gauge');
  lines.push(`backtest_process_heap_used_mb ${proc.heapUsedMb}`);
  lines.push('# HELP backtest_process_cpu_user_ms Process CPU user time in ms');
  lines.push('# TYPE backtest_process_cpu_user_ms gauge');
  lines.push(`backtest_process_cpu_user_ms ${proc.cpuUserMs}`);

  // counters
  lines.push('# HELP backtest_runs_total Total backtest runs started');
  lines.push('# TYPE backtest_runs_total counter');
  lines.push(`backtest_runs_total ${runCounter}`);
  lines.push('# HELP backtest_run_errors_total Total backtest run errors');
  lines.push('# TYPE backtest_run_errors_total counter');
  lines.push(`backtest_run_errors_total ${runErrors}`);

  // per-run stats (gauge labels)
  lines.push('# HELP backtest_run_per_symbol_p99_ms Per-run per-symbol p99 duration in ms');
  lines.push('# TYPE backtest_run_per_symbol_p99_ms gauge');
  for (const rid of Object.keys(perRunStats)) {
    const s = perRunStats[rid];
    if (!s) continue;
    lines.push(`backtest_run_per_symbol_p99_ms{runId="${rid}"} ${Math.round(s.p99 || 0)}`);
    lines.push(`backtest_run_per_symbol_p90_ms{runId="${rid}"} ${Math.round(s.p90 || 0)}`);
    lines.push(`backtest_run_per_symbol_median_ms{runId="${rid}"} ${Math.round(s.median || 0)}`);
    lines.push(`backtest_run_per_symbol_mean_ms{runId="${rid}"} ${Math.round(s.mean || 0)}`);
  }

  return lines.join('\n') + '\n';
}

module.exports = { incrementRun, incrementError, recordPerfFromFile, metricsText };
