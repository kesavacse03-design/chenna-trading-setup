#!/usr/bin/env node
// Batch E2E runner: runs multiple mock backtests with varied payloads and validates outputs
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const host = 'localhost';
const apiPort = 3001;
const backendJobsDir = path.resolve(__dirname, '..', '..', 'backend', 'jobs');
const backendCsvDir = path.resolve(__dirname, '..', '..', 'backend', 'strategy', 'output');
const resultsDir = path.resolve(__dirname, 'results');
try { fs.mkdirSync(resultsDir, { recursive: true }); } catch(_){}

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
function isPortOpen(port) {
  return new Promise(resolve => {
    const net = require('net');
    const s = net.createConnection({ port, host }, () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
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

function validateJobJson(jobPath) {
  try {
    const vmod = require(path.resolve(__dirname, '..', '..', 'backend', 'schema', 'validateBacktestResult.cjs'));
    const job = JSON.parse(fs.readFileSync(jobPath,'utf8'));
    const { valid, errors } = vmod.validate(job);
    return { valid, errors };
  } catch (e) { return { valid: false, errors: [{ message: 'validator error: '+String(e) }] }; }
}

async function runPayload(payload, idx) {
  const timestamp = Date.now();
  const runId = `batch-${idx}-${timestamp}`;
  payload.runId = runId; payload.mode = 'mock';
  if (!payload.dateRange) payload.dateRange = { from: '2025-01-01', to: '2025-10-01' };
  // ensure API-required top-level from/to are present
  payload.from = payload.from || payload.dateRange && payload.dateRange.from;
  payload.to = payload.to || payload.dateRange && payload.dateRange.to;

  // start backend if needed
  let serverStarted = false;
  if (!(await isPortOpen(apiPort))) {
    console.log(`[batch] starting backend server`);
    const serverPath = path.resolve(__dirname, '..', '..', 'chenna-CTS', 'backend', 'server.cjs');
    const serverProc = spawn(process.execPath, [serverPath], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
    serverProc.unref();
    // wait
    const healthyStart = Date.now();
    while (!(await isPortOpen(apiPort)) && Date.now() - healthyStart < 60000) { await new Promise(r=>setTimeout(r,500)); }
    if (!(await isPortOpen(apiPort))) { throw new Error('backend did not start'); }
    serverStarted = true;
  }

  // trigger run
  const startRes = await httpPost('/api/backtest/start', payload).catch(e=>null);
  if (!startRes || startRes.status !== 200 || !startRes.body || !startRes.body.jobId) throw new Error('start API failed '+JSON.stringify(startRes));
  const jobId = startRes.body.jobId;
  console.log(`[batch] started job ${jobId}`);

  const status = await waitForStatus(jobId, 180000);
  if (!status) throw new Error('job did not complete '+jobId);
  const actualRunId = status.runId || status.runid || jobId;
  const runToUse = actualRunId;

  // wait a short bit for files to flush
  await new Promise(r=>setTimeout(r,500));

  const jobJsonPath = path.join(backendJobsDir, `job_${runToUse}.json`);
  const csvCandidates = [ path.join(backendCsvDir, `${runToUse}-trades.csv`), path.join(backendCsvDir, `run-${runToUse}-trades.csv`) ];
  const csvPath = csvCandidates.find(p=>fs.existsSync(p));

  const val = fs.existsSync(jobJsonPath) ? validateJobJson(jobJsonPath) : { valid:false, errors:[{message:'job json missing'}] };

  let csvRows = null;
  if (csvPath && fs.existsSync(csvPath)) {
    const csv = fs.readFileSync(csvPath,'utf8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    csvRows = Math.max(0, lines.length - 1); // subtract header
  }

  // read job to extract summary.totalTrades and perSymbol counts
  let totalTrades = null;
  let totalPnL = null;
  let jobKeys = [];
  let firstTradeSample = null;
  if (fs.existsSync(jobJsonPath)) {
    const job = JSON.parse(fs.readFileSync(jobJsonPath,'utf8'));
    jobKeys = Object.keys(job);
    totalPnL = (job.summary && (job.summary.netPnl || job.summary.totalPnL || job.summary.netPnl===0)) ? (job.summary.netPnl || job.summary.totalPnL) : null;
    // count trades
    totalTrades = 0;
    for(const k of Object.keys(job.perSymbol||{})){
      const arr = job.perSymbol[k].trades || [];
      totalTrades += arr.length;
      if (!firstTradeSample && arr.length>0) firstTradeSample = arr[0];
    }
  }

  // save screenshot already created by runner? we'll render minimal UI like run-e2e
  const browser = await chromium.launch(); const ctx = await browser.newContext(); const page = await ctx.newPage();
  const html = ` <html><body><div id="agg">Loading</div><div id="per"></div><script> (async()=>{ const jr0 = await fetch('http://${host}:${apiPort}/api/backtest/result/${encodeURIComponent(runToUse)}').then(r=>r.json()).catch(()=>null); const jobObj = jr0?.result || jr0 || null; const m = jobObj?.summary||jobObj?.metrics||{}; document.getElementById('agg').innerText='win rate '+((m.winRate*100||0).toFixed(1))+'% totalPnL:'+ (m.netPnl||m.totalPnL||0); const ps = jobObj?.perSymbol||{}; const per=document.getElementById('per'); for(const k of Object.keys(ps||{})){ const item=ps[k]; const net = (item.metrics && (item.metrics.netPnl || item.metrics.netPnl===0)? item.metrics.netPnl : (item.netPnl|| '-')); const d=document.createElement('div'); d.className='sym'; d.innerText=k+' '+net; per.appendChild(d);} })();</script></body></html>`;
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#agg', { timeout: 60000 }).catch(()=>{});
  const screenshotPath = path.join(resultsDir, `${runToUse}.png`);
  await page.screenshot({ path: screenshotPath, fullPage:false }).catch(()=>{});
  await browser.close();

  return { runId: runToUse, jobJsonPath, csvPath: csvPath||null, validated: val, csvRows, totalTrades, totalPnL, jobKeys, screenshot: fs.existsSync(screenshotPath)?screenshotPath:null };
}

(async ()=>{
  const payloads = [
    { symbols: ["MOCKD"] },
    { symbols: ["MOCKD","TITAN","DMART"] },
    { symbols: ["MOCKD","TITAN","DMART","RELIANCE","TCS"] },
    { symbols: ["MOCKD"], dateRange: { from: '2025-01-01', to: '2025-10-01', gapTest: true } },
    { symbols: ["MOCKD"], strategyParams: { avoidEntries: true } },
  ];

  const reports = [];
  for(let i=0;i<payloads.length;i++){
    try{
      const res = await runPayload(payloads[i], i+1);
      const valid = res.validated && res.validated.valid;
      const tradeCountOk = (res.csvRows === null) ? 'csv-missing' : (res.csvRows === res.totalTrades ? `rows=${res.csvRows}` : `rows=${res.csvRows}(expected ${res.totalTrades})`);
      const line = `RUN${i+1} ${res.runId}: ${valid? 'PASS' : 'FAIL'} — job JSON ${valid?'valid':'invalid'}, ${tradeCountOk}, summary.totalPnL:${res.totalPnL}`;
      console.log(line);
      reports.push({ idx:i+1, ok:valid, line, details: res });
    }catch(e){ console.log(`RUN${i+1}: ERROR — ${String(e)}`); reports.push({ idx:i+1, ok:false, line:`ERROR ${String(e)}`, details:null }); }
  }

  // print failing details
  const fails = reports.filter(r=>!r.ok);
  if (fails.length===0) {
    console.log('\nBATCH PASS — no intermittent legacy writes detected');
  } else {
    console.log('\nBATCH HAS FAILURES');
    for(const f of fails) {
      if (f.details && f.details.validated && f.details.validated.errors) console.log(`FAIL RUN${f.idx} ${f.details.jobJsonPath} errors:`, f.details.validated.errors);
    }
  }

  // save short report
  const out = reports.map(r=>r.line).join('\n') + '\n';
  fs.writeFileSync(path.join(resultsDir,'batch-report.txt'), out, 'utf8');
  process.exit(0);
})().catch(e=>{ console.error('batch runner error', e); process.exit(2); });
