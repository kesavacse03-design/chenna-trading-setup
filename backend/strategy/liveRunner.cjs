// Optional env loader (no-op if not present)
try { require('dotenv').config(); } catch (_) {}
const WebSocket = require('ws');
const http = require('http');
const { BreakoutStrategy } = require('./strategyBase.cjs');
const { UpstoxOrderAdapter } = require('./upstoxOrderAdapter.cjs');
const { AlertManager } = require('./alertManager.cjs');
const { AuditLogger } = require('./auditLogger.cjs');
const { TokenManager } = require('./tokenManager.cjs');

// LiveEngine: Manages live strategy execution, replacing ReplayEngine for real-time
class LiveEngine {
  constructor() {
    this.strat = new BreakoutStrategy();
    this.sim = new UpstoxOrderAdapter(); // Use production adapter with dry-run support
    this.openPositions = new Map(); // symbol -> {entry, stop, target, qty, ts, entryReason}
    this.allTrades = [];
    this.onLog = null; // callback for logging
  this.audit = new AuditLogger({ prefix: 'live-audit' });
  // Track signal timestamps to compute latency until fill
  this.pendingSignals = new Map(); // symbol -> ts (ms)
  }

  // Configure strategy (reuse from backtester)
  setConfig(config) {
    this.strat.setConfig(config);
  }

  // Process a live candle/tick
  async processCandle(candle, runner) {
    if (runner.isStopped) {
      if (this.onLog) this.onLog('Trading stopped by kill-switch');
      return;
    }

    // Circuit breaker: check error rate and drawdown
    const now = Date.now();
    runner.errors = runner.errors.filter(e => now - e < 60000); // Last minute
    if (runner.errors.length > 5) { // >5 errors/min
      if (this.onLog) this.onLog('Circuit breaker: high error rate, stopping');
      runner.isStopped = true;
      return;
    }
    const drawdown = (runner.initialCapital - runner.currentCapital) / runner.initialCapital;
    if (drawdown > runner.drawdownThreshold) {
      if (this.onLog) this.onLog('Circuit breaker: drawdown exceeded, stopping');
      runner.isStopped = true;
      return;
    }

  const { symbol, date, open, high, low, close, volume } = candle;
    // Prefer provided instrument_key; fallback to resolver if available
    const instrumentKey = (() => {
      try {
        if (candle && (candle.instrument_key || candle.instrumentKey || candle.instrument)) {
          return String(candle.instrument_key || candle.instrumentKey || candle.instrument);
        }
        if (runner && runner.instrumentResolver && symbol) {
          const r = runner.instrumentResolver.resolveBySymbol(String(symbol));
          return r && r.key ? String(r.key) : null;
        }
        return null;
      } catch(_) { return null; }
    })();
    const c = { date, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) };

  // Heartbeat: remember last candle time
  try { runner.lastCandleTs = date ? new Date(String(date)).getTime() : Date.now(); } catch (_) { runner.lastCandleTs = Date.now(); }

    // Call strategy onCandle
    this.strat.onCandle(c);

    // Emit any strategy-level signals
    try {
      const pending = this.strat.getPending && this.strat.getPending();
      if (pending) {
        const msg = `STRATEGY: entry-signal ${symbol} ${pending.side.toUpperCase()} @${Number(c.close).toFixed(2)} reason=${pending.reason || ''}`;
        if (this.onLog) this.onLog(msg);
        try {
          this.audit.log('signal_entry', { symbol, side: pending.side || 'buy', price: Number(c.close), reason: pending.reason || '', ts: String(c.date || new Date().toISOString()) });
        } catch(_) {}
        // Remember when we saw this signal
        try { this.pendingSignals.set(symbol, Date.now()); } catch(_) {}
      }
    } catch (e) { /* ignore */ }

  // Handle exits first (respect intra-bar touches)
    const openPos = this.openPositions.get(symbol);
    if (openPos) {
      const high = Number(c.high), low = Number(c.low);
      if (low <= openPos.stop) {
        const exitPx = +openPos.stop;
        const pnl = (exitPx - openPos.entry) * openPos.qty;
        runner.currentCapital += pnl;
        const holdingDays = (() => {
          try {
            const e = new Date(String(openPos.ts || ''));
            const x = new Date(String(c.date || ''));
            return Math.max(0, Math.round((x - e) / (1000 * 60 * 60 * 24)));
          } catch (_) { return 0; }
        })();
  const trade = {
          symbol,
          time: String(c.date || ''),
          entryTime: String(openPos.ts || ''),
          entry: openPos.entry,
          exit: exitPx,
          exitReason: 'stop',
          qty: openPos.qty,
          stop: openPos.stop,
          target: openPos.target,
          pnl: +pnl.toFixed(2),
          category: 'BREAKOUT',
          direction: 'LONG',
          holdingDays,
          reason: openPos.entryReason || '',
          trace: { reason: openPos.entryReason || '' }
        };
  this.allTrades.push(trade);
        runner.currentExposure -= Math.abs(openPos.entry * openPos.qty);
        runner.metrics.trades++;
  runner.lastActionTs = Date.now();
        const pct = ((exitPx - openPos.entry) / openPos.entry) * 100;
        if (this.onLog) {
          this.onLog(`STRATEGY: exit ${symbol} @${exitPx.toFixed(2)} (stop) PNL ${pnl.toFixed(2)} (${pct.toFixed(2)}%)`);
          this.onLog(`TRADE: closed LONG ${symbol} @ ${exitPx.toFixed(2)} pnl=${pnl.toFixed(2)}`);
        }
  try { this.audit.log('trade_exit', { symbol, side: 'LONG', reason: 'stop', exit: exitPx, pnl, qty: openPos.qty }); } catch (_) {}
        this.openPositions.delete(symbol);
      } else if (high >= openPos.target) {
        const exitPx = +openPos.target;
        const pnl = (exitPx - openPos.entry) * openPos.qty;
        runner.currentCapital += pnl;
        const holdingDays = (() => {
          try {
            const e = new Date(String(openPos.ts || ''));
            const x = new Date(String(c.date || ''));
            return Math.max(0, Math.round((x - e) / (1000 * 60 * 60 * 24)));
          } catch (_) { return 0; }
        })();
  const trade = {
          symbol,
          time: String(c.date || ''),
          entryTime: String(openPos.ts || ''),
          entry: openPos.entry,
          exit: exitPx,
          exitReason: 'target',
          qty: openPos.qty,
          stop: openPos.stop,
          target: openPos.target,
          pnl: +pnl.toFixed(2),
          category: 'BREAKOUT',
          direction: 'LONG',
          holdingDays,
          reason: openPos.entryReason || '',
          trace: { reason: openPos.entryReason || '' }
        };
  this.allTrades.push(trade);
        runner.currentExposure -= Math.abs(openPos.entry * openPos.qty);
        runner.metrics.trades++;
  runner.lastActionTs = Date.now();
        const pct = ((exitPx - openPos.entry) / openPos.entry) * 100;
        if (this.onLog) {
          this.onLog(`STRATEGY: exit ${symbol} @${exitPx.toFixed(2)} (target) PNL ${pnl.toFixed(2)} (${pct.toFixed(2)}%)`);
          this.onLog(`TRADE: closed LONG ${symbol} @ ${exitPx.toFixed(2)} pnl=${pnl.toFixed(2)}`);
        }
  try { this.audit.log('trade_exit', { symbol, side: 'LONG', reason: 'target', exit: exitPx, pnl, qty: openPos.qty }); } catch (_) {}
        this.openPositions.delete(symbol);
      }
    }

    // Handle entries
    const p = this.strat.getPending();
    if (p && !this.openPositions.has(symbol)) {
      // Rate limit: max 10 orders per minute per strategy
      const key = 'breakout'; // Assume single strategy
      const now = Date.now();
      if (!runner.rateLimits.has(key)) runner.rateLimits.set(key, { count: 0, resetTime: now + 60000 });
      const limit = runner.rateLimits.get(key);
      if (now > limit.resetTime) {
        limit.count = 0;
        limit.resetTime = now + 60000;
      }
      if (limit.count >= 10) {
        if (this.onLog) this.onLog('Rate limit exceeded for strategy');
        return;
      }

      // Safety checks: Max exposure, per-trade risk distance, per-symbol cap
      const maxPerSymbolQty = Number(process.env.MAX_QTY_PER_SYMBOL || 0) || null;
      if (maxPerSymbolQty && Number(p.qty) > maxPerSymbolQty) {
        if (this.onLog) this.onLog(`Per-symbol qty cap hit for ${symbol}: qty=${p.qty} > cap=${maxPerSymbolQty}`);
        try { this.audit.log('reject_entry', { symbol, reason: 'qty-cap', qty: p.qty, cap: maxPerSymbolQty }); } catch(_) {}
        return;
      }

      // Max exposure check
      const exposure = Math.abs(c.close * p.qty);
      if (runner.currentExposure + exposure > runner.maxExposure) {
        if (this.onLog) this.onLog('Max exposure exceeded');
        try { this.audit.log('reject_entry', { symbol, reason: 'exposure-cap', exposure, currentExposure: runner.currentExposure, maxExposure: runner.maxExposure }); } catch(_) {}
        return;
      }

      // Risk distance check (stop should be below entry for long)
      const entryPx = Number(c.close);
      const riskDistance = Math.max(0, entryPx - Number(p.stop || entryPx));
      const maxRisk = Number(process.env.MAX_RISK_DISTANCE || 0) || null; // absolute price units
      if (maxRisk && riskDistance > maxRisk) {
        if (this.onLog) this.onLog(`Risk distance too large: ${riskDistance} > cap ${maxRisk}`);
        try { this.audit.log('reject_entry', { symbol, reason: 'risk-distance-cap', riskDistance, cap: maxRisk }); } catch(_) {}
        return;
      }

      try {
        // Submit order via adapter (production or dry-run)
        const order = { side: 'buy', qty: p.qty, type: 'market', symbol, instrument_key: instrumentKey || undefined, price: c.close }; // Use close as market price

        // Enforce live trading guard only when not in dry-run
        if (process.env.DRY_RUN !== '1' && process.env.ALLOW_LIVE !== '1') {
          throw new Error('live-trading-guard: Set ALLOW_LIVE=1 to enable real orders');
        }

        try { this.audit.log('order_submit', { symbol, side: 'buy', qty: Number(p.qty), intended_price: Number(c.close) }); } catch(_) {}

  const fill = await this.sim.submit(order, [], c);
        this.strat.onFill(fill);
        this.openPositions.set(symbol, {
          entry: Number(fill.price),
          stop: Number(p.stop),
          target: Number(p.target),
          qty: Number(p.qty),
          ts: String(fill.ts || ''),
          entryReason: p.reason || ''
        });
        // Compute latency from signal to fill when available
        try {
          const sigMs = this.pendingSignals.has(symbol) ? this.pendingSignals.get(symbol) : null;
          const fillMs = (() => { try { return new Date(String(fill.ts||c.date||new Date().toISOString())).getTime(); } catch(_) { return Date.now(); } })();
          const latencyMs = (sigMs && fillMs) ? Math.max(0, fillMs - sigMs) : null;
          if (latencyMs != null) this.audit.log('fill_latency', { symbol, ms: latencyMs });
        } catch(_) {}
        runner.currentExposure += Math.abs(fill.price * fill.qty);
        limit.count++;
        runner.metrics.orders++;
        runner.lastActionTs = Date.now();
        if (this.onLog) {
          this.onLog(`STRATEGY: enter ${symbol} @${Number(fill.price).toFixed(2)} qty=${fill.qty}`);
          this.onLog(`TRADE: opened LONG ${symbol} @ ${Number(fill.price).toFixed(2)}`);
        }
        try {
          const sigMs = this.pendingSignals.has(symbol) ? this.pendingSignals.get(symbol) : null;
          const fillMs = (() => { try { return new Date(String(fill.ts||c.date||new Date().toISOString())).getTime(); } catch(_) { return Date.now(); } })();
          const latencyMs = (sigMs && fillMs) ? Math.max(0, fillMs - sigMs) : null;
          this.audit.log('trade_entry', { symbol, side: 'LONG', entry: Number(fill.price), qty: Number(p.qty), stop: Number(p.stop), target: Number(p.target), latencyMs });
        } catch(_) {}
      } catch (e) {
        // In dry-run replays, avoid tripping circuit too aggressively
        if (process.env.DRY_RUN === '1') {
          try { this.audit.log('order_error_dry', { symbol, error: String(e && e.message || e) }); } catch(_) {}
        } else {
          runner.errors.push(now);
        }
        runner.metrics.errors++;
        if (this.onLog) this.onLog(`Order submit error: ${e.message}`);
        try { this.audit.log('order_error', { symbol, error: String(e && e.message || e) }); } catch(_) {}
      }
      this.strat.clearPending();
    }
  }

  // Get current state for monitoring
  getState() {
    return {
      openPositions: Array.from(this.openPositions.entries()),
      totalTrades: this.allTrades.length,
      lastTrades: this.allTrades.slice(-5) // last 5 for brevity
    };
  }
}

// LiveRunner: Wraps LiveEngine and provides websocket/polling interface
class LiveRunner {
  constructor(port = 8080) {
    this.port = port;
    this.engine = new LiveEngine();
    this.server = null;
    this.wss = null;
    this.isStopped = false; // Global kill-switch
    this.rateLimits = new Map(); // strategy -> { count, resetTime }
    this.maxExposure = 100000; // Max total exposure (configurable)
    // Allow override via env for staged/canary rollout
    if (!Number.isNaN(Number(process.env.MAX_EXPOSURE))) {
      this.maxExposure = Number(process.env.MAX_EXPOSURE);
    }
    this.currentExposure = 0;
    this.errorRate = 0; // Errors per minute
    this.drawdownThreshold = 0.1; // 10% drawdown
    this.errors = [];
    this.initialCapital = 100000; // Mock initial capital
    this.currentCapital = this.initialCapital;
    this.canaryMode = process.env.CANARY_MODE === '1'; // Force dry-run for canary
    this.metrics = { trades: 0, orders: 0, errors: 0, exposure: 0 };
    this.alertManager = new AlertManager();
    this.alertManager.setupDefaultAlerts();
  this.audit = new AuditLogger({ prefix: 'live-runner' });
  this.tokenManager = new TokenManager();
  try {
    const { InstrumentResolver } = require('./instrumentResolver.cjs');
    this.instrumentResolver = new InstrumentResolver();
    const reloadMs = Number(process.env.INSTRUMENT_RELOAD_MS || process.env.INSTRUMENTS_RELOAD_MS || 0);
    const fetchUrl = process.env.INSTRUMENTS_FETCH_URL || process.env.INSTRUMENTS_URL || null;
    if (reloadMs && reloadMs > 0) this.instrumentResolver.startAutoReload(reloadMs, fetchUrl);
  } catch(_) { this.instrumentResolver = null; }
  this.startTime = Date.now();
  this.lastCandleTs = null;
  this.lastActionTs = null;
  this.heartbeatInterval = null;
  }

  // Start the live runner with websocket server
  start(onLog = null) {
    this.engine.onLog = onLog;
    // Configure strategy (aggressive for live testing)
    this.engine.setConfig({ N: 1, volumeFactor: 0.5, atrStop: 0.5, targetR: 1.0, qty: 100 });

    // Force dry-run in canary mode
    if (this.canaryMode) {
      this.engine.sim = new (require('./upstoxOrderAdapter.cjs').UpstoxOrderAdapter)();
      process.env.DRY_RUN = '1';
      if (onLog) onLog('Canary mode: dry-run enabled');
    }

    // Create HTTP server with admin/health endpoints
    this.server = http.createServer((req, res) => {
      // CORS + JSON default headers
      const setJson = () => res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
      if (req.method === 'OPTIONS') { setJson(); res.end('{}'); return; }
      // Helper: read JSON body for POST endpoints
      const readBody = () => new Promise((resolve) => {
        try {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); } catch (_) { resolve({}); }
          });
        } catch (_) { resolve({}); }
      });

      if (req.url === '/admin/stop-live' && req.method === 'POST') {
        this.isStopped = true;
        setJson();
        res.end(JSON.stringify({ ok: true, message: 'Live trading stopped' }));
        if (onLog) onLog('Global kill-switch activated');
        return;
      }
      // Securely store/rotate Upstox token (encrypted on disk)
      if (req.url === '/admin/store-token' && req.method === 'POST') {
        (async () => {
          const adminKey = process.env.ADMIN_SHARED_SECRET;
          if (!adminKey) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok:false, error:'admin-secret-not-configured' })); return; }
          const provided = req.headers['x-admin-key'];
          if (provided !== adminKey) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok:false, error:'unauthorized' })); return; }
          try {
            const body = await readBody();
            const accessToken = body && (body.accessToken || body.token || body.access_token);
            const refreshToken = body && (body.refreshToken || body.refresh_token);
            if (!accessToken) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok:false, error:'missing accessToken' })); return; }
            // Save encrypted tokens; do not log secret
            this.tokenManager.saveTokens(String(accessToken), String(refreshToken || ''));
            try { this.audit.log('token_saved', { by:'admin', length: String(accessToken).length }); } catch(_) {}
            setJson();
            res.end(JSON.stringify({ ok:true }));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok:false, error: String(e && e.message || e) }));
          }
        })();
        return;
      }
      if (req.url === '/health' && req.method === 'GET') {
        const mem = (() => { try { const m = process.memoryUsage(); return Math.round((m.rss||0)/1024/1024); } catch(_) { return 0; } })();
        setJson();
        res.end(JSON.stringify({
          ok: true,
          isStopped: this.isStopped,
          canary: this.canaryMode,
          uptimeMs: Date.now() - this.startTime,
          port: this.port,
          wsClients: this.wss ? this.wss.clients.size : 0,
          lastCandleTs: this.lastCandleTs,
          lastActionTs: this.lastActionTs,
          rssMb: mem
        }));
  try { this.audit.log('health_ping', { wsClients: this.wss ? this.wss.clients.size : 0 }); } catch(_) {}
        return;
      }
      if (req.url === '/api/marketdata/status' && req.method === 'GET') {
        try {
          const fs = require('fs');
          const path = require('path');
          const jobsDir = path.resolve(__dirname, '..', 'jobs');
          const statusPath = path.join(jobsDir, 'marketdata_status.json');
          setJson();
          if (fs.existsSync(statusPath)) {
            const j = JSON.parse(fs.readFileSync(statusPath,'utf8'));
            res.end(JSON.stringify({ ok: true, status: j }));
          } else {
            res.end(JSON.stringify({ ok: true, status: { provider: 'UNKNOWN' } }));
          }
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
        }
        return;
      }
      // Ingest a single candle via HTTP for simple real-time testing
      if (req.url === '/ingest/candle' && req.method === 'POST') {
        (async () => {
          const body = await readBody();
          const c = body && (body.candle || body);
          // Prefer instrument_key when present; keep symbol for readability
          const instrument_key = c && (c.instrument_key || c.instrumentKey || c.instrument) || null;
          const symbol = String(c && c.symbol || '');
          const candle = {
            symbol: symbol,
            instrument_key: instrument_key || undefined,
            date: c && c.date ? String(c.date) : new Date().toISOString(),
            open: Number(c && c.open),
            high: Number(c && c.high),
            low: Number(c && c.low),
            close: Number(c && c.close),
            volume: Number(c && c.volume || 0)
          };
          try {
            if (!candle.symbol || Number.isNaN(candle.close)) throw new Error('invalid-candle');
            await this.engine.processCandle(candle, this);
            setJson();
            res.end(JSON.stringify({ ok: true, state: this.engine.getState(), metrics: this.metrics }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
          }
        })();
        return;
      }
      // Ingest multiple candles (array)
  if (req.url === '/ingest/candles' && req.method === 'POST') {
        (async () => {
          const body = await readBody();
          const arr = Array.isArray(body && body.candles) ? body.candles : (Array.isArray(body) ? body : []);
          try {
            for (const c of arr) {
              const candle = {
                symbol: String(c && c.symbol || ''),
                instrument_key: c && (c.instrument_key || c.instrumentKey || c.instrument) || undefined,
                date: c && c.date ? String(c.date) : new Date().toISOString(),
                open: Number(c && c.open),
                high: Number(c && c.high),
                low: Number(c && c.low),
                close: Number(c && c.close),
                volume: Number(c && c.volume || 0)
              };
              if (!candle.symbol || Number.isNaN(candle.close)) continue;
              // eslint-disable-next-line no-await-in-loop
              await this.engine.processCandle(candle, this);
            }
            setJson();
            res.end(JSON.stringify({ ok: true, count: arr.length, state: this.engine.getState(), metrics: this.metrics }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
          }
        })();
        return;
      }
      if (req.url === '/status' && req.method === 'GET') {
        setJson();
        res.end(JSON.stringify({ state: this.engine.getState(), metrics: this.metrics, stopped: this.isStopped }));
        return;
      }
  if (req.url === '/metrics' && req.method === 'GET') {
        const metrics = {
          live_trades_total: this.metrics.trades,
          live_orders_total: this.metrics.orders,
          live_errors_total: this.metrics.errors,
          live_exposure_current: this.currentExposure,
          live_capital_current: this.currentCapital,
          live_drawdown_percent: ((this.initialCapital - this.currentCapital) / this.initialCapital * 100).toFixed(2),
          live_is_stopped: this.isStopped ? 1 : 0,
          live_canary_mode: this.canaryMode ? 1 : 0
        };

        // Check for alerts
        const triggeredAlerts = this.alertManager.checkAlerts(metrics);

        const response = {
          ...metrics,
          alerts: triggeredAlerts,
          recent_notifications: this.alertManager.getNotifications()
        };

        const asProm = process.env.METRICS_FORMAT === 'prom';
        if (asProm) {
          const lines = [
            `live_trades_total ${metrics.live_trades_total}`,
            `live_orders_total ${metrics.live_orders_total}`,
            `live_errors_total ${metrics.live_errors_total}`,
            `live_exposure_current ${metrics.live_exposure_current}`,
            `live_capital_current ${metrics.live_capital_current}`,
            `live_drawdown_percent ${metrics.live_drawdown_percent}`,
            `live_is_stopped ${metrics.live_is_stopped}`,
            `live_canary_mode ${metrics.live_canary_mode}`
          ];
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(lines.join('\n'));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        }
        return;
      }
      if (req.url === '/alerts' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          configured_alerts: Array.from(this.alertManager.alerts.keys()),
          recent_notifications: this.alertManager.getNotifications()
        }));
        return;
      }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Live Runner WebSocket Server\n');
    });

    // Create WebSocket server
    this.wss = new WebSocket.Server({ server: this.server });

    this.wss.on('connection', (ws) => {
      if (onLog) onLog('WebSocket client connected');
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'candle') {
            await this.engine.processCandle(data.candle, this);
          } else if (data.type === 'status') {
            ws.send(JSON.stringify({ type: 'status', state: this.engine.getState() }));
          }
        } catch (e) {
          if (onLog) onLog(`WebSocket message error: ${e.message}`);
        }
      });
      ws.on('close', () => {
        if (onLog) onLog('WebSocket client disconnected');
      });
    });

    this.server.listen(this.port, () => {
      if (onLog) onLog(`Live Runner started on port ${this.port}`);
  if (onLog) onLog(`Env: UPSTOX_ENV=${process.env.UPSTOX_ENV || 'prod'} DRY_RUN=${process.env.DRY_RUN === '1' ? '1' : '0'} CANARY_MODE=${this.canaryMode ? '1' : '0'} MAX_EXPOSURE=${this.maxExposure}`);
      // Heartbeat logger
      const hbMs = Number(process.env.LIVE_HEARTBEAT_MS || 10000);
      this.heartbeatInterval = setInterval(() => {
        const sinceLastCandle = this.lastCandleTs ? (Date.now() - this.lastCandleTs) : null;
        const sinceLastAction = this.lastActionTs ? (Date.now() - this.lastActionTs) : null;
        if (onLog) onLog(`HEARTBEAT up ${(Date.now()-this.startTime)/1000|0}s | trades=${this.metrics.trades} orders=${this.metrics.orders} errors=${this.metrics.errors} exposure=${this.currentExposure.toFixed(2)} stopped=${this.isStopped} lastCandleMs=${sinceLastCandle} lastActionMs=${sinceLastAction}`);
      }, hbMs);
    });
  }

  // Stop the server
  stop() {
    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
  if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  // Get engine state
  getState() {
    return this.engine.getState();
  }
}

module.exports = { LiveRunner, LiveEngine };

// Standalone execution for testing
if (require.main === module) {
  const port = Number(process.env.WS_PORT || 8080);
  const runner = new LiveRunner(port);
  runner.start((msg) => console.log(`[LIVE] ${msg}`));

  // Optional self-test mode: send a couple candles then exit
  if (process.env.LIVE_SELFTEST === '1') {
    console.log('[LIVE] Self-test mode enabled');
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => {
      console.log('[LIVE] Self-test WS connected, sending mock candles...');
      const send = (c) => ws.send(JSON.stringify({ type: 'candle', candle: c }));
      const base = Date.now();
      send({ symbol: 'TEST', date: new Date(base).toISOString(), open: 100, high: 100, low: 100, close: 100, volume: 500 });
      setTimeout(() => send({ symbol: 'TEST', date: new Date(base+60000).toISOString(), open: 105, high: 107, low: 104, close: 106, volume: 800 }), 200);
      setTimeout(() => ws.send(JSON.stringify({ type: 'status' })), 400);
    });
    ws.on('message', (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg.type === 'status') {
          console.log('[LIVE] Self-test status:', msg.state);
          ws.close();
          runner.stop();
          process.exit(0);
        }
      } catch (_) {}
    });
    ws.on('error', (e) => {
      console.error('[LIVE] Self-test WS error:', e.message);
      runner.stop();
      process.exit(1);
    });
  }
}
