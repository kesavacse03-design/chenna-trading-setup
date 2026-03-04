/**
 * Signal Scheduler — Autonomous Background Signal Generation
 * 
 * Runs automatically when the server starts:
 * - 9:15-9:45 AM:  OR forming phase (scan but don't generate signals)
 * - 9:45-14:30:    Active signal generation (every 2 minutes)
 * - 14:30-15:15:   Monitor only (no new signals)
 * - 15:15-15:20:   Auto-close all intraday positions (EOD)
 * - 15:20+:        Stop scanning until next trading day
 */

const {
    todayIST, getMarketPhase, isMarketOpen, isEntryWindowOpen,
    isIntradayExitTime, currentISTTime
} = require('../utils/istUtils.cjs');

const SCAN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes between scans
const STATUS_CHECK_MS = 30 * 1000;      // Check market phase every 30s

class SignalScheduler {
    constructor() {
        this.status = 'IDLE';        // IDLE, RUNNING, PAUSED, ERROR
        this.scanInterval = null;
        this.statusInterval = null;
        this.lastScanTime = null;
        this.nextScanTime = null;
        this.cycleCount = 0;
        this.lastError = null;
        this.eodTriggered = false;    // Prevent double EOD trigger
        this.todayDate = null;        // Reset EOD flag on new day
    }

    /**
     * Start the scheduler. Called once on server boot.
     */
    start() {
        if (this.statusInterval) {
            console.log('[SignalScheduler] Already started');
            return;
        }

        console.log('[SignalScheduler] 🚀 Starting autonomous signal scheduler...');
        this.status = 'PAUSED'; // Will switch to RUNNING during market hours

        // Check market phase every 30 seconds to decide when to scan
        this.statusInterval = setInterval(() => this._checkAndSchedule(), STATUS_CHECK_MS);

        // Run initial check immediately
        this._checkAndSchedule();
    }

    /**
     * Stop the scheduler gracefully.
     */
    stop() {
        console.log('[SignalScheduler] Stopping...');
        if (this.scanInterval) clearInterval(this.scanInterval);
        if (this.statusInterval) clearInterval(this.statusInterval);
        this.scanInterval = null;
        this.statusInterval = null;
        this.status = 'IDLE';
        console.log('[SignalScheduler] ✅ Stopped');
    }

    /**
     * Get current scanner status (for API endpoint).
     */
    getStatus() {
        return {
            status: this.status,
            marketPhase: getMarketPhase(),
            isMarketOpen: isMarketOpen(),
            currentTime: currentISTTime(),
            lastScanTime: this.lastScanTime,
            nextScanTime: this.nextScanTime,
            cycleCount: this.cycleCount,
            eodTriggered: this.eodTriggered,
            lastError: this.lastError,
            scanIntervalMs: SCAN_INTERVAL_MS,
            today: todayIST()
        };
    }

    /**
     * Internal: decide whether to start/stop scanning based on market phase.
     */
    _checkAndSchedule() {
        const today = todayIST();
        const phase = getMarketPhase();
        const day = new Date().getDay();

        // Reset EOD flag on new day
        if (this.todayDate !== today) {
            this.todayDate = today;
            this.eodTriggered = false;
            this.cycleCount = 0;
        }

        // Skip weekends
        if (day === 0 || day === 6) {
            this._stopScanning();
            this.status = 'PAUSED';
            return;
        }

        // Handle different market phases
        switch (phase) {
            case 'PRE_MARKET':
                this._stopScanning();
                this.status = 'PAUSED';
                break;

            case 'OR_FORMING':
                // Start scanning but don't generate signals — just monitor OR formation
                this._startScanning();
                this.status = 'RUNNING';
                break;

            case 'ACTIVE_TRADING':
                // Full signal generation mode
                this._startScanning();
                this.status = 'RUNNING';
                break;

            case 'MONITORING':
                // Still scan but only update existing signals, no new entries
                this._startScanning();
                this.status = 'RUNNING';
                break;

            case 'CLOSING':
                // Check for EOD auto-close
                if (!this.eodTriggered && isIntradayExitTime()) {
                    this._triggerEOD();
                }
                this._startScanning(); // Keep monitoring for exit signals
                this.status = 'RUNNING';
                break;

            case 'CLOSED':
                this._stopScanning();
                this.status = 'PAUSED';
                break;
        }
    }

    /**
     * Start the scan interval if not already running.
     */
    _startScanning() {
        if (this.scanInterval) return; // Already scanning

        console.log(`[SignalScheduler] ▶ Starting scan loop (every ${SCAN_INTERVAL_MS / 1000}s)`);
        this.scanInterval = setInterval(() => this._runScanCycle(), SCAN_INTERVAL_MS);

        // Run first scan immediately
        this._runScanCycle();
    }

    /**
     * Stop the scan interval.
     */
    _stopScanning() {
        if (!this.scanInterval) return;

        console.log('[SignalScheduler] ⏸ Stopping scan loop');
        clearInterval(this.scanInterval);
        this.scanInterval = null;
    }

    /**
     * Run a single scan cycle — the main loop body.
     */
    async _runScanCycle() {
        this.cycleCount++;
        const phase = getMarketPhase();
        this.lastScanTime = currentISTTime();
        this.nextScanTime = new Date(Date.now() + SCAN_INTERVAL_MS)
            .toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

        try {
            console.log(`[SignalScheduler] 🔄 Scan #${this.cycleCount} at ${this.lastScanTime} | Phase: ${phase}`);

            // Only generate signals during ACTIVE_TRADING & MONITORING
            if (phase === 'ACTIVE_TRADING' || phase === 'MONITORING' || phase === 'OR_FORMING') {
                // Call the intraday refresh + confirmation pipeline
                let refreshIntradayCache;
                try {
                    const refreshModule = require('../scripts/intraday_refresh.cjs');
                    refreshIntradayCache = refreshModule.refreshIntradayCache || refreshModule;
                } catch (e) {
                    console.log('[SignalScheduler] intraday_refresh not available, skipping cache refresh');
                    return;
                }

                if (typeof refreshIntradayCache === 'function') {
                    const result = await refreshIntradayCache();
                    if (result) {
                        console.log(`[SignalScheduler] ✅ Scan complete: ${JSON.stringify(result).substring(0, 200)}`);
                    }
                }

                // Update IB watchlist phase tracking
                try {
                    const watchService = require('./intradayWatchService.cjs');
                    await watchService.update();
                } catch (e) {
                    console.log('[SignalScheduler] WatchService update skipped:', e.message);
                }
            }

            this.lastError = null;

            // Update scanner status tracker for live stock grouping
            try {
                const scannerTracker = require('./scannerStatusTracker.cjs');
                await scannerTracker.updateAll();
            } catch (e) {
                console.log('[SignalScheduler] Scanner tracker update skipped:', e.message);
            }

            // Expiry and Status checking
            try {
                await this._updateSignalStatuses();
            } catch (e) {
                console.log('[SignalScheduler] Signal status update failed:', e.message);
            }
        } catch (err) {
            this.lastError = err.message;
            this.status = 'ERROR';
            console.error(`[SignalScheduler] ❌ Scan #${this.cycleCount} failed:`, err.message);
        }
    }

    /**
     * Checks all active signals for the day, updating their status based on:
     * 1. Time-based expiry (too much time passed since generation)
     * 2. Price-based expiry (price moved way too far)
     * 3. Target / Stop hit
     */
    async _updateSignalStatuses() {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const { todayIST, nowIST } = require('../utils/istUtils.cjs');
        let livePriceService;
        try {
            livePriceService = require('./livePriceService.cjs');
        } catch (e) { }

        let telegramService;
        try {
            telegramService = require('./telegramService.cjs');
        } catch (e) { }

        const todayStr = todayIST();
        const todayUTC = new Date(todayStr + "T00:00:00Z");

        // Fetch WAITING, PARTIAL, LIVE, or CONFIRMED signals
        const activeSignals = await prisma.v5Signal.findMany({
            where: {
                signalDate: todayUTC,
                category: 'INTRADAY_BOOST',
                status: { in: ['CONFIRMED', 'WAITING', 'PARTIAL', 'LIVE'] }
            }
        });

        if (!activeSignals.length) return;

        const now = nowIST(); // { hours, minutes, timeString }

        for (const signal of activeSignals) {
            let newStatus = signal.status;
            let currentPrice = null;

            if (livePriceService) {
                const priceData = livePriceService.getPrice(signal.symbol);
                if (priceData && priceData.ltp) {
                    currentPrice = priceData.ltp;
                }
            }

            // 1. Target / Stop Hit Check (always prioritize this if we have price)
            if (currentPrice) {
                const dir = signal.direction || 'LONG';
                const stop = parseFloat(signal.stopPrice);
                const t1 = parseFloat(signal.t1Price);
                const t2 = parseFloat(signal.t2Price);

                if (dir === 'LONG') {
                    if (currentPrice <= stop) newStatus = 'STOPPED';
                    else if (t2 && currentPrice >= t2) newStatus = 'T2_HIT';
                    else if (t1 && currentPrice >= t1) newStatus = 'T1_HIT';
                } else {
                    if (currentPrice >= stop) newStatus = 'STOPPED';
                    else if (t2 && currentPrice <= t2) newStatus = 'T2_HIT';
                    else if (t1 && currentPrice <= t1) newStatus = 'T1_HIT';
                }
            }

            // 2. Time-Based Expiry Check
            if (['CONFIRMED', 'WAITING', 'PARTIAL'].includes(newStatus)) {
                let expiredByTime = false;

                // Absolute cutoff - no new entries after 2:30 PM (14:30)
                if (now.hours >= 14.5) expiredByTime = true;

                if (signal.confirmedAt && !expiredByTime) {
                    const cAt = new Date(signal.confirmedAt);
                    const confirmedHour = cAt.getUTCHours() + 5.5; // lazy IST

                    if (confirmedHour < 11 && now.hours >= 12.5) expiredByTime = true; // generated before 11 -> valid till 12:30
                    if (confirmedHour >= 11 && confirmedHour < 12 && now.hours >= 13.5) expiredByTime = true; // 11-12 -> valid till 1:30
                    if (confirmedHour >= 12 && now.hours >= 14.5) expiredByTime = true; // after 12 -> valid till 2:30
                }

                if (expiredByTime) newStatus = 'EXPIRED';
            }

            // 3. Price-Based Expiry (GONE) Check
            if (['CONFIRMED', 'WAITING', 'PARTIAL'].includes(newStatus) && currentPrice && signal.meta) {
                const meta = typeof signal.meta === 'string' ? JSON.parse(signal.meta) : signal.meta;
                const min = meta.entryRangeMin;
                const max = meta.entryRangeMax;
                const dir = signal.direction || 'LONG';

                if (min && max) {
                    // For LONG: if price is > 0.5% above the max range => too far to enter
                    if (dir === 'LONG' && currentPrice > max * 1.005) {
                        newStatus = 'GONE';
                    }
                    // For SHORT: if price is < 0.5% below min range => too far to enter
                    if (dir === 'SHORT' && currentPrice < min * 0.995) {
                        newStatus = 'GONE';
                    }
                }
            }

            // Update in DB if changed
            if (newStatus !== signal.status) {
                console.log(`[SignalScheduler] ⚡ Signal ${signal.symbol} changed from ${signal.status} to ${newStatus} at ${currentPrice}`);
                await prisma.v5Signal.update({
                    where: { id: signal.id },
                    data: { status: newStatus }
                });

                if (telegramService) {
                    if (newStatus === 'T1_HIT') telegramService.alertTargetHit(signal, 'T1', currentPrice || signal.t1Price);
                    else if (newStatus === 'T2_HIT') telegramService.alertTargetHit(signal, 'T2', currentPrice || signal.t2Price);
                    else if (newStatus === 'STOPPED') telegramService.alertStopHit(signal, currentPrice || signal.stopPrice);
                    else if (newStatus === 'EXPIRED') telegramService.alertExpired(signal);
                }
            }
        }
    }

    /**
     * Trigger EOD auto-close for all intraday positions.
     * Called once at 3:15 PM IST.
     */
    async _triggerEOD() {
        this.eodTriggered = true;
        console.log('\n[SignalScheduler] 🔔 === EOD AUTO-CLOSE TRIGGERED === 🔔');

        try {
            const eodService = require('./eodService.cjs');
            const result = await eodService.runEODCleanup();
            console.log(`[SignalScheduler] EOD cleanup result: ${result.closed} positions closed`);

            try {
                const telegramService = require('./telegramService.cjs');
                telegramService.alertEodSummary({
                    totalSignals: result.closed, // Hack for proxy data
                    totalTrades: result.closed,
                    winRate: 0,
                    pnl: 0,
                    ...result
                });
            } catch (e) { }

        } catch (err) {
            console.error('[SignalScheduler] ❌ EOD cleanup failed:', err.message);
        }
    }

    /**
     * Force an immediate scan (for "Force Scan Now" button).
     */
    async forceScan() {
        console.log('[SignalScheduler] ⚡ Force scan triggered by user');
        await this._runScanCycle();
        return { ok: true, cycleCount: this.cycleCount, lastScanTime: this.lastScanTime };
    }
}

// Singleton
const scheduler = new SignalScheduler();

module.exports = scheduler;
