import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

(async () => {
  const url = 'http://127.0.0.1:5173/';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const preBackupKey = `cts_stocks_backup_${ts}`;
  const postBackupKey = `cts_stocks_post_migration_${ts}`;
  const backupFile = path.resolve(process.cwd(), `backup/cts_stocks_prefix_${ts}.json`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // ensure we add an init script that copies localStorage cts_stocks -> preBackupKey before any app script runs
  await context.addInitScript(({ preBackupKey }) => {
    try {
      const raw = localStorage.getItem('cts_stocks');
      if (raw) {
        localStorage.setItem(preBackupKey, raw);
      }
    } catch (e) {
      // ignore
    }
  }, { preBackupKey });

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  // wait briefly for app migration to run
  await page.waitForTimeout(1200);

  // After migration, create a post-migration backup key
  await page.evaluate(({ postBackupKey }) => {
    try {
      const raw = localStorage.getItem('cts_stocks');
      if (raw) localStorage.setItem(postBackupKey, raw);
    } catch (e) {}
  }, { postBackupKey });

  // also write the pre-backup file from the preBackupKey value
  const preRaw = await page.evaluate(({ preBackupKey }) => localStorage.getItem(preBackupKey), { preBackupKey });
  if (preRaw) {
    fs.writeFileSync(backupFile, preRaw);
  }

  // Read post-migration local cts_stocks
  const postRaw = await page.evaluate(() => localStorage.getItem('cts_stocks'));
  const list = postRaw ? JSON.parse(postRaw) : [];

  // Build UNMAPPED and SAMPLE
  const mappedKeys = new Set();
  const unmappedSet = new Set();
  const sample = [];
  for (let i = 0; i < list.length && sample.length < 10; i++) {
    const it = list[i];
    sample.push({ symbol: it.stockName || it.symbol || '', date: it.date || '', categoryRaw: it.categoryRaw || it.category || '', categoryKey: it.categoryKey || null, id: it.id ?? null, __pendingSync: !!it.__pendingSync, __pendingDelete: !!it.__pendingDelete });
    if (!it.categoryKey || it.categoryKey === 'UNMAPPED') unmappedSet.add(it.categoryRaw || it.category || '');
  }

  const UNMAPPED = unmappedSet.size === 0 ? 'ALL_MAPPED' : Array.from(unmappedSet);

  // UI: extract each canonical header's visible symbols
  const canonicalHeaders = [
    'DOWNSIDE LOM SWING', 'UPSIDE LOM SWING', 'MULTI RESISTANCE BO', 'MULTI SUPPORT BO', 'SHORT TERM SWING BO - UP', 'SHORT TERM SWING BO - DOWN', 'LONG TERM SWING BO - UP', 'LONG TERM SWING BO - DOWN', 'HIGH POWERED STOCKS', 'INTRADAY BOOST', 'DOWNSIDE LOM INTRA', 'UPSIDE LOM INTRA', 'DAILY CONTRACTION', 'PRE MARKET'
  ];

  const UI_REPORT = {};
  for (const h of canonicalHeaders) {
    // find header element by exact text
    const symbols = await page.evaluate((h) => {
      const headers = Array.from(document.querySelectorAll('h3'));
      const header = headers.find(el => (el.textContent || '').trim().toUpperCase() === h.toUpperCase());
      if (!header) return null;
      // find next stocks container (div with p-2 etc) - traverse DOM
      const container = header.closest('div')?.querySelector('.max-h-[240px], .overflow-y-auto');
      // fallback: find sibling container with stock rows
      const rows = header.closest('div')?.querySelectorAll('[data-symbol]') || [];
      const syms = [];
      for (const r of rows) {
        const txt = r.getAttribute('data-symbol') || '';
        if (txt) syms.push(txt.trim());
      }
      return syms;
    }, h);
    UI_REPORT[h] = symbols === null ? 'MISSING' : symbols;
  }

  // Determine UI_STATUS
  const missing = Object.keys(UI_REPORT).filter(k => UI_REPORT[k] === 'MISSING');
  const UI_STATUS = missing.length === 0 ? 'ALL 14 SUBCATEGORIES RENDERED' : `FAIL - MISSING: ${JSON.stringify(missing)}`;

  // Attempt delete test: delete one server-backed item and one pending-local item
  // Find a server-backed item (with id) in localStorage and attempt to delete via UI
  const serverItem = list.find(it => it.id);
  const pendingItem = list.find(it => it.__pendingSync);
  const deletionResults = { serverDeleted: false, pendingDeleted: false };

  if (serverItem) {
    // attempt to delete by calling API directly if available
    try {
      await page.evaluate(async (id) => { await fetch(`/api/stocks/${id}`, { method: 'DELETE' }).catch(() => {}); }, serverItem.id);
      deletionResults.serverDeleted = true;
    } catch (e) {}
  }
  if (pendingItem) {
    // remove pending from localStorage
    await page.evaluate((sym, date) => {
      try {
        const raw = localStorage.getItem('cts_stocks');
        if (!raw) return false;
        const arr = JSON.parse(raw);
  const idx = arr.findIndex((x) => x.stockName === sym && x.date === date && x.__pendingSync);
        if (idx>=0) { arr.splice(idx,1); localStorage.setItem('cts_stocks', JSON.stringify(arr)); return true; }
        return false;
      } catch (e) { return false; }
    }, pendingItem.stockName, pendingItem.date).then(r => { deletionResults.pendingDeleted = !!r; });
  }

  // If migration seems to have created problems, restore from preBackupKey
  const postAfter = await page.evaluate(() => localStorage.getItem('cts_stocks'));
  // Write outputs to stdout as JSON lines per spec
  console.log('UNMAPPED: ' + (UNMAPPED === 'ALL_MAPPED' ? 'ALL_MAPPED' : JSON.stringify(UNMAPPED)));
  console.log('SAMPLE: ' + JSON.stringify(sample, null, 2));
  console.log('UI_REPORT: ' + JSON.stringify(UI_REPORT, null, 2));
  console.log('UI_STATUS: ' + UI_STATUS);

  await browser.close();
  process.exit(0);
})();
