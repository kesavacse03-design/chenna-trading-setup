/**
 * Scheduled Signal Scanner
 * Runs signal scans at scheduled times during market hours
 * Supports different intervals for Swing (15 min) and Intraday (1 min) categories
 */

const signalScanner = require('./signalScanner.cjs');
const trackingService = require('./trackingService.cjs');
const notificationService = require('./notificationService.cjs');
const { getSwingCategories, getIntradayCategories, getCategoryConfig } = require('../config/categoryConfig.cjs');

class ScheduledScanner {
    constructor() {
        this.isRunning = false;
        this.swingTimer = null;
        this.intradayTimer = null;
        this.scheduleInfo = {
            swingIntervalMin: 15,    // Swing categories: every 15 min
            intradayIntervalMin: 1,  // Intraday categories: every 1 min
            marketOpen: '09:15',
            marketClose: '15:30'
        };
        this.scanHistory = [];
    }

    /**
     * Check if market is open (IST)
     */
    isMarketHours() {
        const now = new Date();
        const hour = now.getHours();
        const min = now.getMinutes();
        const day = now.getDay();

        // Skip weekends
        if (day === 0 || day === 6) return false;

        // Market hours: 9:15 AM to 3:30 PM IST
        const currentTime = hour * 60 + min;
        const marketOpen = 9 * 60 + 15;   // 9:15 AM
        const marketClose = 15 * 60 + 30; // 3:30 PM

        return currentTime >= marketOpen && currentTime <= marketClose;
    }

    /**
     * Start scheduled scanning with dual intervals
     */
    startScheduledScanning() {
        if (this.isRunning) {
            console.log('[Scheduler] Already running');
            return { ok: true, message: 'Already running' };
        }

        console.log(`\n⏰ Starting Scheduled Signal Scanner`);
        console.log(`   Swing interval: Every ${this.scheduleInfo.swingIntervalMin} minutes`);
        console.log(`   Intraday interval: Every ${this.scheduleInfo.intradayIntervalMin} minute`);
        console.log(`   Market hours: ${this.scheduleInfo.marketOpen} - ${this.scheduleInfo.marketClose}\n`);

        this.isRunning = true;

        // Start Swing scanner (every 15 min)
        this.startSwingLoop();

        // Start Intraday scanner (every 1 min)
        this.startIntradayLoop();

        return { ok: true, message: 'Scheduled scanning started' };
    }

    /**
     * Swing categories scanning loop (every 15 minutes)
     */
    startSwingLoop() {
        const intervalMs = this.scheduleInfo.swingIntervalMin * 60 * 1000;

        const scanSwing = async () => {
            if (!this.isMarketHours()) {
                console.log(`[Swing] Market closed, skipping scan`);
                return;
            }

            try {
                console.log(`\n⏰ [SWING] Running 15-min scan...`);
                const swingCategories = getSwingCategories();

                for (const categoryKey of swingCategories) {
                    try {
                        const result = await signalScanner.scanCategory(categoryKey);

                        if (result.signals.length > 0) {
                            await notificationService.notifyNewSignals(result.signals, categoryKey);
                        }

                        this.recordScan('SWING', categoryKey, result.signals.length);
                    } catch (error) {
                        console.error(`[Swing] Error scanning ${categoryKey}:`, error.message);
                    }
                }
            } catch (error) {
                console.error('[Swing] Scan error:', error.message);
            }
        };

        // Run immediately if in market hours
        if (this.isMarketHours()) {
            scanSwing();
        }

        // Set interval
        this.swingTimer = setInterval(scanSwing, intervalMs);
        console.log(`[Swing] Loop started (every ${this.scheduleInfo.swingIntervalMin} min)`);
    }

    /**
     * Intraday categories scanning loop (every 1 minute)
     */
    startIntradayLoop() {
        const intervalMs = this.scheduleInfo.intradayIntervalMin * 60 * 1000;

        const scanIntraday = async () => {
            if (!this.isMarketHours()) {
                console.log(`[Intraday] Market closed, skipping scan`);
                return;
            }

            try {
                console.log(`\n⏰ [INTRADAY] Running 1-min scan...`);
                const intradayCategories = getIntradayCategories();

                for (const categoryKey of intradayCategories) {
                    try {
                        // Check if there are any stocks added today
                        const eligible = await trackingService.getEligibleStocks(categoryKey);
                        if (eligible.length === 0) continue;

                        const result = await signalScanner.scanCategory(categoryKey);

                        if (result.signals.length > 0) {
                            await notificationService.notifyNewSignals(result.signals, categoryKey);
                        }

                        this.recordScan('INTRADAY', categoryKey, result.signals.length);
                    } catch (error) {
                        console.error(`[Intraday] Error scanning ${categoryKey}:`, error.message);
                    }
                }
            } catch (error) {
                console.error('[Intraday] Scan error:', error.message);
            }
        };

        // Run immediately if in market hours
        if (this.isMarketHours()) {
            scanIntraday();
        }

        // Set interval
        this.intradayTimer = setInterval(scanIntraday, intervalMs);
        console.log(`[Intraday] Loop started (every ${this.scheduleInfo.intradayIntervalMin} min)`);
    }

    /**
     * Record scan in history
     */
    recordScan(type, categoryKey, signalsFound) {
        this.scanHistory.push({
            timestamp: new Date().toISOString(),
            type,
            categoryKey,
            signalsFound
        });

        // Keep only last 100 scans
        if (this.scanHistory.length > 100) {
            this.scanHistory = this.scanHistory.slice(-100);
        }
    }

    /**
     * Stop scheduled scanning
     */
    stopScheduledScanning() {
        console.log('[Scheduler] Stopping scheduled scanning...');
        this.isRunning = false;

        if (this.swingTimer) {
            clearInterval(this.swingTimer);
            this.swingTimer = null;
        }

        if (this.intradayTimer) {
            clearInterval(this.intradayTimer);
            this.intradayTimer = null;
        }

        console.log('[Scheduler] Stopped');
        return { ok: true, message: 'Scheduled scanning stopped' };
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            scheduleInfo: this.scheduleInfo,
            isMarketHours: this.isMarketHours(),
            swingCategories: getSwingCategories(),
            intradayCategories: getIntradayCategories(),
            recentScans: this.scanHistory.slice(-20).reverse()
        };
    }

    /**
     * Get scan history
     */
    getScanHistory() {
        return {
            isRunning: this.isRunning,
            scheduleInfo: this.scheduleInfo,
            history: this.scanHistory.slice(-50).reverse()
        };
    }
}

module.exports = new ScheduledScanner();
