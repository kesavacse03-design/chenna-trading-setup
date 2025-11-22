const assert = require('assert');
const path = require('path');
const fs = require('fs');
module.exports = async function run() {
  // Guard: only run when explicitly enabled
  if (String(process.env.RUN_UPSTOX_INTEGRATION || '') !== '1') {
    console.log('SKIP Upstox integration tests (set RUN_UPSTOX_INTEGRATION=1 and UPSTOX_TOKEN)');
    return;
  }
  const token = process.env.UPSTOX_TOKEN;
  if (!token) throw new Error('UPSTOX_TOKEN required for integration tests');
  const { UpstoxAdapter } = require(path.resolve(__dirname, '..', 'dataAdapter.cjs'));
  const up = new UpstoxAdapter();
  // override base to local server which proxies and uses UPSTOX_TOKEN if needed
  up.apiBase = process.env.UPSTOX_API_BASE || 'http://localhost:3001';
  const out = await up.fetch({ symbol: 'RELIANCE', from: '2025-10-30', to: '2025-10-31', interval: '5m' });
  if (out && out.ok === false) throw new Error('Upstox integration fetch failed: ' + JSON.stringify(out));
  assert(Array.isArray(out), 'integration should return array');
  console.log('Integration returned rows:', out.length);
};
