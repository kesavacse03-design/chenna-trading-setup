const WebSocket = require('ws');
const { LiveRunner } = require('../liveRunner.cjs');

// E2E test for live runner in staging with simulated data
async function runE2ETest() {
  console.log('Starting E2E test for Live Runner...');

  // Set dry-run for staging
  process.env.DRY_RUN = '1';
  process.env.CANARY_MODE = '1';

  const runner = new LiveRunner(8081); // Use different port for test
  runner.start((log) => console.log('[LIVE]', log));

  // Wait for server to start
  await new Promise(r => setTimeout(r, 1000));

  // Connect WebSocket and send mock candles
  const ws = new WebSocket('ws://localhost:8081');

  ws.on('open', () => {
    console.log('WebSocket connected, sending mock candles...');

    // Send a series of mock candles to trigger strategy
    const candles = [
      { type: 'candle', candle: { symbol: 'TEST', date: '2025-11-03T10:00:00Z', open: 100, high: 105, low: 95, close: 102, volume: 1000 } },
      { type: 'candle', candle: { symbol: 'TEST', date: '2025-11-03T10:01:00Z', open: 102, high: 108, low: 100, close: 106, volume: 1200 } },
      { type: 'candle', candle: { symbol: 'TEST', date: '2025-11-03T10:02:00Z', open: 106, high: 110, low: 90, close: 92, volume: 1500 } }, // Trigger stop
    ];

    candles.forEach((msg, i) => {
      setTimeout(() => ws.send(JSON.stringify(msg)), i * 500);
    });

    // Request status after
    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'status' }));
    }, 3000);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received:', msg);
    if (msg.type === 'status') {
      // Check metrics
      if (msg.state.totalTrades >= 0) {
        console.log('E2E test passed: Status received, trades:', msg.state.totalTrades);
      } else {
        console.log('E2E test failed: Invalid status');
      }
      ws.close();
      runner.stop();
      process.exit(msg.state.totalTrades >= 0 ? 0 : 1);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    process.exit(1);
  });

  // Timeout
  setTimeout(() => {
    console.error('E2E test timeout');
    runner.stop();
    process.exit(1);
  }, 10000);
}

if (require.main === module) {
  runE2ETest();
}
