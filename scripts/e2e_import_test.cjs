const puppeteer = require('puppeteer');
(async()=>{
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  const requests = [];
  page.on('request', r=> requests.push({url:r.url(), method:r.method(), postData: r.postData()}));

  await page.goto('http://127.0.0.1:5173', {waitUntil:'networkidle2', timeout:60000});
  console.log('page loaded');

  // open Manual Import modal (selector may vary)
  const openBtn = await page.$('button[aria-label="Import watchlist"]') || await page.$('button[data-testid="open-import"]') || await page.$('button:has-text("Import")');
  if(openBtn) await openBtn.click();

  // fill import textarea with two rows: one duplicate INFY and one new symbol TEST123
  const csv = 'INFY,2025-10-29\nTEST123,2025-11-13\n';
  // try textarea or input
  const ta = await page.$('textarea[name="importData"]') || await page.$('textarea') || await page.$('input[name="importData"]');
  if(ta){ await ta.focus(); await page.keyboard.type(csv); }

  // click import/submit button
  const submit = await page.$('button[data-testid="import-submit"]') || await page.$('button:has-text("Import")') || await page.$('button:has-text("Upload")');
  if(submit){ await submit.click(); }

  // wait briefly to allow requests
  await page.waitForTimeout(1000);

  // capture last network requests and response statuses by sniffing fetch/XHR
  const logs = await page.evaluate(()=>{
    const net = (window.__networkLog||[]).slice(-40);
    return { net };
  }).catch(()=>({net:requests.slice(-40)}));

  // try to read the internal watchlist store if present
  const store = await page.evaluate(()=>{
    try{ if(window.__CTS && window.__CTS.store){ return JSON.stringify(window.__CTS.store.getState ? window.__CTS.store.getState() : window.__CTS.store, null, 2); } }catch(e){}
    try{ return JSON.stringify(window.localStorage.getItem('cts_watchlist_store')) }catch(e){}
    return null;
  }).catch(()=>null);

  console.log('networkRequests:', requests.slice(-40));
  console.log('storeSnapshot:', store);

  await browser.close();
})();
