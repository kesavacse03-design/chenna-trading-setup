#!/usr/bin/env node
const fs = require('fs');
const puppeteer = require('puppeteer');
(async () => {
  const outDir = 'tmp';
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] }).catch(()=>null);
  if(!browser){ console.error('BROWSER_LAUNCH_FAILED'); process.exit(1); }
  const page = await browser.newPage();
  const events = [];
  page.on('console', msg => { if (msg.text().startsWith('WATCHLIST_SNAPSHOT')) events.push({ type:'snapshot', raw: msg.text() }); });
  try {
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  } catch(e){ events.push({ type:'goto_error', error: String(e.message||e) }); }
  // Attempt to read category blocks
  let categories = [];
  try {
    categories = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('h3.text-cyan-400'));
      return blocks.map(h => ({ title: h.textContent||'', countEl: h.parentElement?.querySelector('div.text-slate-300.text-xs.font-medium')?.textContent||'' }));
    });
  } catch(e){ events.push({ type:'eval_error', error: String(e.message||e) }); }
  const shotPath = outDir + '/watchlist_puppeteer.png';
  try { await page.screenshot({ path: shotPath, fullPage: true }); } catch(e){ events.push({ type:'screenshot_error', error: String(e.message||e) }); }
  const b64 = fs.existsSync(shotPath) ? fs.readFileSync(shotPath).toString('base64') : null;
  console.log(JSON.stringify({ ok:true, categories, events, screenshot: b64 ? b64.slice(0,120)+'...' : null }, null, 2));
  await browser.close();
})();