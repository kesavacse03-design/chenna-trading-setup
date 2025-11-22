#!/usr/bin/env node
// Minimal smoke test for CTS backtest pipeline
const http = require('http');
const fs = require('fs');
const path = require('path');

const host = 'localhost';
const port = 3001;

function postStart(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = { hostname: host, port, path: '/api/backtest/start', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
    const req = http.request(opts, res => {
      let bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => {
        try { const j = JSON.parse(Buffer.concat(bufs).toString('utf8')); resolve({status: res.statusCode, body: j}); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function getStatus(jobId) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: host, port, path: `/api/backtest/status?jobId=${encodeURIComponent(jobId)}`, method: 'GET' };
    http.get(opts, res => {
      let bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(bufs).toString('utf8'))); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function getResult(runId) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: host, port, path: `/api/backtest/result/${encodeURIComponent(runId)}`, method: 'GET' };
    http.get(opts, res => {
      let bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => { try { resolve({status: res.statusCode, body: JSON.parse(Buffer.concat(bufs).toString('utf8'))}); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const timestamp = Date.now();
  const runId = `smoke-${timestamp}`;
  const payload = {
    // include runId requested by test, but the backtester may emit its own runId
    runId,
    symbols: ["MOCKD","TITAN","DMART"],
    // include both top-level from/to (server expects these) and a dateRange object per request
    from: '2025-01-01',
    to: '2025-10-01',
    dateRange: { from: '2025-01-01', to: '2025-10-01' },
    interval: '1d',
    strategy: 'V1',
    mode: 'mock'
  };

  console.log(`[smoke] starting smoke test runId=${runId}`);
  let startRes;
  try { startRes = await postStart(payload); } catch (e) { console.error('[smoke] start request failed', e); process.exit(2); }
  if (!startRes || startRes.status !== 200 || !startRes.body || !startRes.body.jobId) { console.error('[smoke] invalid start response', startRes && startRes.body); process.exit(3); }
  const jobId = startRes.body.jobId;
  console.log(`[smoke] job started jobId=${jobId}`);

  const maxTicks = Math.ceil((2*60)/2); // 2 minutes, polling every 2s
  let tick = 0;
  let statusObj = null;
  while (tick < maxTicks) {
    await new Promise(r => setTimeout(r, 2000));
    tick++;
    try { statusObj = await getStatus(jobId); } catch (e) { console.error('[smoke] status request failed', e); process.exit(4); }
    const s = statusObj && (statusObj.status || statusObj.state || (statusObj.body&&statusObj.body.status));
    console.log(`[smoke] poll ${tick} status=${s}`);
    if (s === 'done' || s === 'completed') break;
  }
  if (!statusObj) { console.error('[smoke] no status received'); process.exit(5); }
  const finalStatus = statusObj.status || statusObj.state || (statusObj.body && statusObj.body.status) || 'unknown';
  if (finalStatus !== 'done' && finalStatus !== 'completed') { console.error('[smoke] timeout waiting for done; lastStatus=', finalStatus); process.exit(6); }

  // derive runId path names (script is in backend/scripts)
  // The backtester generates an actual runId; read it from the job status
  const actualRunId = (statusObj && (statusObj.runId || (statusObj.body&&statusObj.body.runId))) || runId;
  const jobFilePath = path.resolve(__dirname, '..', 'jobs', `job_${actualRunId}.json`);
  // support runId that may already include 'run-' prefix
  const csvPathCandidates = [
    path.resolve(__dirname, '..', 'strategy', 'output', `${actualRunId}-trades.csv`),
    path.resolve(__dirname, '..', 'strategy', 'output', `run-${actualRunId}-trades.csv`),
  ];
  let csvPath = csvPathCandidates.find(p => fs.existsSync(p));
  // if not found yet, prefer the first candidate for later diagnostics
  if (!csvPath) csvPath = csvPathCandidates[0];

  console.log('[smoke] fetching result via API');
  let resultRes;
  try { resultRes = await getResult(actualRunId); } catch (e) { console.error('[smoke] result request failed', e); process.exit(7); }
  if (!resultRes || resultRes.status !== 200 || !resultRes.body) { console.error('[smoke] invalid result response', resultRes && resultRes.body); process.exit(8); }

  const result = resultRes.body.result || resultRes.body;

  // Validation a) job JSON exists and has keys
  if (!fs.existsSync(jobFilePath)) { console.error('[smoke] FAIL: job JSON not found at', jobFilePath); process.exit(11); }
  let jobJson;
  try { jobJson = JSON.parse(fs.readFileSync(jobFilePath, 'utf8')); } catch (e) { console.error('[smoke] FAIL: failed to parse job JSON', e); process.exit(12); }
  const expectedKeys = ['runId','summary','perSymbol','insights','status'];
  const missing = expectedKeys.filter(k => !(k in jobJson));
  if (missing.length) { console.error('[smoke] FAIL: job JSON missing keys', missing); process.exit(13); }

  // Validation b) CSV exists and row count equals total trades in JSON
  if (!fs.existsSync(csvPath)) { console.error('[smoke] FAIL: trades CSV not found at', csvPath); console.error('[smoke] tried candidates:', csvPathCandidates); process.exit(14); }
  const csv = fs.readFileSync(csvPath, 'utf8');
  const csvLines = csv.split(/\r?\n/).filter(Boolean);
  const csvHeader = csvLines[0];
  const csvRowCount = Math.max(0, csvLines.length - 1);
  const totalTrades = Number((jobJson.summary && (jobJson.summary.tradesCount || jobJson.summary.totalTrades)) || 0);
  if (csvRowCount !== totalTrades) { console.error('[smoke] FAIL: CSV rows != totalTrades; csvRows=', csvRowCount, 'summary.trades=', totalTrades); process.exit(15); }

  // Validation c) summary numeric fields
  const s = jobJson.summary || {};
  const mustNumeric = ['totalPnL','winRate','tradesCount'];
  const notNumeric = mustNumeric.filter(k => typeof s[k] !== 'number' || Number.isNaN(s[k]));
  if (notNumeric.length) { console.error('[smoke] FAIL: summary missing numeric fields or not numeric', notNumeric, s); process.exit(16); }

  // PASS — print requested artifacts
  console.log('[smoke] PASS');
  console.log('jobFilePath:', jobFilePath);
  console.log('jobKeys:', Object.keys(jobJson));
  // print first trade object
  const perSymbolKeys = Object.keys(jobJson.perSymbol || {});
  const firstSymbol = perSymbolKeys[0];
  const firstTrades = (jobJson.perSymbol && jobJson.perSymbol[firstSymbol] && jobJson.perSymbol[firstSymbol].trades) || [];
  console.log('firstTrade:', firstTrades[0]);
  console.log('csvFirst10Lines:');
  csvLines.slice(0,10).forEach(l => console.log(l));
  process.exit(0);
}

main().catch(e => { console.error('[smoke] unhandled error', e); process.exit(99); });
