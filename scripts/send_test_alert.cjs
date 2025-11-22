const { MarketDataAdapter } = require('../backend/marketdata/index.cjs');
const path = require('path');
(async function(){
  const m = new MarketDataAdapter();
  // write a snapshot now
  const snap = m.health.writeSnapshotNow();
  console.log('SNAPSHOT', snap);
  // send test alert (this will append to alerts.log and attempt external if env enabled)
  m.health.alert('TEST_ALERT health snapshot written ' + snap);
  console.log('ALERT logged');
  // read alerts.log tail
  const alerts = require('fs').readFileSync(path.resolve(__dirname, '..', 'backend', 'jobs', 'alerts.log'),'utf8');
  console.log('ALERTS_TAIL', alerts.split('\n').slice(-6).join('\n'));
})();
