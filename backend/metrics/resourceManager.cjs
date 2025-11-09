// Lightweight resource manager for optimizer/backtester runtime
// Provides:
//   detectResources() -> { cpuCores, gpuDevices }
//   planConcurrency(maxDesired, fraction=0.8) respecting env CPU_FRACTION
//   sampleUsage() -> { cpuPercent, memRssMb }
//   startMonitor({ intervalMs, cpuLimit, onThrottle, onSample }) with env CPU_LIMIT override and smoothing
// Notes:
//   - CPU usage smoothing via rolling average of last N samples to reduce jitter.
//   - Windows friendliness: if process.cpuUsage produces inconsistent delta (elapsedMs<=0), fallback to load average heuristic.
//   - GPU detection stub optionally checks basic environment flags (CTS_GPU_COUNT).
const os = require('os');

function detectResources(){
  let cpuCores = 1; try { cpuCores = (os.cpus()||[]).length || 1; } catch(_){}
  // GPU detection: environment override or best-effort nvidia-smi probe (non-fatal)
  let gpuDevices = 0;
  try {
    if (process.env.CTS_GPU_COUNT) {
      const n = Number(process.env.CTS_GPU_COUNT); if (!isNaN(n) && n>=0) gpuDevices = n;
    } else if (process.platform !== 'win32') {
      // Attempt quick nvidia-smi --query-gpu=name -L
      const { execSync } = require('child_process');
      try {
        const out = execSync('nvidia-smi -L', { stdio:['ignore','pipe','ignore'], encoding:'utf8', timeout: 500 });
        gpuDevices = (out || '').split('\n').filter(l=>/GPU \d+:/.test(l)).length;
      } catch(_){ /* ignore if not present */ }
    }
  } catch(_){ }
  return { cpuCores, gpuDevices };
}

function planConcurrency(maxDesired, fraction=0.8){
  const envFrac = process.env.CPU_FRACTION ? Number(process.env.CPU_FRACTION) : null;
  if (envFrac && envFrac > 0 && envFrac <= 1) fraction = envFrac;
  const { cpuCores } = detectResources();
  const target = Math.max(1, Math.floor(cpuCores * fraction));
  return Math.max(1, Math.min(Number(maxDesired)||1, target));
}

let _lastCpu = process.cpuUsage(); let _lastTs = Date.now();
const _smoothBuffer = []; const SMOOTH_N = 5;
function sampleUsage(){
  let cpuPercent = 0;
  try {
    const nowCpu = process.cpuUsage();
    const nowTs = Date.now();
    const userDiff = nowCpu.user - _lastCpu.user;
    const sysDiff = nowCpu.system - _lastCpu.system;
    const elapsedMs = nowTs - _lastTs;
    const totalMicros = userDiff + sysDiff; // microseconds
    const cores = (os.cpus()||[]).length || 1;
    if (elapsedMs > 0) {
      cpuPercent = Math.min(100, (totalMicros / 1000) / elapsedMs * 100 / cores);
    } else {
      // Fallback heuristic using 1-minute load average scaled by cores
      const la = (os.loadavg && os.loadavg()[0]) || 0;
      cpuPercent = Math.min(100, (la / cores) * 100);
    }
    _lastCpu = nowCpu; _lastTs = nowTs;
  } catch(_){}
  // smoothing
  _smoothBuffer.push(cpuPercent);
  if (_smoothBuffer.length > SMOOTH_N) _smoothBuffer.shift();
  const smoothCpu = _smoothBuffer.reduce((a,b)=>a+b,0)/_smoothBuffer.length;
  let memRssMb = 0; try { memRssMb = (process.memoryUsage().rss||0)/1024/1024; } catch(_){ }
  return { cpuPercent: +smoothCpu.toFixed(1), memRssMb };
}

function startMonitor({ intervalMs=1000, cpuLimit=80, onThrottle, onSample }){
  const envLimit = process.env.CPU_LIMIT ? Number(process.env.CPU_LIMIT) : null;
  if (envLimit && envLimit > 10) cpuLimit = envLimit; // sanity: ignore tiny values
  const handle = setInterval(()=>{
    const usage = (module && module.exports && typeof module.exports.sampleUsage==='function') ? module.exports.sampleUsage() : sampleUsage();
    try { onSample && onSample(usage); } catch(_){ }
    try { if (usage.cpuPercent > cpuLimit) onThrottle && onThrottle(usage); } catch(_){ }
  }, intervalMs);
  return { stop(){ try { clearInterval(handle); } catch(_){} } };
}

module.exports = { detectResources, planConcurrency, sampleUsage, startMonitor };