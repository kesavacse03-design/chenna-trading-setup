const fs = require('fs');
const path = require('path');
const { ReplayEngine } = require('./replayEngine.cjs');
const { Simulator } = require('./simulator.cjs');
const { BreakoutStrategy } = require('./strategyBase.cjs');
const { computeMetrics } = require('./metrics.cjs');

function ensureDir(p){ try{ fs.mkdirSync(p,{recursive:true}) }catch(_){} }

async function prefetch(baseApi, items, mode){
  // try global fetch first (Node >=18), else node-fetch
  const fetchImpl = (typeof fetch === 'function') ? fetch : require('node-fetch');
  const url = `${baseApi}/strategy/prefetch`;
  const r = await fetchImpl(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode: mode || 'mock', items }) });
  if (!r.ok) throw new Error('prefetch failed');
  return r.json();
}

// Optional hooks: { onLog?: (line:string)=>void, onProgress?: ({ phase, done, total, symbol }:{phase:string,done:number,total:number,symbol?:string})=>void, isCancelled?: ()=>boolean }
async function runBacktest(params, hooks){
  const { symbols, from, to, interval, mode, categoryKey } = params;
  const baseDir = path.resolve(__dirname);
  const outDir = path.join(baseDir, 'output');
  ensureDir(outDir);
  // run log path in jobs directory
  const jobsDir = path.resolve(__dirname, '..', 'jobs'); try { fs.mkdirSync(jobsDir,{recursive:true}); } catch(_){ }
  // runId handling + resume
  const providedRunId = (params && (params.resumeRunId || params.runId)) || null;
  const runId = providedRunId || `run-${Date.now()}`;
  const isResume = !!providedRunId;
  const checkpointsDir = path.join(jobsDir, 'checkpoints', runId);
  ensureDir(checkpointsDir);
    const tsNow = Date.now();
    const runLogPath = path.join(jobsDir, `run_${runId}_logs.txt`);
  function logRun(line){ try { fs.appendFileSync(runLogPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8'); } catch(_){} }
  // rejection audit path
  const rejectionPath = path.join(jobsDir, `run_${runId}_rejections.jsonl`);
  logRun(`RUN_START symbols=${symbols.length} from=${from} to=${to} interval=${interval} mode=${mode||'mock'} runId=${runId} resume=${isResume}`);
  // Perf instrumentation (opt-in via env BACKTEST_PERF=1)
  const perfEnabled = String(process.env.BACKTEST_PERF || '') === '1';
  let perfSamples = [];
  let perfInterval = null;
  const perSymbolTimings = [];
  const perfStartCpu = perfEnabled ? process.cpuUsage() : null;
  const perfStartMem = perfEnabled ? process.memoryUsage() : null;
  if (perfEnabled) {
    // sample every 500ms
    perfInterval = setInterval(() => {
      try {
        perfSamples.push({ ts: Date.now(), mem: process.memoryUsage(), cpu: process.cpuUsage() });
      } catch (_) {}
    }, 500);
  try { if (perfInterval && typeof perfInterval.unref === 'function') perfInterval.unref(); } catch(_){}
  }
  // Optional runtime resource telemetry (CPU/mem) to run log
  let resMonStop = null;
  try {
    const { startMonitor } = require(path.resolve(__dirname, '..', 'metrics', 'resourceManager.cjs'));
    const mon = startMonitor({ intervalMs: 1500, cpuLimit: 85, onSample: (u)=>{ try { fs.appendFileSync(runLogPath, `[${new Date().toISOString()}] USAGE cpu=${u.cpuPercent}% rssMb=${u.memRssMb.toFixed(1)}\n`, 'utf8'); } catch(_){} }, onThrottle: (u)=>{ try { fs.appendFileSync(runLogPath, `[${new Date().toISOString()}] RUN_THROTTLED cpu=${u.cpuPercent}%\n`, 'utf8'); } catch(_){} } });
    resMonStop = ()=>{ try { mon.stop(); } catch(_){} };
  } catch(_){ }

  // prefetch (mock by default; if upstox requested and fails, fall back)
  // Backend API base for prefetching and proxies (NOT the Upstox host)
  const apiBase = process.env.CTS_API_BASE
    || process.env.BACKEND_BASE
    || (process.env.BACKEND_PORT ? `http://localhost:${process.env.BACKEND_PORT}` : 'http://localhost:3001');
  try {
    hooks && hooks.onLog && hooks.onLog(`prefetch ${symbols.length} symbols [${from}..${to}] interval=${interval} mode=${mode||'mock'}`);
    hooks && hooks.onProgress && hooks.onProgress({ phase:'prefetch', done:0, total: symbols.length });
    if (hooks && hooks.isCancelled && hooks.isCancelled()) {
      hooks.onLog && hooks.onLog('cancelled before prefetch');
      return { runId: `run-${Date.now()}`, resultsPath: path.join(outDir, 'cancelled.json'), tradesPath: path.join(outDir, 'cancelled.csv') };
    }
    await prefetch(apiBase, symbols.map(s=>({symbol:s, from, to, interval})), mode==='upstox'?'upstox':'mock');
    hooks && hooks.onLog && hooks.onLog('prefetch completed');
  } catch(e){
    hooks && hooks.onLog && hooks.onLog(`prefetch failed (${e && e.message ? e.message : 'error'}) — continuing with local/mock cache`);
  }

  const sim = new Simulator();
  // Choose strategy kind
  let strat;
  try {
    if (params && (params.strategyKind === 'composite' || (params.strategyConfig && (params.strategyConfig.ema_short || params.strategyConfig.rsi_period || params.strategyConfig.usePatterns)))) {
      const { CompositeStrategy } = require('./CompositeStrategy.cjs');
      strat = new CompositeStrategy();
    } else {
      strat = new BreakoutStrategy();
    }
  } catch (_) { strat = new BreakoutStrategy(); }
  const replay = new ReplayEngine();
  // stream-through for strategy internal logs
  let lastLogIdx = 0;
  const allTrades = [];
  const skipped = [];
  let processed = 0;
  hooks && hooks.onProgress && hooks.onProgress({ phase:'run', done: 0, total: symbols.length });
  // If resuming, seed prior trades from existing job JSON so final metrics cover the full set
  if (isResume) {
    try {
      const priorJobPath = path.join(jobsDir, `job_${runId}.json`);
      if (fs.existsSync(priorJobPath)) {
        const jj = JSON.parse(fs.readFileSync(priorJobPath, 'utf8')) || {};
        const perSym = jj.perSymbol || {};
        const cat = (typeof categoryKey === 'string' ? categoryKey : 'BREAKOUT');
        for (const sym of Object.keys(perSym)) {
          const entry = perSym[sym] || {};
          const trs = Array.isArray(entry.trades) ? entry.trades : [];
          for (const tr of trs) {
            const t = {
              symbol: sym,
              category: cat,
              categoryTag: (typeof categoryKey === 'string' ? categoryKey : undefined),
              entryTime: tr.entryTs || '',
              time: tr.exitTs || '',
              entry: (typeof tr.entryPrice === 'number') ? tr.entryPrice : 0,
              exit: (typeof tr.exitPrice === 'number') ? tr.exitPrice : 0,
              pnl: (typeof tr.pnl === 'number') ? tr.pnl : 0,
              direction: tr.direction || 'LONG',
              reason: tr.reason || '',
            };
            try {
              const e = t.entryTime ? new Date(String(t.entryTime)) : null;
              const x = t.time ? new Date(String(t.time)) : null;
              if (e && x) t.barsHeld = Math.max(0, Math.round((x.getTime() - e.getTime()) / (1000*60*60*24)));
            } catch(_){ }
            allTrades.push(t);
          }
        }
        logRun(`RESUME: preloaded ${allTrades.length} prior trades from job_${runId}.json`);
      }
    } catch(_){ }
  }
  // resume: filter symbols already completed per checkpoint
  function sanitizeSym(s){ return String(s).replace(/[^a-zA-Z0-9_.-]/g,'_'); }
  let symbolsToRun = Array.isArray(symbols) ? symbols.slice() : [];
  if (isResume) {
    try {
      const doneSet = new Set();
      for (const f of fs.readdirSync(checkpointsDir)) {
        try {
          const p = path.join(checkpointsDir, f);
          const j = JSON.parse(fs.readFileSync(p,'utf8'));
          if (j && (j.status === 'done' || j.done === true) && j.symbol) doneSet.add(String(j.symbol));
        } catch(_){ }
      }
      const before = symbolsToRun.length;
      symbolsToRun = symbolsToRun.filter(s=>!doneSet.has(String(s)));
      const skippedCount = before - symbolsToRun.length;
      if (skippedCount > 0) logRun(`RESUME: skipping ${skippedCount} completed symbols per checkpoints`);
    } catch(_){ }
  }
  // create CSV write stream up-front so we can write rows as trades are produced
  const csvPath = path.join(outDir, `${runId}-trades.csv`);
  const jobsCsvPath = path.join(path.resolve(__dirname, '..', 'jobs'), `run_${runId}_trades.csv`);
  // New CSV schema as per spec (snake_case columns)
  const csvHeader = 'symbol,category,signal_date,entry_price,exit_date,exit_price,holding_days,exit_type,outcome,r_multiple,pnl,trade_direction,stop_price,target_price,trade_id,signal_params,notes\n';
  let ws = null;
  let tradeSeq = 0; // deterministic trade id sequence per run
  // If resuming, continue tradeSeq from last seen trade id in existing CSV (jobs or output)
  function restoreTradeSeq() {
    try {
      const pick = fs.existsSync(jobsCsvPath) ? jobsCsvPath : (fs.existsSync(csvPath) ? csvPath : null);
      if (!pick) return;
      const txt = fs.readFileSync(pick,'utf8');
      const re = new RegExp(`${runId.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}-([0-9]+)`,'g');
      let m, maxN = 0;
      while ((m = re.exec(txt)) !== null) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
      if (maxN > 0) tradeSeq = maxN;
    } catch(_){ }
  }
  if (isResume) restoreTradeSeq();
  try {
  const append = isResume && fs.existsSync(csvPath);
  ws = fs.createWriteStream(csvPath, { flags: append ? 'a' : 'w' });
  // write header only if creating new file
  if (!append) { ws.write(csvHeader); }
  // mirror header to jobs CSV only if it's new/empty
  try {
    const needHeaderJobs = (!fs.existsSync(jobsCsvPath)) || (fs.statSync(jobsCsvPath).size === 0);
    if (needHeaderJobs) fs.writeFileSync(jobsCsvPath, csvHeader, 'utf8');
  } catch(_){ }
    ws.on('error', (err) => { hooks && hooks.onLog && hooks.onLog(`CSV: stream error ${String(err && err.message)}`); });
    hooks && hooks.onLog && hooks.onLog(`CSV: write-start ${Date.now()}`);
  } catch (e) {
    ws = null;
    hooks && hooks.onLog && hooks.onLog(`CSV: failed to open stream ${String(e && e.message)}`);
  }

  // helper to append trade and write CSV row immediately
  let _mirrorCount = 0; // count since last flush
  function pushTrade(t) {
    allTrades.push(t);
    if (ws) {
      try {
        const symbol = t.symbol;
        const category = t.categoryTag || t.category || (typeof categoryKey === 'string' ? categoryKey : '');
        const signal_date = t.entryTime || '';
        const entry_price = (t.entry !== undefined) ? Number(t.entry) : '';
        const exit_date = t.time || '';
        const exit_price = (t.exit !== undefined) ? Number(t.exit) : '';
        const holding_days = Number.isFinite(t.barsHeld) ? t.barsHeld : (Number.isFinite(t.holdingDays) ? t.holdingDays : '');
        const exit_type = (t.exitReason==='target') ? 'TARGET_HIT' : (t.exitReason==='stop') ? 'STOPLOSS_HIT' : (String(t.exitReason||'').startsWith('expired-10') ? 'EXPIRED' : (String(t.exitReason||'').toUpperCase()||''));
        const outcome = exit_type==='TARGET_HIT' ? 'SUCCESS' : (exit_type==='STOPLOSS_HIT' ? 'FAILURE' : (exit_type==='EXPIRED' ? 'EXPIRED' : exit_type));
        const stop_price = (t.stop !== undefined) ? Number(t.stop) : '';
        const target_price = (t.target !== undefined) ? Number(t.target) : '';
        const risk = (typeof entry_price==='number' && typeof stop_price==='number') ? (entry_price - stop_price) : null;
        const r_multiple = (risk && risk>0 && typeof exit_price==='number' && typeof entry_price==='number') ? +(((exit_price - entry_price) / risk)).toFixed(3) : '';
        const pnl = (t.pnl !== undefined) ? Number(t.pnl) : '';
        const trade_direction = t.direction || 'LONG';
        const trade_id = t.tradeId || `${runId}-${++tradeSeq}`;
        const signal_params = JSON.stringify(t.signalParams || (params && params.strategyConfig) || {});
        const notes = (t.reason || '').replace(/\n/g,' ').replace(/\s+/g,' ').trim();
        const row = [symbol, category, signal_date, entry_price, exit_date, exit_price, holding_days, exit_type, outcome, r_multiple, pnl, trade_direction, stop_price, target_price, trade_id, signal_params, notes].join(',') + '\n';
        ws.write(row);
        // append to jobs CSV atomically-ish (append then optional fsync every 10 trades)
        try {
          fs.appendFileSync(jobsCsvPath, row, 'utf8');
          _mirrorCount++;
          if (_mirrorCount >= 10) {
            _mirrorCount = 0;
            try { const fd = fs.openSync(jobsCsvPath, 'r'); fs.fsyncSync(fd); fs.closeSync(fd); } catch(_){ }
          }
        } catch(_){ }
      } catch (e) { /* ignore write errors, stream 'error' will be emitted */ }
    }
  }

  for (const sym of symbolsToRun){
  logRun(`JOB_START ${sym}`);
  // Test-only: force a synthetic trade per symbol when TEST_FORCE_TRADE=1 (used in resume tests to guarantee rows)
  const testForce = String(process.env.TEST_FORCE_TRADE||'') === '1';
    // checkpoint: mark running
    try {
      const cp = { runId, symbol: sym, status: 'running', startedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(checkpointsDir, `${sanitizeSym(sym)}.json`), JSON.stringify(cp, null, 2), 'utf8');
    } catch(_){ }
    if (hooks && hooks.isCancelled && hooks.isCancelled()) {
      hooks.onLog && hooks.onLog('cancelled during run');
      break;
    }
  hooks && hooks.onLog && hooks.onLog(`processing ${sym}`);
  const _symStart = perfEnabled ? Date.now() : null;
    // Ensure cache exists locally; if not, generate via MockDataAdapter
  const cacheBaseDir = categoryKey ? path.join(baseDir, 'cache', categoryKey) : path.join(baseDir, 'cache');
  const cachePath = path.join(cacheBaseDir, `${sym}_${from}_${to}_${interval}.json`);
    // Also consider server-managed cache under chenna-CTS/backend/strategy/cache
    const altBase = path.resolve(__dirname, '..', '..', 'chenna-CTS', 'backend', 'strategy');
    const altCachePath = path.join(altBase, 'cache', `${sym}_${from}_${to}_${interval}.json`);
  if (!fs.existsSync(cachePath) && !fs.existsSync(altCachePath)) {
      try {
        const { MockDataAdapter, UpstoxAdapter } = require('./dataAdapter.cjs');
        const useUpstox = (mode === 'upstox');
        // MarketData unified adapter
        let data = [];
        try {
          const { MarketDataAdapter, loadConfig } = require('../marketdata/index.cjs');
          if (!global.__MARKETDATA_ADAPTER__) {
            global.__MARKETDATA_ADAPTER__ = new MarketDataAdapter(loadConfig());
          }
          data = await global.__MARKETDATA_ADAPTER__.getHistorical(sym, from, to, interval);
        } catch (e) {
          // fallback to legacy path
          const adapter = useUpstox ? new UpstoxAdapter() : new MockDataAdapter();
          data = await adapter.fetch({ symbol: sym, from, to, interval });
        }
        if (Array.isArray(data) && data.length) {
          ensureDir(path.dirname(cachePath));
          fs.writeFileSync(cachePath, JSON.stringify({ savedAt: new Date().toISOString(), symbol: sym, from, to, interval, ohlcv: data }, null, 2), 'utf8');
        } else {
          // if adapter failed in upstox mode, skip this symbol instead of synthesizing
          const reason = (data && data.ok === false && (data.error || data.detail)) ? String(data.error || data.detail) : 'no-data';
          skipped.push({ symbol: sym, reason: useUpstox ? `upstox-failed: ${reason}` : 'mock-generate-failed' });
          try { fs.writeFileSync(path.join(checkpointsDir, `${sanitizeSym(sym)}.json`), JSON.stringify({ runId, symbol: sym, status: 'done', skipped: true, reason }, null, 2), 'utf8'); } catch(_){ }
          continue;
        }
      } catch (e) {
        skipped.push({ symbol: sym, reason: (mode==='upstox') ? 'upstox-fetch-exception' : 'mock-generate-failed', detail: String(e && e.message) });
        try { fs.writeFileSync(path.join(checkpointsDir, `${sanitizeSym(sym)}.json`), JSON.stringify({ runId, symbol: sym, status: 'done', skipped: true, reason: 'fetch-exception' }, null, 2), 'utf8'); } catch(_){ }
        continue;
      }
    }
    // load cache
    let loaded = false;
    try {
      if (fs.existsSync(altCachePath)) {
        replay.loadFromCache(altBase, sym, from, to, interval);
        loaded = true;
      }
    } catch (_) {}
    try {
      if (!loaded) {
        const cacheBase = path.join(baseDir);
        replay.loadFromCache(cacheBase, sym, from, to, interval);
        loaded = true;
      }
    } catch (_) {}
    if (!loaded) {
      skipped.push({ symbol: sym, reason: 'no-cache-found' });
      try { fs.writeFileSync(path.join(checkpointsDir, `${sanitizeSym(sym)}.json`), JSON.stringify({ runId, symbol: sym, status: 'done', skipped: true, reason: 'no-cache-found' }, null, 2), 'utf8'); } catch(_){ }
      continue;
    }
    if (!Array.isArray(replay.data) || !replay.data.length) {
      skipped.push({ symbol: sym, reason: 'empty-data' });
      try { fs.writeFileSync(path.join(checkpointsDir, `${sanitizeSym(sym)}.json`), JSON.stringify({ runId, symbol: sym, status: 'done', skipped: true, reason: 'empty-data' }, null, 2), 'utf8'); } catch(_){ }
      continue;
    }
    if (testForce) {
      try {
        const tradeId = `${runId}-${(++tradeSeq)}`;
        const fake = { symbol: sym, time: new Date().toISOString(), entryTime: new Date().toISOString(), entry: 100, exit: 101, exitReason: 'target', qty: 10, stop: 99, target: 101, pnl: 10, category: 'BREAKOUT', categoryTag: (typeof categoryKey==='string'?categoryKey:undefined), direction: 'LONG', holdingDays: 1, barsHeld: 1, tradeId, reason: 'test-force', trace:{ reason:'test-force' } };
        pushTrade(fake);
      } catch(_){ }
    }
  // strategy config
  // Allow external override via params.strategyConfig; else pick sensible defaults per mode
  const usedCfg = params && typeof params.strategyConfig === 'object' ? params.strategyConfig : null;
  if (usedCfg) {
    try { strat.setConfig(usedCfg); hooks && hooks.onLog && hooks.onLog(`STRATEGY: config override applied ${JSON.stringify(usedCfg)}`); } catch (_) {}
  } else {
    // For mock mode runs make the strategy aggressive so smoke runs produce trades.
    if ((mode || 'mock') === 'mock') {
      strat.setConfig({ N: 1, volumeFactor: 0.5, atrStop: 0.5, targetR: 1.0, qty: 100 });
    } else {
      strat.setConfig({ N: 3, volumeFactor: 0.9, atrStop: 1.0, targetR: 1.2, qty: 100 });
    }
  }
    // keep one open trade per symbol; category tag for metrics
  let open = null; // {entry, stop, target, qty, ts, barsHeld}
  // 10-day holding controls for swing categories (e.g., DOWNSIDE_LOM_SWING)
  const isSwingCategory = typeof categoryKey === 'string' && /SWING/i.test(categoryKey);
  const MAX_HOLD_BARS = 10;
  replay.start({symbol:sym, from, to}, { interval }, c => {
    strat.onCandle(c);
      // forward any new strategy logs as plain text for audit (REJECTED, entry-signal)
      try {
        const logs = (strat.getLogs && strat.getLogs()) || [];
        while (lastLogIdx < logs.length) {
          const L = logs[lastLogIdx++];
          if (!L) continue;
          if (L.action === 'REJECTED') {
            // Unified format: REJECTED <run_id> <symbol> <filterTokens> gates key=value...
            try {
              const filters = Array.isArray(L.filters)?L.filters: (typeof L.reason==='string'?L.reason.split('|'):[]);
              const gateParts=[]; const g=L.gates||{}; for (const k of Object.keys(g)) { if (g[k]!==undefined && g[k]!==null) gateParts.push(`${k}=${typeof g[k]==='number'?g[k].toFixed?g[k].toFixed(3):g[k]:g[k]}`); }
              for (const f of filters) {
                const msg = `REJECTED ${runId} ${sym} ${f} ${gateParts.join(' ')}`;
                hooks && hooks.onLog && hooks.onLog(msg);
                try { fs.appendFileSync(rejectionPath, JSON.stringify({ runId, symbol: sym, filter: f, gates: L.gates||{}, time: L.time||null }) + '\n', 'utf8'); } catch(_){ }
              }
            } catch(_){
              const msg = `REJECTED ${runId} ${sym} ${String(L.reason||'')}`; hooks && hooks.onLog && hooks.onLog(msg);
              try { fs.appendFileSync(rejectionPath, JSON.stringify({ runId, symbol: sym, reason: L.reason||'', time: L.time||null }) + '\n', 'utf8'); } catch(_){ }
            }
          } else if (L.action === 'entry-signal') {
            const msg = `STRATEGY: entry-signal ${sym} @${Number(L.price||0).toFixed(2)} reason=${L.reason||''}`;
            hooks && hooks.onLog && hooks.onLog(msg);
          }
        }
      } catch(_){}
      // Emit any strategy-level signals created by onCandle
      try {
        const pending = strat.getPending && strat.getPending();
        if (pending) {
          const msg = `STRATEGY: entry-signal ${sym} ${pending.side.toUpperCase()} @${Number(c.close).toFixed(2)} reason=${pending.reason || ''}`;
          hooks && hooks.onLog && hooks.onLog(msg);
        }
      } catch (e) { /* ignore logging errors */ }
      // exits first (respect intra-bar touches)
      if (open) {
        const high = Number(c.high), low = Number(c.low);
        // increment bars held per bar
        open.barsHeld = (open.barsHeld || 0) + 1;
            if (low <= open.stop) {
              const exitPx = +open.stop;
              const pnl = (exitPx - open.entry) * open.qty;
        const holdingDays = open.barsHeld || 0;
        const trade = { symbol: sym, time: String(c.date||''), entryTime: String(open.ts||''), entry: open.entry, exit: exitPx, exitReason: 'stop', qty: open.qty, stop: open.stop, target: open.target, pnl: +pnl.toFixed(2), category: 'BREAKOUT', categoryTag: (typeof categoryKey==='string'?categoryKey:undefined), direction: 'LONG', holdingDays, barsHeld: open.barsHeld||0, tradeId: open.tradeId, reason: open.entryReason || '', trace: { reason: open.entryReason || '' }, signalParams: (params && params.strategyConfig) || undefined };
        pushTrade(trade);
      // log exit
      const pct = ((exitPx - open.entry) / open.entry) * 100;
      hooks && hooks.onLog && hooks.onLog(`STRATEGY: exit ${sym} @${exitPx.toFixed(2)} (stop) PNL ${pnl.toFixed(2)} (${pct.toFixed(2)}%)`);
      hooks && hooks.onLog && hooks.onLog(`TRADE: closed LONG ${sym} @ ${exitPx.toFixed(2)} pnl=${pnl.toFixed(2)}`);
  try { const risk = Math.max(1e-9, (open.entry - open.stop)); const r = (exitPx - open.entry)/risk; hooks && hooks.onLog && hooks.onLog(`EXIT: ${open.tradeId} STOPLOSS_HIT ${String(c.date||'')} ${holdingDays} ${r.toFixed(3)}`); } catch(_){}
  logRun(`EXIT ${open.tradeId} STOPLOSS_HIT barsHeld=${holdingDays}`);
          open = null;
    } else if (high >= open.target) {
          const exitPx = +open.target;
          const pnl = (exitPx - open.entry) * open.qty;
    const holdingDays = open.barsHeld || 0;
  const trade = { symbol: sym, time: String(c.date||''), entryTime: String(open.ts||''), entry: open.entry, exit: exitPx, exitReason: 'target', qty: open.qty, stop: open.stop, target: open.target, pnl: +pnl.toFixed(2), category: 'BREAKOUT', categoryTag: (typeof categoryKey==='string'?categoryKey:undefined), direction: 'LONG', holdingDays, barsHeld: open.barsHeld||0, hitTargetWithin10: (isSwingCategory ? ((open.barsHeld||0) <= MAX_HOLD_BARS) : undefined), tradeId: open.tradeId, reason: open.entryReason || '', trace: { reason: open.entryReason || '' }, signalParams: (params && params.strategyConfig) || undefined };
    pushTrade(trade);
      // log exit
      const pct = ((exitPx - open.entry) / open.entry) * 100;
      hooks && hooks.onLog && hooks.onLog(`STRATEGY: exit ${sym} @${exitPx.toFixed(2)} (target) PNL ${pnl.toFixed(2)} (${pct.toFixed(2)}%)`);
      hooks && hooks.onLog && hooks.onLog(`TRADE: closed LONG ${sym} @ ${exitPx.toFixed(2)} pnl=${pnl.toFixed(2)}`);
      try { const risk = Math.max(1e-9, (open.entry - open.stop)); const r = (exitPx - open.entry)/risk; hooks && hooks.onLog && hooks.onLog(`EXIT: ${open.tradeId} TARGET_HIT ${String(c.date||'')} ${holdingDays} ${r.toFixed(3)}`); } catch(_){}
  logRun(`EXIT ${open.tradeId} TARGET_HIT barsHeld=${holdingDays}`);
          open = null;
        } else if (isSwingCategory && (open.barsHeld||0) >= MAX_HOLD_BARS) {
          // enforce strict 10-bar max holding for swing categories
          const exitPx = Number(c.close);
          const pnl = (exitPx - open.entry) * open.qty;
          const holdingDays = open.barsHeld || 0;
          const trade = { symbol: sym, time: String(c.date||''), entryTime: String(open.ts||''), entry: open.entry, exit: exitPx, exitReason: 'expired-10', qty: open.qty, stop: open.stop, target: open.target, pnl: +pnl.toFixed(2), category: 'BREAKOUT', categoryTag: (typeof categoryKey==='string'?categoryKey:undefined), direction: 'LONG', holdingDays, barsHeld: open.barsHeld||0, expiredWithin10: true, tradeId: open.tradeId, reason: open.entryReason || '', trace: { reason: open.entryReason || '' }, signalParams: (params && params.strategyConfig) || undefined };
          pushTrade(trade);
          const pct = ((exitPx - open.entry) / open.entry) * 100;
          hooks && hooks.onLog && hooks.onLog(`STRATEGY: exit ${sym} @${exitPx.toFixed(2)} (expired-10) PNL ${pnl.toFixed(2)} (${pct.toFixed(2)}%)`);
          hooks && hooks.onLog && hooks.onLog(`TRADE: closed LONG ${sym} @ ${exitPx.toFixed(2)} pnl=${pnl.toFixed(2)} expired-10`);
          try { const risk = Math.max(1e-9, (open.entry - open.stop)); const r = (exitPx - open.entry)/risk; hooks && hooks.onLog && hooks.onLog(`EXIT: ${open.tradeId} EXPIRED ${String(c.date||'')} ${holdingDays} ${r.toFixed(3)}`); } catch(_){}
          logRun(`EXIT ${open.tradeId} EXPIRED barsHeld=${holdingDays}`);
          open = null;
        }
      }
      // entries
      const p = strat.getPending();
      if (p && !open){
        try {
          // supply an empty prior-candles array and current candle as nextCandle
          const fill = sim.submit({ side:'buy', qty:p.qty, type:'market' }, [], c);
          strat.onFill(fill);
          // assign deterministic trade id at track start
          const nextId = `${runId}-${(tradeSeq + 1)}`;
          open = { entry: Number(fill.price), stop: Number(p.stop), target: Number(p.target), qty: Number(p.qty), ts: String(fill.ts||''), entryReason: p.reason || '', barsHeld: 0, tradeId: nextId, categoryTag: (typeof categoryKey==='string'?categoryKey:undefined), signalParams: p.signalParams || undefined };
          // log the fill
          try {
            hooks && hooks.onLog && hooks.onLog(`STRATEGY: enter ${sym} @${Number(fill.price).toFixed(2)} qty=${fill.qty}`);
            hooks && hooks.onLog && hooks.onLog(`TRADE: opened LONG ${sym} @ ${Number(fill.price).toFixed(2)}`);
            hooks && hooks.onLog && hooks.onLog(`TRACK START: ${open.tradeId} ${sym} ${String(open.ts||'')}`);
          } catch (e) {}
        } catch(_){ /* ignore failed fills */ }
        strat.clearPending();
      }
    });
  // process all remaining candles
  while (replay && replay.running) replay.step();
    // if still open at end, close at last close
    if (open && replay && replay.data && replay.data.length) {
      const last = replay.data[replay.data.length-1];
      const exitPx = Number(last.close);
  const pnl = (exitPx - open.entry) * open.qty;
  const holdingDays = open.barsHeld || 0;
  const trade = { symbol: sym, time: String(last.date||''), entryTime: String(open.ts||''), entry: open.entry, exit: exitPx, exitReason: isSwingCategory && (open.barsHeld||0) >= MAX_HOLD_BARS ? 'expired-10' : 'eod', qty: open.qty, stop: open.stop, target: open.target, pnl: +pnl.toFixed(2), category: 'BREAKOUT', categoryTag: (typeof categoryKey==='string'?categoryKey:undefined), direction: 'LONG', holdingDays, barsHeld: open.barsHeld||0, expiredWithin10: isSwingCategory ? ((open.barsHeld||0) >= MAX_HOLD_BARS) : undefined, tradeId: open.tradeId, reason: open.entryReason || '', trace: { reason: open.entryReason || '' }, signalParams: (params && params.strategyConfig) || undefined };
  pushTrade(trade);
  const pct = ((exitPx - open.entry) / open.entry) * 100;
  hooks && hooks.onLog && hooks.onLog(`STRATEGY: exit ${sym} @${exitPx.toFixed(2)} (eod) PNL ${pnl.toFixed(2)} (${pct.toFixed(2)}%)`);
  hooks && hooks.onLog && hooks.onLog(`TRADE: closed LONG ${sym} @ ${exitPx.toFixed(2)} pnl=${pnl.toFixed(2)}`);
  try { const risk = Math.max(1e-9, (open.entry - open.stop)); const r = (exitPx - open.entry)/risk; const et = (isSwingCategory && (open.barsHeld||0) >= MAX_HOLD_BARS) ? 'EXPIRED' : 'EOD'; hooks && hooks.onLog && hooks.onLog(`EXIT: ${open.tradeId} ${et} ${String(last.date||'')} ${holdingDays} ${r.toFixed(3)}`); } catch(_){}
  open = null;
    }
    processed++;
  logRun(`JOB_END ${sym} ok`);
    // checkpoint: mark done
    try {
      const cpDone = { runId, symbol: sym, status: 'done', finishedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(checkpointsDir, `${sanitizeSym(sym)}.json`), JSON.stringify(cpDone, null, 2), 'utf8');
    } catch(_){ }
    hooks && hooks.onProgress && hooks.onProgress({ phase:'run', done: processed, total: symbols.length, symbol: sym });
    if (perfEnabled && _symStart) {
      try { perSymbolTimings.push({ symbol: sym, durationMs: Date.now() - _symStart }); } catch(_){}
    }
    // incremental persistence snapshot (best effort)
    try {
      if ((processed % 5 === 0) || processed === symbols.length) {
        const snapPath = path.join(outDir, `${runId}-partial.json`);
        const partial = { runId, processed, symbolsTotal: symbols.length, trades: allTrades.length, lastSymbol: sym };
        fs.writeFileSync(snapPath, JSON.stringify(partial, null, 2), 'utf8');
      }
    } catch(_){ }
  }
  // per-category metrics
  const perCategory = {};
  const groups = allTrades.reduce((acc, t) => { const k = t.category || 'UNCATEGORIZED'; (acc[k]=acc[k]||[]).push(t); return acc; }, {});
  for (const k of Object.keys(groups)) perCategory[k] = computeMetrics(groups[k]);
  // perSymbol breakdown
  const perSymbol = {};
  const bySym = allTrades.reduce((acc,t)=>{ (acc[t.symbol]=acc[t.symbol]||[]).push(t); return acc; }, {});
  for (const s of Object.keys(bySym)) perSymbol[s] = computeMetrics(bySym[s]);
  // build perSymbol metrics to include symbols with zero trades as well
  const perSymbolComplete = {};
  for (const s of symbols) {
    const trades = bySym[s] || [];
    perSymbolComplete[s] = computeMetrics(trades);
  }
  // 10-day success/failure metrics (swing categories)
  let successWithin10Days = 0, failWithin10Days = 0, expiredTrades = 0;
  try {
    for (const tr of allTrades) {
      const bars = Number(tr.barsHeld || 0);
      const within10 = bars > 0 && bars <= 10;
      if (String(tr.exitReason||'') === 'target' && within10) successWithin10Days++;
      else if (String(tr.exitReason||'') === 'stop' && within10) failWithin10Days++;
      if (String(tr.exitReason||'').startsWith('expired-10')) expiredTrades++;
    }
  } catch(_){}
  const results = { runId, symbols, metrics: computeMetrics(allTrades), perCategory, perSymbol: perSymbolComplete, swing10: { successWithin10Days, failWithin10Days, expiredTrades, successRateWithin10Days: (successWithin10Days + failWithin10Days) > 0 ? +(successWithin10Days*100/(successWithin10Days+failWithin10Days)).toFixed(2) : 0 }, resume: isResume };
  // build simple equity curve (cumulative PnL in trade order)
  try {
    let eq=0; const curve=[];
    for (const tr of allTrades){ eq += Number(tr.pnl||0); curve.push(+eq.toFixed(2)); }
    results.equityCurve = curve;
  } catch(_){}
  try {
    // Attach strategy configuration used for this run (non-breaking extra field)
    results.strategyConfig = (params && typeof params.strategyConfig === 'object') ? params.strategyConfig : undefined;
  } catch(_){ }
  if (skipped.length) results.missing = skipped;
  const resPath = path.join(outDir, `${runId}-results.json`);
  fs.writeFileSync(resPath, JSON.stringify(results, null, 2));
  // Copy artifacts into jobs folder for durability
  try {
    const jobsDir = path.resolve(__dirname, '..', 'jobs');
    const jobsCsv = path.join(jobsDir, `run_${runId}_trades.csv`);
    const jobsJson = path.join(jobsDir, `run_${runId}_results.json`);
    const jobsManifest = path.join(jobsDir, `run_${runId}_manifest.json`);
    fs.copyFileSync(csvPath, jobsCsv);
    fs.copyFileSync(resPath, jobsJson);
    // manifest gets written below; copy after writing
    process.nextTick(()=>{
      try { const manPath = path.join(outDir, `${runId}-manifest.json`); if (fs.existsSync(manPath)) fs.copyFileSync(manPath, jobsManifest); } catch(_){ }
    });
  } catch(_){ }
  // Write manifest capturing run inputs (for optimizer summary consumption)
  try {
  const seed = (params && params.seed) ? Number(params.seed) : (process.env.SEED ? Number(process.env.SEED) : null);
  const gitCommit = (()=>{ try { return fs.readFileSync(path.resolve(process.cwd(), '.git/HEAD'), 'utf8').trim(); } catch(_){ return null; } })();
  const paramGridFile = process.env.PARAM_GRID_FILE || null;
  const thresholds = {
    promoMinTrades: Number(process.env.PROMO_MIN_TRADES||30),
    promoMaxDrawdown: Number(process.env.PROMO_MAX_DRAWDOWN||50000),
    wickRatioThreshold: (params && params.strategyConfig && params.strategyConfig.wick_ratio_threshold) ? params.strategyConfig.wick_ratio_threshold : undefined
  };
  const manifest = { runId, from, to, interval, mode: mode||'mock', symbolsCount: symbols.length, createdAt: new Date().toISOString(), strategyConfig: (params && params.strategyConfig) || null, resume: isResume, seed, gitCommit, paramGridFile, thresholds };
  const manOut = path.join(outDir, `${runId}-manifest.json`);
  fs.writeFileSync(manOut, JSON.stringify(manifest, null, 2), 'utf8');
  // also copy to jobs
  try { const jobsDir = path.resolve(__dirname, '..', 'jobs'); fs.copyFileSync(manOut, path.join(jobsDir, `run_${runId}_manifest.json`)); } catch(_){ }
  } catch(_){}
  // finalize CSV stream and wait for flush
  try {
    if (ws) {
      const csvFinishStart = Date.now();
      await new Promise((resolve) => { try { ws.end(() => resolve()); } catch (_) { resolve(); } });
      const csvFinishEnd = Date.now();
      hooks && hooks.onLog && hooks.onLog(`CSV: write-finish ${csvFinishEnd} durationMs=${csvFinishEnd - csvFinishStart}`);
    } else {
      hooks && hooks.onLog && hooks.onLog('CSV: no write stream present');
    }
  } catch (e) { hooks && hooks.onLog && hooks.onLog(`CSV: finalize error ${String(e && e.message)}`); }
  hooks && hooks.onLog && hooks.onLog(`RESULT: completed runId=${runId} trades=${allTrades.length}`);
  logRun(`RUN_END runId=${runId} trades=${allTrades.length}`);

  // Assemble job JSON for API consumption and persistence under backend/jobs
  try {
    const jobsDir = path.resolve(__dirname, '..', 'jobs');
    try { fs.mkdirSync(jobsDir, { recursive: true }); } catch (e) {}
    // group trades per symbol
    const perSymbolTrades = {};
    for (const t of allTrades) { if (!perSymbolTrades[t.symbol]) perSymbolTrades[t.symbol] = []; perSymbolTrades[t.symbol].push(t); }
    const perSymbolObj = {};
    for (const s of symbols) {
      const trades = perSymbolTrades[s] || [];
      perSymbolObj[s] = { trades, metrics: computeMetrics(trades) };
    }
    // compute avg holding days
    const holdingDays = allTrades.map(tr => {
      try {
        const e = tr.entryTime ? new Date(String(tr.entryTime)) : null;
        const x = tr.time ? new Date(String(tr.time)) : null;
        if (!e || !x) return 0;
        const diff = Math.max(0, Math.round((x.getTime() - e.getTime()) / (1000*60*60*24)));
        return diff;
      } catch (e) { return 0; }
    });
    const avgHoldingDays = holdingDays.length ? (holdingDays.reduce((a,b)=>a+b,0)/holdingDays.length) : 0;
  const summary = {
      runId,
      totalTrades: allTrades.length,
      tradesCount: allTrades.length,
      totalPnL: results.metrics.netPnl || 0,
      avgReturn: results.metrics.avgReturn || 0,
      winRate: results.metrics.winRate || 0,
      profitFactor: results.metrics.profitFactor || 0,
      maxDrawdown: results.metrics.maxDrawdown || 0,
      avgHoldingDays: +avgHoldingDays.toFixed(2),
      missingCount: (results.missing && results.missing.length) || 0,
      // include run context for downstream workers
      from,
      to,
      interval,
  mode: (params && params.mode) || 'mock',
  strategyConfig: (params && typeof params.strategyConfig === 'object') ? params.strategyConfig : null
    };
  try { summary.swing10 = results.swing10; } catch(_){ }
  try { summary.equityCurve = results.equityCurve || []; } catch(_){}
    const suggestionsPath = path.join(outDir, `${runId}-suggestions.json`);
    let insights = [];
    try { if (fs.existsSync(suggestionsPath)) { const sj = JSON.parse(fs.readFileSync(suggestionsPath,'utf8')); insights = sj.suggestions || []; } } catch (e) {}
    let jobObj = {
      runId,
      summary,
      perSymbol: perSymbolObj,
      insights,
      status: 'done',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: null
    };
    // Normalizer helper
    function normalizeJob(obj) {
      obj.error = obj.error === undefined ? null : obj.error;
      obj.perSymbol = obj.perSymbol || {};
      for (const sym of Object.keys(obj.perSymbol || {})) {
        const entry = obj.perSymbol[sym] || {};
        entry.metrics = entry.metrics || {};
        entry.metrics.netPnl = typeof entry.metrics.netPnl === 'number' ? entry.metrics.netPnl : 0;
        entry.metrics.wins = typeof entry.metrics.wins === 'number' ? entry.metrics.wins : 0;
        entry.metrics.losses = typeof entry.metrics.losses === 'number' ? entry.metrics.losses : 0;
        entry.trades = Array.isArray(entry.trades) ? entry.trades : [];
        entry.trades = entry.trades.map(t => {
          const out = {};
          out.symbol = t.symbol || sym;
          out.entryTs = t.entryTime || t.entryTs || t.entry_time || null;
          out.entryPrice = (typeof t.entry === 'number') ? t.entry : (typeof t.entryPrice === 'number' ? t.entryPrice : null);
          out.exitTs = t.time || t.exitTime || t.exitTs || null;
          out.exitPrice = (typeof t.exit === 'number') ? t.exit : (typeof t.exitPrice === 'number' ? t.exitPrice : null);
          out.pnl = (typeof t.pnl === 'number') ? t.pnl : (typeof t.pnl === 'string' && !isNaN(Number(t.pnl)) ? Number(t.pnl) : 0);
          out.direction = t.direction || null;
          out.reason = t.reason || t.exitReason || null;
          out.trace = t.trace || [];
          return out;
        });
        obj.perSymbol[sym] = entry;
      }
      return obj;
    }

    try { jobObj = normalizeJob(jobObj); } catch(_) {}
  // Validate job object against schema before writing
  try {
    const validator = require(path.join(__dirname, '..', 'schema', 'validateBacktestResult.cjs'));
    const { valid, errors } = validator.validate(jobObj);
    const jobPath = path.join(jobsDir, `job_${runId}.json`);
    if (!valid) {
      // write the invalid job JSON for debugging and an errors file
      const errPath = path.join(jobsDir, `job_${runId}.validation-error.json`);
      fs.writeFileSync(errPath, JSON.stringify({ errors }, null, 2), 'utf8');
      fs.writeFileSync(jobPath, JSON.stringify(jobObj, null, 2), 'utf8');
      // set status failed and error string
      jobObj.status = 'failed';
      jobObj.error = (errors || []).map(e => `${e.instancePath} ${e.message}`).join('; ');
      hooks && hooks.onLog && hooks.onLog(`RESULT: validation failed for job_${runId}`);
      hooks && hooks.onLog && hooks.onLog(`RESULT: wrote job JSON ${jobPath} and errors ${errPath}`);
      // persist the failed job with error
      fs.writeFileSync(jobPath, JSON.stringify(jobObj, null, 2), 'utf8');
    } else {
      fs.writeFileSync(jobPath, JSON.stringify(jobObj, null, 2), 'utf8');
      hooks && hooks.onLog && hooks.onLog(`RESULT: wrote job JSON ${jobPath}`);
      hooks && hooks.onLog && hooks.onLog(`RESULT: job_id=${runId} persisted to jobs/job_${runId}.json`);
    }
  } catch (e) {
    // fallback: write jobObj anyway and log
    const jobPath = path.join(jobsDir, `job_${runId}.json`);
    fs.writeFileSync(jobPath, JSON.stringify(jobObj, null, 2), 'utf8');
    hooks && hooks.onLog && hooks.onLog(`RESULT: wrote job JSON ${jobPath} (validator failed: ${String(e && e.message)})`);
  }
  } catch (e) {
  hooks && hooks.onLog && hooks.onLog(`RESULT: failed to write job JSON: ${String(e && e.message)} ${e && e.stack ? '\n' + e.stack : ''}`);
  }

  // finalize perf sampling and write perf artifact if enabled
  try {
  try { resMonStop && resMonStop(); } catch(_){ }
    if (perfEnabled) {
      if (perfInterval) try { clearInterval(perfInterval); } catch(_){}
      const perfEndCpu = process.cpuUsage(perfStartCpu || undefined);
      const perfEndMem = process.memoryUsage();
      const perf = { runId, capturedAt: new Date().toISOString(), perSymbol: perSymbolTimings, samples: perfSamples, cpuDelta: perfEndCpu, memStart: perfStartMem, memEnd: perfEndMem };
      try {
        const perfPath = path.join(outDir, `${runId}-perf.json`);
        fs.writeFileSync(perfPath, JSON.stringify(perf, null, 2), 'utf8');
        hooks && hooks.onLog && hooks.onLog(`PERF: wrote perf file ${perfPath}`);
      } catch (e) { hooks && hooks.onLog && hooks.onLog(`PERF: failed to write perf file: ${String(e && e.message)}`); }
    }
  } catch (e) { /* ignore perf finalize errors */ }

  // Phase G: offload shadow learner to async worker (gated)
  try {
    if (params && params.disableShadow) {
      hooks && hooks.onLog && hooks.onLog('SHADOW: skip (disableShadow true)');
      return { runId, resultsPath: resPath, tradesPath: csvPath };
    }
    const jobsDir = path.resolve(__dirname, '..', 'jobs');
    const jobPath = path.join(jobsDir, `job_${runId}.json`);
    // mark insights as pending and persist
    try {
      if (fs.existsSync(jobPath)) {
        const j = JSON.parse(fs.readFileSync(jobPath, 'utf8')) || {};
        j.insightsStatus = 'pending';
        try { fs.writeFileSync(jobPath, JSON.stringify(j, null, 2), 'utf8'); } catch (_) {}
      }
    } catch (_) {}
    // spawn worker (non-blocking)
    // Optional gating: if env SHADOW_REQUIRE_PROMOTION=1 and no promotion file exists, skip.
    let allowSpawn = true;
    try {
      if (String(process.env.SHADOW_REQUIRE_PROMOTION||'') === '1') {
        const promoFiles = fs.readdirSync(jobsDir).filter(f=>/promotion\.json$/i.test(f));
        const foundPromoted = promoFiles.some(pf => {
          try { const pj = JSON.parse(fs.readFileSync(path.join(jobsDir,pf),'utf8')); return pj && pj.promoted === true; } catch(_) { return false; }
        });
        try { logRun(foundPromoted ? 'SHADOW: promotion detected' : 'SHADOW: no promotion detected'); } catch(_){ }
        if (!foundPromoted) allowSpawn = false;
      }
    } catch(_){ }
    if (!allowSpawn) {
      hooks && hooks.onLog && hooks.onLog('SHADOW: gating skip (no promotion)');
      try { logRun('SHADOW: gating skip (no promotion)'); } catch(_){ }
      return { runId, resultsPath: resPath, tradesPath: csvPath };
    }
    try {
      const { fork } = require('child_process');
      const workerPath = path.resolve(__dirname, '..', 'shadowWorker.cjs');
      if (fs.existsSync(workerPath)) {
  const child = fork(workerPath, [runId], { stdio: 'inherit' });
  // log immediately so callers don't have to wait for exit hook
  try { logRun(`SHADOW: worker spawned pid=${child.pid} run-${runId}`); } catch(_){ }
  hooks && hooks.onLog && hooks.onLog(`SHADOW: worker spawned pid=${child.pid} run-${runId}`);
        child.on('exit', (code) => { hooks && hooks.onLog && hooks.onLog(`SHADOW: worker exit code=${code} run-${runId}`); try { logRun(`SHADOW: worker exit code=${code} run-${runId}`); } catch(_){ } });
      } else {
        hooks && hooks.onLog && hooks.onLog('SHADOW: worker not found');
        try { logRun('SHADOW: worker not found'); } catch(_){ }
      }
    } catch (e) { hooks && hooks.onLog && hooks.onLog(`SHADOW: spawn failed: ${String(e && e.message)}`); try { logRun(`SHADOW: spawn failed: ${String(e && e.message)}`); } catch(_){ } }
  } catch (e) {
    hooks && hooks.onLog && hooks.onLog(`SHADOW: enqueue failed: ${e && e.message ? e.message : 'error'}`);
  }
  return { runId, resultsPath: resPath, tradesPath: csvPath };
}

module.exports = { runBacktest };

// CLI entry (lightweight) to support: node strategy/backtester.cjs --strategy tmp/v1_compiled.js --symbols-file tmp/category_symbols.txt --from YYYY-MM-DD --to YYYY-MM-DD --out jobs/job.json --csv strategy/output/job.csv --fast
if (require.main === module) {
  (async function(){
    try {
      const args = process.argv.slice(2);
      let strategyPath=null, symbolsFile=null, from=null, to=null, outJson=null, outCsv=null, fast=false, resumeRunId=null, runIdFlag=null;
      for (let i=0;i<args.length;i++){
        const a=args[i], n=args[i+1];
        if (a==='--strategy'){ strategyPath=n; i++; }
        else if (a==='--symbols-file'){ symbolsFile=n; i++; }
        else if (a==='--from'){ from=n; i++; }
        else if (a==='--to'){ to=n; i++; }
        else if (a==='--out'){ outJson=n; i++; }
        else if (a==='--csv'){ outCsv=n; i++; }
        else if (a==='--fast'){ fast=true; }
        else if (a==='--resume-run'){ resumeRunId=n; i++; }
        else if (a==='--run-id'){ runIdFlag=n; i++; }
      }
      const fs = require('fs'); const path = require('path');
      if (!symbolsFile || !from || !to){ console.error('Usage: --strategy tmp/v1_compiled.js --symbols-file tmp/category_symbols.txt --from YYYY-MM-DD --to YYYY-MM-DD [--out jobs/job.json] [--csv strategy/output/job.csv] [--fast]'); process.exit(2); }
      const symbols = fs.readFileSync(symbolsFile, 'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const interval = 'day'; const mode = 'mock';
      // If strategy file exists and exports params, pass it through as override
      let strategyConfig = null;
      try { if (strategyPath && fs.existsSync(strategyPath)) { const mod = require(path.resolve(strategyPath)); strategyConfig = (mod && mod.params) || null; } } catch(_){ }
      const start = Date.now();
  const out = await runBacktest({ symbols, from, to, interval, mode, strategyConfig, resumeRunId: resumeRunId || undefined, runId: runIdFlag || undefined }, { onLog: (l)=>console.log(l) });
      const dur = (Date.now()-start)/1000;
      // copy outputs to requested locations if provided
      try { if (outCsv) { fs.mkdirSync(path.dirname(outCsv), { recursive: true }); fs.copyFileSync(out.tradesPath, outCsv); } } catch(_){}
      try { if (outJson) { fs.mkdirSync(path.dirname(outJson), { recursive: true }); fs.copyFileSync(out.resultsPath, outJson); } } catch(_){}
  console.log('DONE', { seconds: +dur.toFixed(2), runId: out.runId || (resumeRunId||runIdFlag||null), results: out.resultsPath, csv: out.tradesPath });
    } catch (e) { console.error('ERR', String(e && e.message || e)); process.exit(1); }
  })();
}