const path = require('path');
const fs = require('fs');
const { safeStat, fileExists, readJsonSafe, httpGetJson } = require('./health-check-util.cjs');

function buildChecks({ server, port, startedAt, version }) {
  const nowIso = new Date().toISOString();
  const checks = {};

  function add(id, payload) {
    const ok = !!payload.ok;
    const entry = {
      id,
      name: payload.name || id,
      ok,
      status: payload.status || (ok ? 'ok' : 'error'),
      detail: payload.detail || null,
      hint: payload.hint || '',
    };
    if (typeof payload.timingMs === 'number') {
      entry.detail = Object.assign({}, entry.detail || {}, { timingMs: payload.timingMs });
    }
    checks[id] = entry;
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

  const root = path.resolve(__dirname, '..', '..');

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

  // stocks_endpoint: HTTP probe of /api/stocks for basic stats
  try {
    const t0 = Date.now();
    const base = process.env.CTS_API_BASE || process.env.BACKEND_BASE || `http://127.0.0.1:${port}`;
    const url = `${base.replace(/\/$/, '')}/api/stocks`;
    add('stocks_endpoint', {
      ok: false,
      name: 'Marketdata/Stocks endpoint',
      status: 'warn',
      detail: { url, note: 'probe not yet executed' },
      hint: 'Health route is built before HTTP probe; check again after one request.',
    });
    httpGetJson(url, 3500).then((res) => {
      const dt = Date.now() - t0;
      const okResp = !!(res && res.ok && Array.isArray(res.json));
      const count = okResp ? res.json.length : 0;
      add('stocks_endpoint', {
        ok: okResp && count > 0,
        name: 'Marketdata/Stocks endpoint',
        status: okResp && count > 0 ? 'ok' : 'warn',
        detail: {
          url,
          statusCode: res && res.statusCode,
          count,
          sample: okResp && count > 0 ? res.json.slice(0, 3) : null,
        },
        hint: okResp
          ? 'Stocks endpoint responded. If count is 0, check CTS stocks sync.'
          : `Stocks endpoint unreachable: ${res && res.error ? res.error : 'HTTP error'}`,
        timingMs: dt,
      });
    }).catch(() => { /* silent, initial placeholder remains */ });
  } catch (e) {
    add('stocks_endpoint', {
      ok: false,
      name: 'Marketdata/Stocks endpoint',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check marketdata server and /api/stocks route.',
    });
  }

  // OHLC coverage: use assigned_examples.json when present and check per-symbol cache
  try {
    const stratDir = path.resolve(root, 'backend', 'strategy');
    const examplesPath = path.join(stratDir, 'assigned_examples.json');
    const examples = readJsonSafe(examplesPath) || {};
    const symbols = Array.isArray(examples.symbols)
      ? examples.symbols
      : (examples && typeof examples === 'object'
        ? Object.keys(examples)
        : []);
    const cacheBase = path.join(stratDir, 'cache');
    const perSymbol = {};
    let withCache = 0;
    let missing = 0;
    for (const sym of symbols) {
      const pattern = new RegExp(`^${sym}_.*\\.json$`);
      let files = [];
      try { files = fs.readdirSync(cacheBase).filter(f => pattern.test(f)); } catch { files = []; }
      const ok = files.length > 0;
      if (ok) withCache++; else missing++;
      perSymbol[sym] = { cachedFiles: files, ok };
    }
    const okOverall = symbols.length === 0 ? false : missing === 0;
    add('ohlc_coverage', {
      ok: okOverall,
      name: 'OHLC cache coverage',
      status: okOverall ? 'ok' : 'warn',
      detail: {
        examplesPath,
        cacheDir: cacheBase,
        symbolsTotal: symbols.length,
        withCache,
        missing,
        perSymbol: symbols.slice(0, 12).reduce((acc, s) => { acc[s] = perSymbol[s]; return acc; }, {}),
      },
      hint: symbols.length
        ? 'If some symbols are missing cache, run a backtest/prefetch for those symbols.'
        : 'No assigned_examples.json found; run a job that seeds example symbols.',
    });
  } catch (e) {
    add('ohlc_coverage', {
      ok: false,
      name: 'OHLC cache coverage',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check strategy/cache directory and assigned_examples.json.',
    });
  }

  // Optimizer binary / script presence: search a few common locations
  try {
    const stratDir = path.resolve(root, 'backend', 'strategy');
    const candidates = [
      path.join(stratDir, 'optimizer.cjs'),
      path.join(stratDir, 'optimizer.js'),
      path.join(stratDir, 'optimizerRunner.cjs'),
    ];
    const found = candidates.filter(fileExists);
    add('optimizer_binary', {
      ok: found.length > 0,
      name: 'Optimizer engine',
      status: found.length > 0 ? 'ok' : 'warn',
      detail: { candidates, found },
      hint: 'If WARN, ensure one of optimizer.cjs/optimizerRunner.cjs is present in backend/strategy.',
    });
  } catch (e) {
    add('optimizer_binary', {
      ok: false,
      name: 'Optimizer engine',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check build/deploy for optimizer binaries.',
    });
  }

  // Last job JSON: validate structure of jobs.json
  try {
    const jobsPath = path.resolve(root, 'backend', 'strategy', 'output', 'jobs.json');
    const stat = safeStat(jobsPath);
    const hasFile = !!(stat && stat.size > 0);
    let parsed = null;
    let structureOk = false;
    let jobCount = 0;
    if (hasFile) {
      try {
        parsed = readJsonSafe(jobsPath) || {};
        const entries = Array.isArray(parsed.jobs) ? parsed.jobs : [];
        jobCount = entries.length;
        structureOk = entries.every(j => j && j.id && j.status && typeof j === 'object');
      } catch (_) {
        parsed = null;
      }
    }
    const okOverall = hasFile && structureOk && jobCount > 0;
    add('last_job_json', {
      ok: okOverall,
      name: 'Last jobs.json',
      status: okOverall ? 'ok' : (hasFile ? 'warn' : 'warn'),
      detail: stat
        ? { path: jobsPath, sizeBytes: stat.size, mtime: stat.mtime.toISOString(), jobCount, structureOk }
        : { path: jobsPath, missing: true },
      hint: okOverall
        ? 'jobs.json looks healthy.'
        : hasFile
          ? 'jobs.json exists but structure is unexpected; check writer or run a fresh job.'
          : 'No jobs.json yet; run an optimizer/backtest job.',
    });
  } catch (e) {
    add('last_job_json', {
      ok: false,
      name: 'Last jobs.json',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check write permissions to backend/strategy/output/jobs.json.',
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

  // Upstox auth: call /auth/upstox/status when possible
  try {
    const t0 = Date.now();
    const base = process.env.CTS_API_BASE || process.env.BACKEND_BASE || `http://127.0.0.1:${port}`;
    const url = `${base.replace(/\/$/, '')}/auth/upstox/status`;
    httpGetJson(url, 3000).then((res) => {
      const dt = Date.now() - t0;
      const body = res && (res.json || {});
      const active = !!(body && (body.ok || body.active));
      add('upstox_auth', {
        ok: active,
        name: 'Upstox auth status',
        status: active ? 'ok' : 'warn',
        detail: {
          url,
          statusCode: res && res.statusCode,
          body,
        },
        hint: active
          ? 'Upstox auth looks good.'
          : 'Upstox auth not active; re-run the login flow from dashboard.',
        timingMs: dt,
      });
    }).catch((err) => {
      add('upstox_auth', {
        ok: false,
        name: 'Upstox auth status',
        status: 'error',
        detail: { url, error: String(err && err.message || err) },
        hint: 'Upstox status endpoint unreachable from backend.',
      });
    });
  } catch (e) {
    add('upstox_auth', {
      ok: false,
      name: 'Upstox auth status',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Check auth routes wiring and CTS_API_BASE/BACKEND_BASE.',
    });
  }

  // Frontend reachable: probe configured frontend base (dev or prod)
  try {
    const base = process.env.CTS_FRONTEND_BASE || 'http://127.0.0.1:5173';
    const url = `${base.replace(/\/$/, '')}/health`;
    const t0 = Date.now();
    httpGetJson(url, 2000).then((res) => {
      const dt = Date.now() - t0;
      const okResp = !!(res && res.ok && (res.statusCode === 200));
      add('frontend_reachable', {
        ok: okResp,
        name: 'Frontend reachability',
        status: okResp ? 'ok' : 'warn',
        detail: {
          url,
          statusCode: res && res.statusCode,
          body: res && res.body ? String(res.body).slice(0, 160) : null,
        },
        hint: okResp
          ? 'Dashboard responded to /health.'
          : 'Dashboard /health not reachable; ensure Vite or frontend server is running.',
        timingMs: dt,
      });
    }).catch((err) => {
      add('frontend_reachable', {
        ok: false,
        name: 'Frontend reachability',
        status: 'error',
        detail: { url, error: String(err && err.message || err) },
        hint: 'Dashboard /health probe failed from backend.',
      });
    });
  } catch (e) {
    add('frontend_reachable', {
      ok: false,
      name: 'Frontend reachability',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Adjust CTS_FRONTEND_BASE or network between backend and dashboard.',
    });
  }

  // Replay running: look for recent shadowWorker logs in backend/logs
  try {
    const logsDir = path.resolve(root, 'backend', 'logs');
    let files = [];
    try { files = fs.readdirSync(logsDir).filter(f => /shadowWorker/i.test(f)); } catch { files = []; }
    let latest = null;
    if (files.length) {
      for (const f of files) {
        const st = safeStat(path.join(logsDir, f));
        if (st && (!latest || st.mtime > latest.mtime)) {
          latest = { file: f, mtime: st.mtime, size: st.size };
        }
      }
    }
    const now = Date.now();
    const isRecent = !!(latest && (now - latest.mtime.getTime() < 5 * 60 * 1000));
    add('replay_running', {
      ok: isRecent,
      name: 'Replay/Shadow worker',
      status: isRecent ? 'ok' : 'warn',
      detail: {
        logsDir,
        latest,
      },
      hint: isRecent
        ? 'Shadow/replay worker appears active (recent log writes).'
        : 'No recent shadowWorker logs; worker may be idle or stopped.',
    });
  } catch (e) {
    add('replay_running', {
      ok: false,
      name: 'Replay/Shadow worker',
      status: 'error',
      detail: { error: String(e && e.message || e) },
      hint: 'Include backend/shadowWorker.cjs and ensure it writes logs.',
    });
  }

  return { ok: Object.values(checks).every(c => c && c.ok), timestamp: nowIso, checks };
}

function registerHealthRoute(app, opts) {
  const port = opts && opts.port || 3001;
  const startedAt = opts && opts.startedAt || new Date().toISOString();
  const version = opts && opts.version || '0.0.0';
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
