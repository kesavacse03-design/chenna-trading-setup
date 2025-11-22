const path = require('path');
const fs = require('fs');
const { safeStat, fileExists, readJsonSafe, httpGetJson } = require('./health-check-util.cjs');

function buildChecks({ server, port, startedAt, version }) {
  const nowIso = new Date().toISOString();
  const checks = {};

  function add(id, payload) {
    const ok = !!payload.ok;
    checks[id] = {
      id,
      name: payload.name || id,
      ok,
      status: payload.status || (ok ? 'ok' : 'error'),
      detail: payload.detail || null,
      hint: payload.hint || '',
    };
  }

  // Backend alive
  try {
    const uptimeSec = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
    add('backend_alive', {
      ok: true,
      name: 'Backend process',
      status: 'ok',
      detail: { version, uptimeSec },
      hint: 'If this check fails, the Node backend process is down. Restart backend_run.cmd or pm2.'
    });
  } catch (e) {
    add('backend_alive', {
      ok: false,
      name: 'Backend process',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Backend crashed during health evaluation. Check logs under logs/.'
    });
  }

  const root = path.resolve(__dirname, '..');

  // DB or storage placeholder: ensure strategy output folder exists
  try {
    const outDir = path.resolve(root, 'backend', 'strategy', 'output');
    const st = safeStat(outDir);
    add('db', {
      ok: !!(st && st.isDirectory()),
      name: 'Strategy output storage',
      status: st && st.isDirectory() ? 'ok' : 'warn',
      detail: { path: outDir },
      hint: 'If missing, create backend/strategy/output or fix container volume mapping.'
    });
  } catch (e) {
    add('db', {
      ok: false,
      name: 'Strategy output storage',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check filesystem permissions for backend/strategy/output.'
    });
  }

  // stocks_endpoint: basic marketdata health
  try {
    const mdHealthPath = path.resolve(root, 'backend', 'marketdata', 'health.cjs');
    const hasModule = fileExists(mdHealthPath);
    add('stocks_endpoint', {
      ok: hasModule,
      name: 'Marketdata/Stocks endpoint',
      status: hasModule ? 'ok' : 'warn',
      detail: { module: hasModule ? mdHealthPath : null },
      hint: 'If WARN, ensure backend/marketdata/health.cjs exists and is wired into the server routes.'
    });
  } catch (e) {
    add('stocks_endpoint', {
      ok: false,
      name: 'Marketdata/Stocks endpoint',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check marketdata module wiring and health route.'
    });
  }

  // OHLC coverage: inspect cache dir
  try {
    const cacheDir = path.resolve(root, 'backend', 'cache', 'ohlcv');
    let files = [];
    try { files = fs.readdirSync(cacheDir); } catch { files = []; }
    add('ohlc_coverage', {
      ok: files.length > 0,
      name: 'OHLC cache coverage',
      status: files.length > 0 ? 'ok' : 'warn',
      detail: { dir: cacheDir, filesCount: files.length },
      hint: 'If WARN, run a backtest or prefetch to populate OHLC cache.'
    });
  } catch (e) {
    add('ohlc_coverage', {
      ok: false,
      name: 'OHLC cache coverage',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check filesystem for backend/cache/ohlcv and permissions.'
    });
  }

  // Optimizer binary / script presence
  try {
    const stratDir = path.resolve(root, 'backend', 'strategy');
    const opt = path.join(stratDir, 'optimizer.cjs');
    add('optimizer_binary', {
      ok: fileExists(opt),
      name: 'Optimizer engine',
      status: fileExists(opt) ? 'ok' : 'warn',
      detail: { path: opt },
      hint: 'If WARN, ensure backend/strategy/optimizer.cjs exists in the container/image.'
    });
  } catch (e) {
    add('optimizer_binary', {
      ok: false,
      name: 'Optimizer engine',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check build/deploy for optimizer.cjs.'
    });
  }

  // Last job JSON
  try {
    const jobsPath = path.resolve(root, 'backend', 'strategy', 'output', 'jobs.json');
    const stat = safeStat(jobsPath);
    const ok = !!(stat && stat.size > 0);
    add('last_job_json', {
      ok,
      name: 'Last jobs.json',
      status: ok ? 'ok' : 'warn',
      detail: stat ? { path: jobsPath, sizeBytes: stat.size, mtime: stat.mtime.toISOString() } : { path: jobsPath, missing: true },
      hint: 'If WARN, no backtest jobs have been persisted yet. Run an optimizer/backtest job.'
    });
  } catch (e) {
    add('last_job_json', {
      ok: false,
      name: 'Last jobs.json',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check write permissions to backend/strategy/output/jobs.json.'
    });
  }

  // Puppeteer capture: existence check only (detailed run is heavy)
  try {
    const scriptsDir = path.resolve(root, 'scripts');
    const capture = path.join(scriptsDir, 'capture_dashboard.cjs');
    add('puppeteer_capture', {
      ok: fileExists(capture),
      name: 'Dashboard capture script',
      status: fileExists(capture) ? 'ok' : 'warn',
      detail: { path: capture },
      hint: 'If WARN, screenshot script is missing; copy scripts/capture_dashboard.cjs into image.'
    });
  } catch (e) {
    add('puppeteer_capture', {
      ok: false,
      name: 'Dashboard capture script',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check scripts/ directory for capture tool.'
    });
  }

  // Upstox auth: reuse auth/tokens.json
  try {
    const tokensPath = path.resolve(server.__dirname || path.resolve(__dirname, '..'), 'auth', 'tokens.json');
    let t = null;
    try { t = readJsonSafe(tokensPath); } catch {_}{ }
    const hasAccess = !!(t && t.access_token);
    const hasRefresh = !!(t && t.refresh_token);
    add('upstox_auth', {
      ok: hasAccess,
      name: 'Upstox auth tokens',
      status: hasAccess ? 'ok' : (hasRefresh ? 'warn' : 'warn'),
      detail: { hasAccess, hasRefresh },
      hint: 'If WARN, re-run Upstox login flow via dashboard; tokens.json may be empty or expired.'
    });
  } catch (e) {
    add('upstox_auth', {
      ok: false,
      name: 'Upstox auth tokens',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check auth/tokens.json read permissions inside container.'
    });
  }

  // Frontend reachable: quick GET to /health via backend port (assumes reverse proxy / dev setup)
  try {
    const base = process.env.CTS_FRONTEND_BASE || `http://127.0.0.1:${port}`;
    const url = `${base}/health`;
    checks.__pending_frontend = { url }; // debug only
    httpGetJson(url).then((res) => {
      // This async result isn't wired back into the immediate response to avoid hanging health; caller can run separately if needed.
    });
    add('frontend_reachable', {
      ok: true,
      name: 'Frontend reachability',
      status: 'warn',
      detail: { note: 'Passive check only; run dedicated frontend health if needed.' },
      hint: 'For a real check, call the dashboard /health or load the UI in a browser.'
    });
  } catch (e) {
    add('frontend_reachable', {
      ok: false,
      name: 'Frontend reachability',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Adjust CTS_FRONTEND_BASE or check network between backend and dashboard.'
    });
  }

  // Replay running: shadowWorker presence only (no process table in container)
  try {
    const workerPath = path.resolve(root, 'backend', 'shadowWorker.cjs');
    add('replay_running', {
      ok: fileExists(workerPath),
      name: 'Replay/Shadow worker',
      status: fileExists(workerPath) ? 'ok' : 'warn',
      detail: { path: workerPath },
      hint: 'If WARN, shadowWorker.cjs is missing; some replay/alerts features may be disabled.'
    });
  } catch (e) {
    add('replay_running', {
      ok: false,
      name: 'Replay/Shadow worker',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Include backend/shadowWorker.cjs in build or relax this check.'
    });
  }

  return { ok: Object.values(checks).every(c => c && c.ok), timestamp: nowIso, checks };
}

function registerHealthRoute(app, opts) {
  const port = opts && opts.port || 3001;
  const startedAt = opts && opts.startedAt || new Date().toISOString();
  const version = opts && opts.version || '0.0.0';
  // Lightweight wrapper so the main server just delegates.
  app.get('/api/health', (req, res) => {
    try {
      const out = buildChecks({ server: { __dirname: __dirname }, port, startedAt, version });
      res.json(out);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  });
}

module.exports = {
  buildChecks,
  registerHealthRoute,
};
