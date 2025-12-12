/**
 * Scheduled Signal Scanner
 * Runs signal scans at scheduled times during market hours
 */

// For production, use node-cron: npm install node-cron
// const cron = require('node-cron');

const signalScanner = require('./signalScanner.cjs');

class ScheduledScanner {
    constructor() {
        this.isRunning = false;
        this.scheduleInfo = {
            preMarket: '09:00',    // Pre-market scan
            marketOpen: '09:15',  // Market open scan
            intraday: 30,         // Minutes between scans
            marketClose: '15:30', // End of day summary
        };
        this.scanHistory = [];
        this.timers = [];
    }

    /**
     * Check if market is open (IST)
     */
    isMarketHours() {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();

        // Skip weekends
        if (day === 0 || day === 6) return false;

        // Market hours: 9:15 AM to 3:30 PM IST
        if (hour < 9 || hour >= 16) return false;
        if (hour === 9 && now.getMinutes() < 15) return false;
        if (hour === 15 && now.getMinutes() > 30) return false;

        return true;
    }

    /**
     * Start scheduled scanning
     */
    startScheduledScanning() {
        if (this.isRunning) {
            console.log('[Scheduler] Already running');
            return;
        }

        console.log(`\n⏰ Starting Scheduled Signal Scanner`);
        console.log(`   Pre-market: ${this.scheduleInfo.preMarket}`);
        console.log(`   Market open: ${this.scheduleInfo.marketOpen}`);
        console.log(`   Intraday interval: Every ${this.scheduleInfo.intraday} minutes`);
        console.log(`   Market close: ${this.scheduleInfo.marketClose}\n`);

        this.isRunning = true;

        // Start intraday scanning loop
        this.startIntradayLoop();
    }

    /**
     * Intraday scanning loop
     */
    startIntradayLoop() {
        const intervalMs = this.scheduleInfo.intraday * 60 * 1000;

        const scan = async () => {
            if (!this.isMarketHours()) {
                console.log(`[Scheduler] Market closed, skipping scan`);
                return;
            }

            try {
                console.log(`\n⏰ [Scheduler] Running scheduled scan...`);
                const results = await signalScanner.scanAllCategories();

                const totalSignals = results.reduce((sum, r) => sum + r.signals.length, 0);
                console.log(`[Scheduler] Scan complete: ${totalSignals} signals across ${results.length} categories`);

                // Store in history
                this.scanHistory.push({
                    timestamp: new Date().toISOString(),
                    categories: results.length,
                    totalSignals,
                    results: results.map(r => ({
                        category: r.categoryKey,
                        signals: r.signals.length
                    }))
                });

                // Keep only last 24 scans
                if (this.scanHistory.length > 24) {
                    this.scanHistory = this.scanHistory.slice(-24);
                }

                // TODO: Trigger notifications if new signals
                if (totalSignals > 0) {
                    this.triggerNotifications(results);
                }
            } catch (error) {
                console.error('[Scheduler] Scan error:', error.message);
            }
        };

        // Run immediately if in market hours
        if (this.isMarketHours()) {
            scan();
        }

        // Set interval
        const timer = setInterval(scan, intervalMs);
        this.timers.push(timer);

        console.log(`[Scheduler] Intraday loop started (every ${this.scheduleInfo.intraday} min)`);
    }

    /**
     * Stop scheduled scanning
     */
    stopScheduledScanning() {
        console.log('[Scheduler] Stopping scheduled scanning...');
        this.isRunning = false;

        for (const timer of this.timers) {
            clearInterval(timer);
        }
        this.timers = [];

        console.log('[Scheduler] Stopped');
    }

    /**
     * Trigger notifications for new signals
     */
    triggerNotifications(results) {
        // Collect all signals
        const allSignals = results.flatMap(r =>
            r.signals.map(s => ({ ...s, category: r.categoryKey }))
        );

        if (allSignals.length === 0) return;

        console.log(`\n🔔 NEW SIGNALS DETECTED!`);
        for (const signal of allSignals.slice(0, 5)) { // Show top 5
            console.log(`   📈 ${signal.symbol} @ ₹${signal.price.toFixed(2)}`);
            console.log(`      Target: ₹${signal.target.toFixed(2)} (+${signal.targetPercent}%)`);
            console.log(`      Stop: ₹${signal.stop.toFixed(2)} (-${signal.stopPercent}%)`);
            console.log(`      Confidence: ${signal.confidence}%`);
        }

        // TODO: Send to Telegram, browser notification, etc.
    }

    /**
     * Get scan history
     */
    getScanHistory() {
        return {
            isRunning: this.isRunning,
            scheduleInfo: this.scheduleInfo,
            history: this.scanHistory
        };
    }

    /**
     * Manual trigger for testing
     */
    async runManualScan(categoryKey) {
        console.log(`[Scheduler] Manual scan triggered for ${categoryKey}`);
        return await signalScanner.scanCategory(categoryKey);
    }
}

module.exports = new ScheduledScanner();
