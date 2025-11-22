const path = require('path');
const fs = require('fs');
const { MockDataAdapter } = require(path.resolve(__dirname, '..', 'backend', 'strategy', 'dataAdapter.cjs'));
(async ()=>{
  const mock = new MockDataAdapter();
  const data = await mock.fetch({ symbol: 'MOCK1', from: '2025-10-01', to: '2025-10-01', interval: '5m' });
  const out = { savedAt: new Date().toISOString(), ohlcv: data };
  const p = path.resolve(__dirname, '..', 'backend', 'strategy', 'cache', 'MOCK1_2025-10-01_2025-10-01_5m.json');
  fs.writeFileSync(p, JSON.stringify(out, null, 2));
  console.log('WROTE', p, 'rows=', data.length);
})();
