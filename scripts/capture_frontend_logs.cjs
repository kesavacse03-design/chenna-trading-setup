const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const out = { console: [], errors: [] };
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.on('console', msg => {
      try { out.console.push({ type: msg.type(), text: msg.text() }); } catch(e){}
    });
    page.on('pageerror', err => { out.errors.push(String(err && err.message || err)); });
    const url = process.env.CAPTURE_URL || 'http://localhost:5173/';
    console.log('Opening', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(e => { console.error('goto_err', e.message); });
    // wait a bit for app to hydrate and run AnalysisHub.load
    await new Promise(r => setTimeout(r, 6000));
    // capture important localStorage keys and watchlist store snapshot
    try {
      const snapshot = await page.evaluate(() => {
        const keys = ['cts_stocks','cts_watchlist_store','cts_debug','cts_api_base','cts_mode'];
        const out = { localStorage: {}, watchlistRows: null };
        for (const k of keys) out.localStorage[k] = localStorage.getItem(k);
        try { const store = window.__WATCH || null; } catch(_){}
        // attempt to read watchlist store state
        try {
          // attempt to access the module via global useWatchlistStore if available
          const rows = window.useWatchlistStore ? window.useWatchlistStore.getState().rows : null;
          out.watchlistRows = rows ? rows.slice(0,10) : null;
        } catch(_) { out.watchlistRows = null; }
        return out;
      });
      out.localStorageSnapshot = snapshot;
    } catch (e) { out.localStorageSnapshotError = String(e && e.message || e); }
    // dump console
    console.log('--- console messages ---');
    for (const c of out.console) console.log(c.type, c.text);
    if (out.errors.length) { console.log('--- page errors ---'); for (const e of out.errors) console.log(e); }
    await browser.close();
    // persist to tmp
    try { fs.writeFileSync('tmp/frontend_console.json', JSON.stringify(out, null, 2)); } catch(e) {}
    process.exit(0);
  } catch (e) {
    console.error('CAPTURE_FAILED', e && e.message);
    try { fs.writeFileSync('tmp/frontend_console.json', JSON.stringify(out, null, 2)); } catch(_){}
    process.exit(2);
  }
})();
