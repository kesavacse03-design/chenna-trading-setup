const fs = require('fs');
const path = require('path');

function nowIso(){ return new Date().toISOString(); }

class CircuitBreaker {
  constructor(opts) {
    this.windowSize = opts.windowSize || 100;
    this.consecutiveErrorLimit = opts.consecutiveErrors || 5;
    this.errorRate5xxLimit = opts.errorRate5xx || 0.10;
    this.samples = [];
    this.consecutiveErrors = 0;
    this.trippedAt = null;
  }
  record(status, latencyMs) {
    const isError = status >= 500;
    if (isError) this.consecutiveErrors += 1; else this.consecutiveErrors = 0;
    this.samples.push({ status, latencyMs, ts: Date.now() });
    if (this.samples.length > this.windowSize) this.samples.shift();
  }
  shouldTrip(){
    const s = this.samples.slice(-this.windowSize);
    const total = s.length || 1;
    const e5 = s.filter(x=>x.status>=500).length;
    const rate = e5 / total;
    return (this.consecutiveErrors >= this.consecutiveErrorLimit) || (rate > this.errorRate5xxLimit);
  }
  reset(){ this.consecutiveErrors = 0; this.trippedAt = null; this.samples.length = 0; }
}

class HealthMonitor {
  constructor(opts){
    this.jobsDir = opts.jobsDir || path.resolve(__dirname, '..', 'jobs');
    this.snapIntervalMs = opts.snapIntervalMs || 60000;
    this.cb = new CircuitBreaker(opts.thresholds || {});
    this.activeProvider = null;
    this.fallbackProvider = null;
    this.fallbackSince = null;
    this.executionMode = 'LIVE';
    this.timer = null;
    this.alertsLog = path.join(this.jobsDir, 'alerts.log');
    try { fs.mkdirSync(this.jobsDir, { recursive: true }); } catch(_){ }
  }
  alert(line){
    const entry = `[${new Date().toISOString()}] ${line}`;
    try { fs.appendFileSync(this.alertsLog, entry + "\n", 'utf8'); } catch(_){ }
    // optionally send external notification (Slack/Telegram) when configured
    try {
      if (String(process.env.ENABLE_EXTERNAL_ALERTS||'') === '1'){
        const notify = require(path.resolve(__dirname, '..', 'alerts', 'notify.cjs'));
        notify.sendAlert(line).then(r=>{ try { fs.appendFileSync(this.alertsLog, `[${new Date().toISOString()}] ALERT_SENT ${JSON.stringify(r)}\n`, 'utf8'); } catch(_){}}).catch(e=>{ try { fs.appendFileSync(this.alertsLog, `[${new Date().toISOString()}] ALERT_ERR ${String(e&&e.message||e)}\n`, 'utf8'); } catch(_){}});
      }
    } catch(_){ }
  }
  startSnapshots(){
    if (this.timer) return;
    this.timer = setInterval(()=>{
      this.writeSnapshotNow();
    }, this.snapIntervalMs);
    try { if (this.timer && typeof this.timer.unref === 'function') this.timer.unref(); } catch(_){}
  }
  stopSnapshots(){ if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  writeSnapshotNow(){
    const counts = this.cb.samples.reduce((a,s)=>{ a[String(s.status)] = (a[String(s.status)]||0)+1; return a; },{});
    const lat = this.cb.samples.length ? (this.cb.samples.reduce((a,s)=>a+s.latencyMs,0)/this.cb.samples.length) : 0;
    const payload = { ts: nowIso(), provider: this.activeProvider, last_100_status_counts: counts, error_rate_5xx: (counts['500']||0)/(this.cb.samples.length||1), latency_ms_avg: lat };
    const out = path.join(this.jobsDir, `marketdata_health_${Date.now()}.json`);
    try { fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8'); } catch(_){ }
    return out;
  }
  writeStatus(reason){
    const out = path.join(this.jobsDir, 'marketdata_status.json');
    const payload = { ts: nowIso(), provider: this.activeProvider, execution_mode: this.executionMode, reason, fallback_since: this.fallbackSince };
    try { fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8'); } catch(_){ }
  }
}

module.exports = { CircuitBreaker, HealthMonitor };
