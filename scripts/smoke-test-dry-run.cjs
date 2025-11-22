#!/usr/bin/env node
// CI Smoke Test: Dry-run runner with token rotation and simulated feed
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const WebSocket = require('ws');

async function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function smokeTest() {
  console.log('Starting CI smoke test...');

  // Generate a test encryption key if not set
  if (!process.env.TOKENS_ENCRYPTION_KEY) {
    process.env.TOKENS_ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex').toString('base64');
  }
  if (!process.env.ADMIN_SHARED_SECRET) {
    process.env.ADMIN_SHARED_SECRET = 'test-secret';
  }

  // Start runner in dry-run mode
  const runner = spawn('node', ['backend/strategy/liveRunner.cjs'], {
    stdio: 'inherit',
    env: { ...process.env, DRY_RUN: '1', ALLOW_LIVE: '0', WS_PORT: '8080', CANARY_MODE: '1', SIMULATE_UPSTOX: '1' }
  });

  // Wait for runner to start
  await delay(3000);

  try {
    // Check health endpoint
    const healthRes = await fetch('http://localhost:8080/health');
    if (!healthRes.ok) throw new Error('Health check failed');
    const health = await healthRes.json();
    console.log('Health:', health);

    // Rotate token via admin endpoint (simulate with dummy tokens)
    const rotateRes = await fetch('http://localhost:8080/admin/store-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_SHARED_SECRET },
      body: JSON.stringify({ accessToken: 'test-access', refreshToken: 'test-refresh' })
    });
    if (!rotateRes.ok) {
      const errText = await rotateRes.text();
      throw new Error(`Token rotation failed: ${rotateRes.status} ${errText}`);
    }
    console.log('Token rotated successfully');

    // Simulate feed via WebSocket
    const ws = new WebSocket('ws://localhost:8080');
    ws.on('open', () => {
      console.log('WS connected, sending test candle...');
      const testCandle = {
        symbol: 'NSE_EQ|INE002A01018',
        timestamp: new Date().toISOString(),
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000
      };
      ws.send(JSON.stringify(testCandle));
      setTimeout(() => ws.close(), 1000);
    });
    ws.on('message', (data) => {
      console.log('WS message:', data.toString());
    });
    ws.on('close', () => {
      console.log('WS closed');
    });

    await delay(1000);

    // Directly exercise adapter simulated refresh path
    const { UpstoxOrderAdapter } = require('../backend/strategy/upstoxOrderAdapter.cjs');
    process.env.SIMULATE_UPSTOX = '1';
    const adapter = new UpstoxOrderAdapter();
    const fill = await adapter.submit({ side: 'buy', qty: 1, type: 'market', symbol: 'NSE_EQ|INE002A01018' });
    if (!fill || fill.status !== 'filled') throw new Error('Adapter simulated submit did not fill');
    console.log('Adapter simulated submit OK:', fill.orderId);

    await delay(1000);

    console.log('Smoke test passed!');
  } catch (e) {
    console.error('Smoke test failed:', e.message);
    process.exit(1);
  } finally {
    runner.kill();
  }
}

smokeTest();
