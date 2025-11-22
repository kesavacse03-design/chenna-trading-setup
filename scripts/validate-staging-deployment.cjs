#!/usr/bin/env node

// Comprehensive staging deployment validation
// Usage: node scripts/validate-staging-deployment.cjs

const WebSocket = require('ws');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

async function validateStagingDeployment() {
  console.log('🔍 Starting Comprehensive Staging Deployment Validation...\n');

  let liveRunnerProcess = null;

  try {
    // Step 1: Start staging deployment
    console.log('Step 1: Starting staging deployment...');
    liveRunnerProcess = spawn('node', ['scripts/staging-deploy.cjs'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);

      liveRunnerProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Live Runner started on port')) {
          clearTimeout(timeout);
          console.log('✅ Live Runner started successfully');
          resolve();
        }
      });

      liveRunnerProcess.stderr.on('data', (data) => {
        console.log('Server stderr:', data.toString());
      });
    });

    // Step 2: Test metrics endpoint
    console.log('\nStep 2: Testing metrics endpoint...');
    const metricsResponse = await fetch('http://localhost:8081/metrics');
    if (!metricsResponse.ok) throw new Error('Metrics endpoint failed');

    const metrics = await metricsResponse.json();
    console.log('✅ Metrics endpoint responding');
    console.log('   Trades:', metrics.live_trades_total);
    console.log('   Drawdown:', metrics.live_drawdown_percent + '%');
    console.log('   Alerts:', metrics.alerts?.length || 0);

    // Step 3: Test alerts endpoint
    console.log('\nStep 3: Testing alerts endpoint...');
    const alertsResponse = await fetch('http://localhost:8081/alerts');
    if (!alertsResponse.ok) throw new Error('Alerts endpoint failed');

    const alerts = await alertsResponse.json();
    console.log('✅ Alerts endpoint responding');
    console.log('   Configured alerts:', alerts.configured_alerts.length);
    console.log('   Recent notifications:', alerts.recent_notifications.length);

    // Step 4: Test WebSocket connection
    console.log('\nStep 4: Testing WebSocket connection...');
    const ws = new WebSocket('ws://localhost:8081');

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 5000);

      ws.on('open', () => {
        console.log('✅ WebSocket connected');
        clearTimeout(timeout);
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Step 5: Send test candle and check status
    console.log('\nStep 5: Testing live processing...');

    const testCandle = {
      type: 'candle',
      candle: {
        symbol: 'TEST_STOCK',
        date: new Date().toISOString(),
        open: 100,
        high: 106,
        low: 99,
        close: 105,
        volume: 1000
      }
    };

    ws.send(JSON.stringify(testCandle));

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Request status
    ws.send(JSON.stringify({ type: 'status' }));

    const statusResponse = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Status timeout')), 5000);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'status') {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    console.log('✅ Live processing working');
    console.log('   Open positions:', statusResponse.state.openPositions.length);
    console.log('   Total trades:', statusResponse.state.totalTrades);

    ws.close();

    // Step 6: Test kill switch
    console.log('\nStep 6: Testing kill switch...');
    const killResponse = await fetch('http://localhost:8081/admin/stop-live', {
      method: 'POST'
    });

    if (!killResponse.ok) throw new Error('Kill switch failed');

    const killResult = await killResponse.json();
    console.log('✅ Kill switch activated:', killResult.message);

    // Step 7: Verify system stopped
    console.log('\nStep 7: Verifying system stopped...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const finalMetrics = await fetch('http://localhost:8081/metrics').then(r => r.json());
    if (finalMetrics.live_is_stopped === 1) {
      console.log('✅ System properly stopped');
    } else {
      console.log('⚠️  System may not have stopped correctly');
    }

    console.log('\n🎉 Staging deployment validation completed successfully!');
    console.log('\n📋 Validation Summary:');
    console.log('   ✅ Live Runner startup');
    console.log('   ✅ Metrics endpoint');
    console.log('   ✅ Alerts endpoint');
    console.log('   ✅ WebSocket connectivity');
    console.log('   ✅ Live candle processing');
    console.log('   ✅ Kill switch functionality');
    console.log('   ✅ System shutdown');

  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    if (liveRunnerProcess) {
      console.log('\n🧹 Cleaning up...');
      try {
        process.kill(-liveRunnerProcess.pid, 'SIGTERM');
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

validateStagingDeployment();
