// Intraday Monitor Service
// Runs V2.1 Strategy loop and holds state for UI

const { generateIntradaySignalsV21 } = require('./labs/intradayStrategyV2_1.cjs');
const prisma = require('../lib/prisma.cjs');

class IntradayMonitorService {
    constructor() {
        this.isRunning = false;
        this.lastStats = null;
        this.lastScanTime = null;
        this.intervalId = null;
        this.config = {
            category: 'HIGH_POWERED_STOCKS', // Changed from INTRADAY_BOOST (which might be empty)
            intervalMinutes: 1
        };
    }

    start() {
        if (this.isRunning) return;
        console.log('[IntradayMonitor] Starting service...');
        this.isRunning = true;

        // Run immediately
        this.runScan();

        // Schedule loop
        this.intervalId = setInterval(() => {
            this.runScan();
        }, this.config.intervalMinutes * 60 * 1000);
    }

    stop() {
        console.log('[IntradayMonitor] Stopping service...');
        this.isRunning = false;
        if (this.intervalId) clearInterval(this.intervalId);
    }

    async runScan() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const { signals, stats } = await generateIntradaySignalsV21(this.config.category, today);

            this.updateStats(stats); // Use the new method

            // Note: generateIntradaySignalsV21 only returns signals, it doesn't SAVE them to DB (yet).
            // The LiveTracker usually saves them.
            // For now, we just want to MONITOR stats. 
            // If we want to auto-trade, we should save to Trade table here.

            // For Verification Phase, we just hold stats.

        } catch (error) {
            console.error('[IntradayMonitor] Scan failed:', error.message);
        }
    }

    /**
     * Update stats from external scanner (ScheduledScanner)
     */
    updateStats(stats) {
        this.lastStats = stats;
        this.lastScanTime = new Date();
        // console.log(`[IntradayMonitor] Stats updated: ${stats.totalStocks} scanned`);
    }

    getStatus() {
        // console.log('[Monitor] Status requested:', this.lastStats ? `Stats present (${this.lastStats.totalStocks} stocks)` : 'No stats yet');
        return {
            isRunning: this.isRunning,
            lastScanTime: this.lastScanTime,
            stats: this.lastStats || {
                volumePass: 0,
                orDetected: 0,
                nPatternFound: 0,
                finalSignals: 0
            }
        };
    }
}

// Singleton
const service = new IntradayMonitorService();
module.exports = service;
