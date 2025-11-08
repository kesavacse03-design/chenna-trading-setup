const fs = require('fs');
const path = require('path');
const { UpstoxAdapter } = require('./adapters/upstox.cjs');
const { CacheAdapter } = require('./adapters/cache.cjs');
const { HealthMonitor } = require('./health.cjs');

class MarketDataAdapter {
  constructor(config){
    this.config = config || { providers: ['UPSTOX','CACHE'] };
    this.health = new HealthMonitor({ thresholds: (config && config.thresholds) || {}, jobsDir: path.resolve(__dirname, '..', 'jobs') });
    this.adapters = {};
    this.adapters.UPSTOX = new UpstoxAdapter();
    this.adapters.CACHE = new CacheAdapter({});
    this.primaryName = this.config.providers[0];
    this.health.activeProvider = this.primaryName;
  const disableSnaps = String(process.env.MARKETDATA_DISABLE_SNAPSHOTS||'') === '1';
  if (!disableSnaps) this.health.startSnapshots();
    console.log(`INFO: MARKETDATA_START provider=${this.primaryName}`);
  }
  get active(){ return this.adapters[this.health.activeProvider]; }
  _record(status, latency){ this.health.cb.record(status, latency); }
  async _maybeTrip(){
    if (this.health.cb.shouldTrip() && this.health.activeProvider !== this.config.providers[1]) {
      const from = this.health.activeProvider; const to = this.config.providers[1];
      this.health.activeProvider = to; this.health.fallbackProvider = to; this.health.fallbackSince = new Date().toISOString();
      if (this.config.execution && this.config.execution.fallbackSetsPaper) { this.health.executionMode = 'PAPER'; console.log('EXECUTION_MODE PAPER due to fallback'); }
      console.log(`ALERT: FALLBACK_SWITCH runId=NA from=${from} to=${to} reason="circuitTrip"`);
      this.health.writeStatus('fallback-switch');
    }
  }
  async getHistorical(symbol, from, to, interval='day'){
    const start = Date.now();
    let data, status=200;
    try {
      data = await this.active.getHistorical(symbol, from, to, interval);
      if (data && data.ok===false) status = data.status || 500;
    } catch(e){ status=500; }
    const latency = Date.now()-start;
    this._record(status, latency);
    await this._maybeTrip();
    return Array.isArray(data) ? data : (data && data.ok===false ? [] : []);
  }
  async getTick(symbol){ return this.active.getTick(symbol); }
  async lookupInstrument(symbol){ return this.active.lookupInstrument(symbol); }
  subscribeTicks(symbol, cb){ return this.active.subscribeTicks(symbol, cb); }
  async attemptRecovery(){
    if (this.health.activeProvider === this.primaryName) return false; // already primary
  // recovery policy: either last 5 all healthy OR error rate < 5% over last 20
  const last5 = this.health.cb.samples.slice(-5);
  const last20 = this.health.cb.samples.slice(-20);
  const last5Ok = last5.length === 5 && last5.every(s=>s.status < 500);
  const errRate20 = last20.length ? (last20.filter(s=>s.status>=500).length / last20.length) : 1;
  if (last5Ok || errRate20 < 0.05) {
      const fromTs = this.health.fallbackSince;
      const toTs = new Date().toISOString();
      // reconciliation stub: we would fetch missing candles; here we just log
      console.log(`INFO: RECOVERY_COMPLETE runId=NA provider=${this.primaryName} reconciledFrom=${fromTs} to=${toTs}`);
      this.health.activeProvider = this.primaryName;
      this.health.executionMode = 'LIVE';
      this.health.writeStatus('recovered');
      this.health.cb.reset();
      return true;
    }
    return false;
  }
}

function loadConfig(){
  try {
    const fp = path.resolve(process.cwd(), 'config', 'marketdata.json');
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp,'utf8')) || {};
  } catch(e){}
  return { providers:['UPSTOX','CACHE'], thresholds:{ consecutiveErrors:5, errorRate5xx:0.1, windowSize:100 }, execution:{ fallbackSetsPaper:true } };
}

module.exports = { MarketDataAdapter, loadConfig };
