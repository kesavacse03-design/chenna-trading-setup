#!/usr/bin/env node

// Incremental Rollout Script for Live Trading
// Phases: Paper Trade → Canary Live → Full Rollout
// Usage: node scripts/incremental-rollout.cjs

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class IncrementalRollout {
  constructor() {
    this.phases = [
      { name: 'paper-trade', dryRun: true, maxExposure: 0, durationMs: 5 * 60 * 1000, description: 'Dry-run paper trading' },
      { name: 'canary-small', dryRun: false, maxExposure: 5000, durationMs: 10 * 60 * 1000, description: 'Live canary with ₹5K max exposure' },
      { name: 'canary-medium', dryRun: false, maxExposure: 25000, durationMs: 15 * 60 * 1000, description: 'Live canary with ₹25K max exposure' },
      { name: 'full-rollout', dryRun: false, maxExposure: 100000, durationMs: 0, description: 'Full live trading' }
    ];
    this.currentPhase = 0;
    this.runnerProcess = null;
    this.monitorInterval = null;
    this.startTime = Date.now();
    this.alertsTriggered = [];
    this.metricsHistory = [];
  this.port = Number(process.env.ROLLOUT_PORT || '8081');
  }

  log(msg) {
    console.log(`[${new Date().toISOString()}] ROLLOUT: ${msg}`);
  }

  async checkHealth(port) {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      this.log(`Health check error: ${error.message}`);
      return null;
    }
  }

  async checkMetrics(port) {
    try {
      const response = await fetch(`http://localhost:${port}/metrics`);
      if (!response.ok) throw new Error(`Metrics check failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      this.log(`Metrics check error: ${error.message}`);
      return null;
    }
  }

  shouldRollback(metrics) {
    // Rollback conditions
    const drawdown = parseFloat(metrics.live_drawdown_percent || 0);
    const errors = parseInt(metrics.live_errors_total || 0);
    const alerts = metrics.alerts || [];

    if (drawdown > 2.0) { // >2% drawdown
      this.log(`ROLLBACK: High drawdown ${drawdown}%`);
      return true;
    }
    if (errors > 5) { // >5 errors
      this.log(`ROLLBACK: High error count ${errors}`);
      return true;
    }
    if (alerts.length > 0) {
      this.log(`ROLLBACK: Alerts triggered: ${alerts.map(a => a.message).join(', ')}`);
      return true;
    }
    return false;
  }

  async startPhase(phaseIndex) {
    const phase = this.phases[phaseIndex];
    this.log(`Starting phase ${phaseIndex + 1}/${this.phases.length}: ${phase.name} - ${phase.description}`);

    // Set environment for this phase
    const env = {
      ...process.env,
      DRY_RUN: phase.dryRun ? '1' : '0',
      MAX_EXPOSURE: phase.maxExposure.toString(),
      WS_PORT: String(this.port),
      UPSTOX_ENV: 'staging',
      LIVE_HEARTBEAT_MS: '30000', // 30s heartbeats
      CANARY_MODE: phaseIndex < this.phases.length - 1 ? '1' : '0'
    };

    // If something is already running on the target port, try to stop it first
    const preHealth = await this.checkHealth(this.port);
    if (preHealth && preHealth.ok) {
      this.log(`Existing runner detected on port ${this.port}, attempting graceful stop...`);
      try { await fetch(`http://localhost:${this.port}/admin/stop-live`, { method: 'POST' }); } catch (_) {}
      // wait a moment for shutdown
      await new Promise(r => setTimeout(r, 1500));
    }

    // Start live runner with retry on EADDRINUSE (increment port)
    let attempts = 0;
    while (attempts < 3) {
      attempts += 1;
      env.WS_PORT = String(this.port);
      this.log(`Launching Live Runner on port ${this.port} (attempt ${attempts})...`);
      this.runnerProcess = spawn('node', ['backend/strategy/liveRunner.cjs'], {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let addrInUse = false;
      this.runnerProcess.stderr.on('data', (data) => {
        const s = data.toString();
        if (s.includes('EADDRINUSE')) addrInUse = true;
        console.error(`LIVE RUNNER ERROR: ${s.trim()}`);
      });
      this.runnerProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output.includes('[LIVE]')) console.log(output);
      });

      // Wait a bit, then check health
      await new Promise(resolve => setTimeout(resolve, 2500));
      const health = await this.checkHealth(this.port);
      if (health && health.ok && !addrInUse) {
        break; // started fine
      }
      if (addrInUse) {
        this.log(`Port ${this.port} in use. Trying next port...`);
        try { this.runnerProcess.kill('SIGTERM'); } catch (_) {}
        this.port += 1;
        continue;
      }
      // If not healthy and not addr in use, still break and let later check fail
      break;
    }

    // Handle process output
    this.runnerProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('[LIVE]')) {
        console.log(output); // Forward live runner logs
      }
    });

    this.runnerProcess.stderr.on('data', (data) => {
      console.error(`LIVE RUNNER ERROR: ${data.toString().trim()}`);
    });

  // Verify health on selected port
  const health = await this.checkHealth(this.port);
    if (!health || !health.ok) {
      throw new Error(`Phase startup failed: health check failed`);
    }

  this.log(`Phase ${phase.name} started successfully on port ${this.port}. Monitoring for ${phase.durationMs / 1000 / 60} minutes...`);

    return phase;
  }

  async monitorPhase(phase) {
    const endTime = Date.now() + phase.durationMs;
    let lastMetrics = null;

    while (Date.now() < endTime) {
      await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30s

  const metrics = await this.checkMetrics(this.port);
      if (metrics) {
        this.metricsHistory.push({ timestamp: Date.now(), ...metrics });

        // Log key metrics
        this.log(`Metrics: trades=${metrics.live_trades_total} orders=${metrics.live_orders_total} errors=${metrics.live_errors_total} exposure=₹${metrics.live_exposure_current} drawdown=${metrics.live_drawdown_percent}%`);

        // Check for rollback
        if (this.shouldRollback(metrics)) {
          return 'rollback';
        }

        lastMetrics = metrics;
      }
    }

    // Phase completed successfully
    this.log(`Phase ${phase.name} completed successfully`);
    return 'success';
  }

  async stopCurrentPhase() {
    if (this.runnerProcess) {
      this.log('Stopping current phase...');

      // Try graceful stop via API
      try {
  await fetch(`http://localhost:${this.port}/admin/stop-live`, { method: 'POST' });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (_) {}

      // Force kill if needed
      this.runnerProcess.kill('SIGTERM');
      await new Promise(resolve => {
        this.runnerProcess.on('close', resolve);
      });

      this.runnerProcess = null;
    }
  }

  async saveResults() {
    const results = {
      completedPhases: this.currentPhase,
      totalRuntimeMs: Date.now() - this.startTime,
      metricsHistory: this.metricsHistory,
      alertsTriggered: this.alertsTriggered,
      finalStatus: this.currentPhase === this.phases.length ? 'full_rollout' : 'rolled_back'
    };

    const filename = `rollout-results-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    this.log(`Results saved to ${filename}`);
  }

  async run() {
    this.log('🚀 Starting Incremental Rollout Process');

    try {
      for (let i = 0; i < this.phases.length; i++) {
        this.currentPhase = i;
        const phase = await this.startPhase(i);
        const result = await this.monitorPhase(phase);

        if (result === 'rollback') {
          this.log(`❌ Rollback triggered in phase ${phase.name}. Stopping rollout.`);
          await this.stopCurrentPhase();
          break;
        }

        await this.stopCurrentPhase();

        // If this was the last phase, we're done
        if (i === this.phases.length - 1) {
          this.log('✅ Full rollout completed successfully!');
          break;
        }

        // Brief pause between phases
        this.log('⏳ Preparing next phase...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

    } catch (error) {
      this.log(`❌ Rollout failed: ${error.message}`);
    } finally {
      await this.saveResults();
      this.log('🏁 Rollout process completed');
      process.exit(0);
    }
  }
}

// Run the rollout
if (require.main === module) {
  const rollout = new IncrementalRollout();
  rollout.run();
}
