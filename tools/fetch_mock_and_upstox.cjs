const path = require('path');
(async ()=>{
  try {
    const adaptersPath = path.resolve(__dirname, '..', 'backend', 'strategy', 'dataAdapter.cjs');
    const { MockDataAdapter, UpstoxAdapter } = require(adaptersPath);
    const mock = new MockDataAdapter();
    const mockData = await mock.fetch({ symbol: 'MOCK1', from: '2025-10-01', to: '2025-10-01', interval: '5m' });
    console.log('\n=== MOCK1 5m first 5 candles ===');
    console.log(JSON.stringify(mockData.slice(0,5), null, 2));

    const up = new UpstoxAdapter();
    const upData = await up.fetch({ symbol: 'RELIANCE', from: '2025-10-31', to: '2025-10-31', interval: '5m' });
    console.log('\n=== RELIANCE 2025-10-31 5m fetch result ===');
    console.log(JSON.stringify(upData, null, 2));
  } catch (e) {
    console.error('ERROR running adapter tests:', e && e.stack ? e.stack : String(e));
    process.exit(2);
  }
})();
