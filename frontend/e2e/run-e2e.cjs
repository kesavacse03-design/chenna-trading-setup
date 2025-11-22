#!/usr/bin/env node
// Lightweight Playwright runner script (Node) for local E2E against mock backend
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const host = 'localhost';
const apiPort = 3001;
const frontendUrl = 'http://localhost:5173';

function httpPost(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = { hostname: host, port: apiPort, path: pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
    const req = http.request(opts, res => {
      let bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(bufs).toString('utf8')) }); } catch (e) { resolve({ status: res.statusCode, body: Buffer.concat(bufs).toString('utf8') }); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function httpGetJson(pathname) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: host, port: apiPort, path: pathname, method: 'GET' };
    http.get(opts, res => {
      let bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(bufs).toString('utf8'))); } catch (e) { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

async function waitForStatus(jobId, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const s = await httpGetJson(`/api/backtest/status?jobId=${encodeURIComponent(jobId)}`);
      if (s && s.status && (s.status === 'done' || s.status === 'completed')) return s;
    } catch (_) {}
  }
  return null;
}

function isPortOpen(port) {
  return new Promise(resolve => {
    const net = require('net');
    const s = net.createConnection({ port, host }, () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

async function main() {
  const timestamp = Date.now();
  const runId = `e2e-${timestamp}`;
  // parse args: --strict will make missing insights fatal
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const jobPayload = {
    runId,
    symbols: ["MOCKD","TITAN"],
  from: '2025-01-01',
  to: '2025-10-01',
  dateRange: { from: '2025-01-01', to: '2025-10-01' },
    interval: '1d',
    strategy: 'V1',
    mode: 'mock'
  };

  // Start server if not running
  let serverProc = null;
  const portOpen = await isPortOpen(apiPort);
  if (!portOpen) {
    console.log('[e2e] starting backend server');
    const serverPath = path.resolve(__dirname, '..', '..', 'chenna-CTS', 'backend', 'server.cjs');
    serverProc = spawn(process.execPath, [serverPath], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    serverProc.unref();
    serverProc.stdout && serverProc.stdout.on('data', d => process.stdout.write(`[server] ${d.toString()}`));
    serverProc.stderr && serverProc.stderr.on('data', d => process.stderr.write(`[server] ${d.toString()}`));
    // wait for health
    const healthyStart = Date.now();
    while (!(await isPortOpen(apiPort)) && Date.now() - healthyStart < 60000) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (!(await isPortOpen(apiPort))) {
      console.error('[e2e] backend did not start'); if (serverProc) serverProc.kill(); process.exit(2);
    }
  } else {
    console.log('[e2e] backend already running');
  }

  console.log('[e2e] starting backtest via API');
  const startRes = await httpPost('/api/backtest/start', jobPayload).catch(err => { console.error('[e2e] start failed', err); process.exit(3); });
  if (!startRes || startRes.status !== 200 || !startRes.body || !startRes.body.jobId) { console.error('[e2e] start API failed', startRes && startRes.body); process.exit(4); }
  const jobId = startRes.body.jobId;
  console.log('[e2e] jobId', jobId);

  console.log('[e2e] waiting for job to complete');
  const statusObj = await waitForStatus(jobId, 120000);
  if (!statusObj) { console.error('[e2e] job did not complete in time'); process.exit(5); }
  const actualRunId = statusObj.runId || statusObj.runid || null;
  const runToUse = actualRunId || runId;
  console.log('[e2e] runId detected:', runToUse);

  // Launch Playwright and render a minimal UI that consumes the same API endpoints
  console.log('[e2e] launching browser');
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const html = `
  <html><body>
  <div id="agg">Loading...</div>
  <div id="per"></div>
  <div id="ins"></div>
  <script>
    (async ()=>{
      try{
  const jr0 = await fetch('http://${host}:${apiPort}/api/backtest/result/${encodeURIComponent(runToUse)}').then(r=>r.json()).catch(()=>null);
  const jobObj = jr0?.result || jr0 || null;
  const resObj = jobObj || {};
  const m = (resObj.summary || resObj.metrics || {});
  // winRate in backend may be 0..1 or 0..100; normalize for display
  let winRaw = (typeof m.winRate === 'number') ? m.winRate : (m.winRate || 0);
  const winPct = (winRaw > 1) ? winRaw : (winRaw * 100);
  document.getElementById('agg').innerText = 'win rate ' + (Number.isFinite(winPct) ? winPct.toFixed(1) : '0.0') + '% totalPnL:' + (m.netPnl||m.totalPnL||0);
        const ps = resObj?.perSymbol || {};
        const per = document.getElementById('per');
        for(const k of Object.keys(ps||{})){
          const item = ps[k];
          const net = (item.metrics && (item.metrics.netPnl || item.metrics.netPnl===0) ? item.metrics.netPnl : (item.netPnl || (item.netPnl===0?item.netPnl: '-')));
          const div = document.createElement('div'); div.className='sym'; div.innerText = k + ' ' + net; per.appendChild(div);
          // also show first trade if present
          if (Array.isArray(item.trades) && item.trades.length>0) {
            const t = item.trades[0]; const td = document.createElement('div'); td.className='trade'; td.innerText = JSON.stringify(t); per.appendChild(td);
          }
        }
  const ins = jobObj?.insights || [];
        const insEl = document.getElementById('ins'); if(ins.length===0) insEl.innerText='no insights'; else ins.forEach(i=>{ const d=document.createElement('div'); d.className='ins'; d.innerText=i.suggest||i.failure||JSON.stringify(i); insEl.appendChild(d); });
      }catch(e){document.getElementById('agg').innerText='error';}
    })();
  </script>
  </body></html>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  // Wait for aggregate metrics to be populated
  await page.waitForSelector('#agg', { timeout: 60000 });
  const aggText = await page.$eval('#agg', el => el.textContent || '');
  console.log('[e2e] aggText:', aggText);
  if (!/\d+\.\d+%/.test(aggText) && !/\d+%/.test(aggText)) { console.error('[e2e] aggregate metric percent not found'); await browser.close(); process.exit(6); }

  // Ensure at least one per-symbol entry
  const syms = await page.$$eval('.sym', els => els.map(e=>e.textContent));
  if (!syms || syms.length === 0) { console.error('[e2e] no per-symbol entries found'); await browser.close(); process.exit(7); }
  console.log('[e2e] per-symbol entries:', syms.slice(0,5));

  // Ensure insights exist
  const insights = await page.$$eval('.ins', els => els.map(e=>e.textContent));
  if (!insights || insights.length === 0) {
    console.warn('[e2e] no insights found');
    if (strict) { console.error('[e2e] strict mode: failing due to missing insights'); await browser.close(); process.exit(8); }
  } else {
    console.log('[e2e] insights:', insights.slice(0,5));
  }

  // screenshot
  const resultsDir = path.resolve(__dirname, 'results'); try { fs.mkdirSync(resultsDir, { recursive: true }); } catch(_){}
  const screenshotPath = path.join(resultsDir, `${runToUse}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('[e2e] screenshot saved to', screenshotPath);

  await browser.close();

  // Read persisted job JSON and CSV and print sample
  const jobJsonPath = path.resolve(__dirname, '..', '..', 'backend', 'jobs', `job_${runToUse}.json`);
  const csvPathCandidates = [
    path.resolve(__dirname, '..', '..', 'backend', 'strategy', 'output', `${runToUse}-trades.csv`),
    path.resolve(__dirname, '..', '..', 'backend', 'strategy', 'output', `run-${runToUse}-trades.csv`),
  ];
  let csvPath = csvPathCandidates.find(p => fs.existsSync(p)) || csvPathCandidates[0];

  if (!fs.existsSync(jobJsonPath)) { console.error('[e2e] job JSON not found at', jobJsonPath); } else {
    const jobJson = JSON.parse(fs.readFileSync(jobJsonPath,'utf8'));
    console.log('[e2e] job JSON keys:', Object.keys(jobJson));
    const perSymKey = Object.keys(jobJson.perSymbol || {})[0];
    const firstTrade = jobJson.perSymbol && jobJson.perSymbol[perSymKey] && jobJson.perSymbol[perSymKey].trades && jobJson.perSymbol[perSymKey].trades[0];
    console.log('[e2e] firstTrade:', firstTrade);
  }
  if (fs.existsSync(csvPath)) {
    const csv = fs.readFileSync(csvPath,'utf8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    console.log('[e2e] csv first 10 lines:');
    lines.slice(0,10).forEach(l=>console.log(l));
  } else {
    console.error('[e2e] csv not found; tried:', csvPathCandidates);
  }

  // stop server if we started it
  if (serverProc) {
    try { process.kill(-serverProc.pid); } catch (_) { try { serverProc.kill(); } catch(_){} }
  }

  console.log('[e2e] PASS');
  process.exit(0);
}

main().catch(e => { console.error('[e2e] unhandled error', e); process.exit(99); });
