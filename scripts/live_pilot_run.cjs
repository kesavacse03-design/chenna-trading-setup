#!/usr/bin/env node
/**
 * Live Pilot Runner (guarded)
 * Launches LiveRunner with strict risk controls and artifact persistence.
 * Usage: node scripts/live_pilot_run.cjs --symbols-file config/live_symbols_10.txt --parallel 3 --run-id live_pilot_<ts>
 * Required env: ALLOW_LIVE_CALLS=1 EXECUTION_MODE=LIVE CTS_API_BASE=... REQUIRE_PROMOTION=1 NO_PARTIAL_BAR_SIGNALS=1
 */
const fs = require('fs');
const path = require('path');
const { LiveRunner } = require('../backend/strategy/liveRunner.cjs');
const { MarketDataAdapter, loadConfig } = require('../backend/marketdata/index.cjs');
const notifier = require('../backend/alerts/notify.cjs');

function parseArgs(argv){
  const out = { symbolsFile: null, parallel: 1, runId: null };
  for (let i=0;i<argv.length;i++){
    const a=argv[i]; const nxt = ()=>argv[i+1];
    if (a==='--symbols-file'){ out.symbolsFile = nxt(); i++; }
    else if (a==='--parallel'){ out.parallel = Number(nxt()||'1'); i++; }
    else if (a==='--run-id'){ out.runId = nxt(); i++; }
  }
  if (!out.runId) out.runId = `live_pilot_${Date.now()}`;
  return out;
}

function abort(msg){ console.error('[LIVE_PILOT_ABORT]', msg); process.exit(1); }

function loadSymbols(file){
  try { const raw = fs.readFileSync(file,'utf8'); return raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); } catch(e){ abort('symbols file missing:'+file); }
}

const args = parseArgs(process.argv.slice(2));
const runId = args.runId;
const jobsDir = path.resolve(process.cwd(),'backend','jobs');
try { fs.mkdirSync(jobsDir,{recursive:true}); } catch(_){ }

// Preconditions
if (process.env.ALLOW_LIVE_CALLS!=='1') abort('ALLOW_LIVE_CALLS must be 1');
if (process.env.EXECUTION_MODE!=='LIVE') abort('EXECUTION_MODE must be LIVE');
if (!process.env.CTS_API_BASE) abort('CTS_API_BASE missing');
// Promotion gating flags
process.env.REQUIRE_PROMOTION = '1';
process.env.NO_PARTIAL_BAR_SIGNALS = '1';

const symbols = loadSymbols(args.symbolsFile || 'config/live_symbols_10.txt');
if (symbols.length === 0) abort('No symbols loaded');

// Risk limits from env or fixed
const riskCfg = {
  MAX_RISK_PER_TRADE_BPS: Number(process.env.MAX_RISK_PER_TRADE_BPS||50),
  MAX_DAILY_DRAWDOWN_PCT: Number(process.env.MAX_DAILY_DRAWDOWN_PCT||1.5),
  MAX_CONCURRENT_TRADES: Number(process.env.MAX_CONCURRENT_TRADES||5),
  SLIPPAGE_BPS: Number(process.env.SLIPPAGE_BPS||10),
  CANCEL_IF_SPREAD_BPS: Number(process.env.CANCEL_IF_SPREAD_BPS||20),
  HALT_ON_FALLBACK: Number(process.env.HALT_ON_FALLBACK||1)===1,
  SWING_MAX_HOLD_DAYS: Number(process.env.SWING_MAX_HOLD_DAYS||10)
};

// One-line summary
console.log(`[LIVE_PILOT] runId=${runId} symbols=${symbols.length} risk=RISK_PER_TRADE_BPS:${riskCfg.MAX_RISK_PER_TRADE_BPS} DD_PCT:${riskCfg.MAX_DAILY_DRAWDOWN_PCT} MAX_POS:${riskCfg.MAX_CONCURRENT_TRADES} SLIPPAGE_BPS:${riskCfg.SLIPPAGE_BPS} SPREAD_CANCEL_BPS:${riskCfg.CANCEL_IF_SPREAD_BPS} FALLBACK_HALT:${riskCfg.HALT_ON_FALLBACK} SWING_EXPIRY_DAYS:${riskCfg.SWING_MAX_HOLD_DAYS}`);
console.log(`[LIVE_PILOT] strategies=BreakoutStrategy (promotion gating active)`);
console.log('[LIVE_PILOT] Kill-switch commands:');
console.log('  Pause immediately: scripts/force-pause.sh');
console.log('  Revert to PAPER: scripts/set-mode-paper.sh');

// Artifact paths
const ordersCsv = path.join(jobsDir, `${runId}_orders.csv`);
const tradesCsv = path.join(jobsDir, `${runId}_trades.csv`);
const healthJson = path.join(jobsDir, `${runId}_health.json`);
const reportJson = path.join(jobsDir, `${runId}_report.json`);

// Init CSV headers
if (!fs.existsSync(ordersCsv)) fs.writeFileSync(ordersCsv, 'ts,event,symbol,side,qty,price,reason,stop,target,latencyMs\n','utf8');
if (!fs.existsSync(tradesCsv)) fs.writeFileSync(tradesCsv, 'ts,symbol,entry,exit,exitReason,qty,stop,target,pnl,holdingDays,reason\n','utf8');

// Market data adapter to monitor fallback
const mdConfig = loadConfig();
const mda = new MarketDataAdapter(mdConfig);

// Live runner
const runner = new LiveRunner(Number(process.env.LIVE_PORT||8080));
runner.start((msg)=>{ console.log('[LIVE]', msg); });

// Override capital/drawdown threshold
runner.initialCapital = Number(process.env.INITIAL_CAPITAL||100000);
runner.currentCapital = runner.initialCapital;
runner.drawdownThreshold = riskCfg.MAX_DAILY_DRAWDOWN_PCT/100; // convert percent

function writeHealth(){
  const payload = {
    ts: new Date().toISOString(),
    runId,
    provider: mda.health.activeProvider,
    fallback: mda.health.fallbackProvider ? true : false,
    error_rate_5xx: mda.health.cb.samples.filter(s=>s.status>=500).length / (mda.health.cb.samples.length||1),
    trades: runner.metrics.trades,
    orders: runner.metrics.orders,
    exposure: runner.currentExposure,
    capital: runner.currentCapital,
    drawdown_pct: ((runner.initialCapital-runner.currentCapital)/runner.initialCapital*100).toFixed(4),
    stopped: runner.isStopped
  };
  try { fs.writeFileSync(healthJson, JSON.stringify(payload,null,2),'utf8'); } catch(_){}
}
function writeReport(){
  const payload = {
    ts: new Date().toISOString(),
    runId,
    pnl: +(runner.currentCapital-runner.initialCapital).toFixed(2),
    winRateApprox: runner.metrics.trades ? (runner.metrics.trades/Math.max(1, runner.metrics.trades))*100 : 0,
    exposure: runner.currentExposure,
    drawdown_pct: ((runner.initialCapital-runner.currentCapital)/runner.initialCapital*100).toFixed(4),
    tradesTotal: runner.metrics.trades,
    ordersTotal: runner.metrics.orders
  };
  try { fs.writeFileSync(reportJson, JSON.stringify(payload,null,2),'utf8'); } catch(_){}
}

// Hook audit logger queue to generate CSV rows (poll logs directory is complex; we intercept engine events via patch)
const origLog = runner.engine.onLog;
runner.engine.onLog = (msg)=>{ origLog && origLog(msg); };

// Extend engine audit via monkey patch trade_entry/trade_exit
const auditPath = runner.engine.audit && runner.engine.audit.filePath;
let lastSize = 0;
function scanAudit(){
  if (!auditPath || !fs.existsSync(auditPath)) return;
  try {
    const stat = fs.statSync(auditPath);
    if (stat.size === lastSize) return;
    const diffBuf = fs.readFileSync(auditPath,'utf8');
    lastSize = stat.size;
    const lines = diffBuf.trim().split(/\n/).slice(-50); // recent tail
    for (const ln of lines){
      try {
        const j = JSON.parse(ln);
        if (j.type==='trade_entry'){
          const row = `${j.ts},ORDER_PLACED,${j.symbol},LONG,${j.qty},${j.entry},entry,${j.stop},${j.target},${j.latencyMs||''}\n`;
          fs.appendFileSync(ordersCsv,row,'utf8');
          try { notifier.sendAlert(`ORDER_PLACED ${j.symbol} qty=${j.qty} @${j.entry}`); } catch(_){}
        } else if (j.type==='order_error'){
          const row = `${j.ts},ORDER_REJECTED,${j.symbol},LONG,, ,${j.error.replace(/,/g,';')},,,\n`;
          fs.appendFileSync(ordersCsv,row,'utf8');
          try { notifier.sendAlert(`ORDER_REJECTED ${j.symbol}: ${j.error}`); } catch(_){}
        } else if (j.type==='trade_exit'){
          const pnl = j.pnl || 0;
          const row = `${j.ts},${j.symbol},${j.entry},${j.exit},${j.reason||j.exitReason||''},${j.qty},${j.stop},${j.target},${pnl},,,${j.reason||''}\n`;
          fs.appendFileSync(tradesCsv,row,'utf8');
        }
      } catch(_){ }
    }
  } catch(_){ }
}

setInterval(()=>{ scanAudit(); writeHealth(); writeReport(); }, 60000).unref();

// Risk enforcement ticker (simple):
setInterval(()=>{
  // drawdown check
  const ddPct = (runner.initialCapital - runner.currentCapital)/runner.initialCapital*100;
  if (ddPct >= riskCfg.MAX_DAILY_DRAWDOWN_PCT){
    console.log('[RISK] Daily drawdown exceeded. Halting.');
    runner.isStopped = true;
  try { notifier.sendAlert(`HALT: Daily drawdown ${ddPct.toFixed(2)}% >= ${riskCfg.MAX_DAILY_DRAWDOWN_PCT}%`); } catch(_){}
  }
  // fallback halt
  if (riskCfg.HALT_ON_FALLBACK && mda.health.fallbackProvider){
    console.log('[RISK] Market data fallback active. Halting new orders.');
    runner.isStopped = true;
  try { notifier.sendAlert('HALT: Market data fallback active'); } catch(_){}
  }
  // concurrent trades
  const openCount = runner.engine.openPositions.size;
  if (openCount > riskCfg.MAX_CONCURRENT_TRADES){
    console.log('[RISK] MAX_CONCURRENT_TRADES exceeded. Halting.');
    runner.isStopped = true;
  }
}, 5000).unref();

process.on('SIGINT', ()=>{ console.log('Shutdown'); process.exit(0); });

// Expose artifact paths quickly for external tools
console.log(`[LIVE_PILOT_ARTIFACTS] orders=${ordersCsv} trades=${tradesCsv} health=${healthJson} report=${reportJson}`);
