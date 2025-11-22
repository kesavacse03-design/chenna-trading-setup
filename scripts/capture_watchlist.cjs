#!/usr/bin/env node
// Capture watchlist evidence: network /api/stocks, console snapshot, screenshot
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const outDir = path.resolve(process.cwd(), 'tmp');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const networkEvents = [];
  page.on('requestfinished', async (req) => {
    try {
      const url = req.url();
      if (/\/api\/stocks$/.test(url)) {
        const res = await req.response();
        const body = await res.text();
        networkEvents.push({ type: 'stocksGET', url, status: res.status(), body });
      }
      if (/\/api\/stocks$/.test(url) && req.method() === 'POST') {
        const res = await req.response();
        const body = await res.text();
        networkEvents.push({ type: 'stocksPOST', url, status: res.status(), body });
      }
    } catch(_){}
  });
  page.on('console', msg => {
    try {
      const txt = msg.text();
      if (txt.startsWith('WATCHLIST_SNAPSHOT')) {
        networkEvents.push({ type: 'snapshotLog', raw: txt });
      }
    } catch(_){}
  });

  // Use explicit IPv4 host to avoid localhost resolution issues on this environment
  const targetUrl = 'http://127.0.0.1:5173';
  console.log('NAVIGATE', targetUrl);
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    networkEvents.push({ type:'navigationError', message: String(e && e.message || e) });
  }
  // Allow app hydration & AnalysisHub.load
  await new Promise(r=>setTimeout(r,2500));
  // Force an explicit fetch to guarantee network capture even if initial request happened before handlers
  try {
    const forced = await page.evaluate(async () => {
      try {
        const resp = await fetch('/api/stocks');
        const text = await resp.text();
        return { ok:true, status: resp.status, body: text };
      } catch (e) { return { ok:false, error: String(e) }; }
    });
    networkEvents.push({ type: 'forcedFetch', ...forced });
  } catch(_){ networkEvents.push({ type:'forcedFetch', ok:false, error:'evaluate failed' }); }
  // Snapshot current rows length if store exposed
  try {
    const rowsMeta = await page.evaluate(() => {
      const store = (window).useWatchlistStore ? (window).useWatchlistStore.getState() : null;
      return store ? { rowsCount: Array.isArray(store.rows)?store.rows.length: 'na' } : { rowsCount:'store-not-found' };
    });
    networkEvents.push({ type:'rowsSnapshot', ...rowsMeta });
  } catch(_){ networkEvents.push({ type:'rowsSnapshot', rowsCount:'eval-error' }); }
  // Trigger manual import modal open/close to ensure code path loaded (optional)
  // Capture screenshot
  const shotPath = path.join(outDir, 'watchlist.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  const b64 = fs.readFileSync(shotPath).toString('base64');
  fs.writeFileSync(path.join(outDir, 'watchlist_network.json'), JSON.stringify(networkEvents, null, 2));
  fs.writeFileSync(path.join(outDir, 'watchlist_screenshot.b64.txt'), b64);
  console.log(JSON.stringify({ ok: true, screenshot: b64.slice(0,120) + '...', events: networkEvents }, null, 2));
  await browser.close();
})();
