const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => logs.push({ type: 'pageerror', text: err.message }));
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  // Try to open Strategy Workbench: assume there's a button with aria-label or a nav control
  // We'll click the first "V1 Workbench" button if present
  try {
    await page.click('text=V1 Workbench', { timeout: 3000 });
  } catch (e) {
    // fallback: open the first strategy edit button
    await page.click('button:has-text("Workbench")', { timeout: 3000 }).catch(()=>{});
  }
  // Wait for modal to appear
  await page.waitForSelector('text=Start', { timeout: 5000 });
  // Click Start
  await page.click('button:has-text("Start")');
  // Wait for some logs to appear in the UI
  await page.waitForTimeout(8000);
  // Grab visible live log entries
  const uiLogs = await page.$$eval('div[role="dialog"] div', nodes => nodes.map(n => n.innerText).slice(0,80));
  // Write logs to file
  fs.writeFileSync('playwright_console_logs.json', JSON.stringify({ console: logs, ui: uiLogs }, null, 2));
  await browser.close();
})();
