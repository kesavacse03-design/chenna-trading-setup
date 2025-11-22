const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => logs.push({ type: 'pageerror', text: err.message }));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  // Try to open Strategy Workbench: click V1 Workbench or Workbench button
  try {
    await page.click('text=V1 Workbench', { timeout: 3000 });
  } catch (e) {
    await page.click('button:has-text("Workbench")', { timeout: 3000 }).catch(()=>{});
  }
  await page.waitForSelector('text=Start', { timeout: 5000 });
  await page.click('button:has-text("Start")');
  try {
    await page.waitForTimeout(8000);
    const uiLogs = await page.$$eval('div[role="dialog"] div', nodes => nodes.map(n => n.innerText).slice(0,80));
    fs.writeFileSync('.playwright/playwright_console_logs.json', JSON.stringify({ console: logs, ui: uiLogs }, null, 2));
  } catch (err) {
    fs.writeFileSync('.playwright/playwright_console_logs.json', JSON.stringify({ console: logs, error: String(err) }, null, 2));
  }
  await browser.close();
})();
