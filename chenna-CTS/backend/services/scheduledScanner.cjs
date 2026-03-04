/**
 * Scheduled Signal Scanner
 * Runs signal scans at scheduled times during market hours
 * Supports different intervals for Swing (15 min) and Intraday (1 min) categories
 * 
 * V2.1 UPDATE: Uses V2.1 N-Pattern strategy (66.7% WR) for intraday categories
 */

const signalScanner = require('./signalScanner.cjs');
const trackingService = require('./trackingService.cjs');
const notificationService = require('./notificationService.cjs');
const monitorService = require('./intradayMonitorService.cjs'); // Import Monitor Service
const { getSwingCategories, getIntradayCategories, getCategoryConfig } = require('../config/categoryConfig.cjs');
const categoryController = require('./categoryController.cjs');

// Import V2.1 strategy for intraday categories (same as backtest)
let generateIntradaySignalsV21 = null;
let upsideLomIntraStrategy = null;
let downsideLomIntraStrategy = null;
let preMarketStrategy = null;

try {
    const v21 = require('./labs/intradayStrategyV2_1.cjs');
    generateIntradaySignalsV21 = v21.generateIntradaySignalsV21;
    console.log('[Scheduler] V2.1 N-Pattern strategy loaded ✅');
} catch (e) {
    console.warn('[Scheduler] V2.1 strategy not available:', e.message);
}

try {
    upsideLomIntraStrategy = require('./labs/upsideLomIntraStrategy.cjs');
    console.log('[Scheduler] Bullish Divergence strategy loaded ✅');
} catch (e) {
    console.warn('[Scheduler] Bullish Divergence strategy not available:', e.message);
}

try {
    downsideLomIntraStrategy = require('./labs/downsideLomIntraStrategy.cjs');
    console.log('[Scheduler] Bearish Divergence strategy loaded ✅');
} catch (e) {
    console.warn('[Scheduler] Bearish Divergence strategy not available:', e.message);
}

try {
    preMarketStrategy = require('./labs/preMarketStrategy.cjs');
    console.log('[Scheduler] Gap Trading strategy loaded ✅');
} catch (e) {
    console.warn('[Scheduler] Gap Trading strategy not available:', e.message);
}

// Strategy mapping by category
const STRATEGY_MAP = {
    'INTRADAY_BOOST': { strategy: 'V2.1_N_PATTERN', generator: generateIntradaySignalsV21 },
    'HIGH_POWERED_STOCKS': { strategy: 'V2.1_N_PATTERN', generator: generateIntradaySignalsV21 },
    'UPSIDE_LOM_INTRA': { strategy: 'BULLISH_DIVERGENCE', module: upsideLomIntraStrategy },
    'DOWNSIDE_LOM_INTRA': { strategy: 'BEARISH_DIVERGENCE', module: downsideLomIntraStrategy },
    'PRE_MARKET': { strategy: 'GAP_TRADING', module: preMarketStrategy }
};

// Categories with implemented strategies
const ACTIVE_INTRADAY_CATEGORIES = Object.keys(STRATEGY_MAP);

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




    // ...

    /**
     * Swing categories scanning loop (every 15 minutes)
     */
    async startSwingLoop() {
        if (this.swingTimer) clearInterval(this.swingTimer);

        console.log(`[Scheduler] Starting Swing Scan Loop (Interval: ${this.scheduleInfo.swingIntervalMin} min)`);

        const scanSwing = async () => {
            if (!this.isMarketHours()) {
                console.log(`[Swing] Market closed, skipping scan`);
                return;
            }

            try {
                // FETCH ACTIVE SWING CATEGORIES DYNAMICALLY
                const allCats = await categoryController.getAllCategories();
                const activeSwingCats = allCats.filter(c =>
                    c.type === 'SWING' && c.enabled && c.scanningEnabled
                );

                if (activeSwingCats.length === 0) {
                    console.log(`[Swing] No active swing categories enabled.`);
                    return;
                }

                console.log(`\n⏰ [SWING] Running 15-min scan for ${activeSwingCats.length} categories...`);

                for (const cat of activeSwingCats) {
                    try {
                        const result = await signalScanner.scanCategory(cat.key);

                        if (result.signals.length > 0) {
                            await notificationService.notifyNewSignals(result.signals, cat.key);
                        }

                        this.recordScan('SWING', cat.key, result.signals.length);
                    } catch (error) {
                        console.error(`[Swing] Error scanning ${cat.key}:`, error.message);
                    }
                }
            } catch (error) {
                console.error('[Swing] Scan error:', error.message);
            }
        };

        // Initial scan
        // scanSwing(); 

        // Schedule
        this.swingTimer = setInterval(scanSwing, this.scheduleInfo.swingIntervalMin * 60 * 1000);
    }

    /**
     * Intraday categories scanning loop (every 1 minute)
     */
    async startIntradayLoop() {
        if (this.intradayTimer) clearInterval(this.intradayTimer);

        console.log(`[Scheduler] Starting Intraday Scan Loop (Interval: ${this.scheduleInfo.intradayIntervalMin} min)`);

        const scanIntraday = async () => {
            if (!this.isMarketHours()) {
                console.log(`[Intraday] Market closed, skipping scan`);
                return;
            }

            try {
                // FETCH ACTIVE INTRADAY CATEGORIES DYNAMICALLY
                const allCats = await categoryController.getAllCategories();
                const activeIntradayCats = allCats.filter(c =>
                    c.type === 'INTRADAY' && c.enabled && c.scanningEnabled
                );

                if (activeIntradayCats.length === 0) return;

                console.log(`\n⏰ [INTRADAY] Running 1-min scan for ${activeIntradayCats.length} categories...`);

                for (const cat of activeIntradayCats) {
                    const categoryKey = cat.key;
                    try {
                        const strategyConfig = STRATEGY_MAP[categoryKey];
                        if (!strategyConfig) continue;

                        // Check if there are any eligible stocks
                        const eligible = await trackingService.getEligibleStocks(categoryKey);
                        if (eligible.length === 0) {
                            // console.log(`[${strategyConfig.strategy}] ${categoryKey}: No eligible stocks, skipping`);
                            continue;
                        }

                        console.log(`[${strategyConfig.strategy}] ${categoryKey}: Scanning ${eligible.length} stocks...`);
                        const today = new Date().toISOString().split('T')[0];
                        let signals = [];

                        // Dispatch to appropriate strategy
                        if (strategyConfig.strategy === 'V2.1_N_PATTERN' && strategyConfig.generator) {
                            // HANDLER FOR V2.1 STRATEGY (Returns { signals, stats })
                            const result = await strategyConfig.generator(categoryKey, today);

                            if (result && result.signals) {
                                signals = result.signals;
                                // UPDATE UI MONITOR
                                // console.log(`[Scheduler] Updating UI Monitor with stats from ${categoryKey}`);
                                monitorService.updateStats(result.stats);
                            } else {
                                signals = result || [];
                            }
                        } else if (strategyConfig.module && strategyConfig.module.generateSignal) {
                            // For new strategies, scan each stock individually
                            for (const stock of eligible) {
                                const candles = await strategyConfig.module.get5MinCandles?.(stock.symbol, today)
                                    || await strategyConfig.module.get1MinCandles?.(stock.symbol, today)
                                    || [];
                                if (candles.length < 20) continue;

                                const currentTime = new Date().toISOString();
                                const previousClose = strategyConfig.module.getPreviousClose
                                    ? await strategyConfig.module.getPreviousClose(stock.symbol, today)
                                    : null;

                                const signal = await strategyConfig.module.generateSignal(
                                    stock.symbol,
                                    candles,
                                    previousClose || currentTime,
                                    candles.length - 1
                                );

                                if (signal) signals.push(signal);
                            }
                        }

                        if (signals.length > 0) {
                            console.log(`[${strategyConfig.strategy}] ${categoryKey}: 🎯 ${signals.length} signals generated!`);

                            const formattedSignals = signals.map(s => ({
                                symbol: s.symbol,
                                categoryKey: categoryKey,
                                strategy: strategyConfig.strategy,
                                direction: s.direction || 'LONG',
                                price: s.entryPrice || s.price,
                                target: s.targetPrice || s.target,
                                stop: s.stopPrice || s.stop,
                                confidence: s.confidence || 60,
                                reason: s.reason || 'Strategy signal',
                                timestamp: new Date().toISOString()
                            }));

                            await notificationService.notifyNewSignals(formattedSignals, categoryKey);
                        }

                        this.recordScan(strategyConfig.strategy, categoryKey, signals.length);
                    } catch (error) {
                        console.error(`[Intraday] Error scanning ${categoryKey}:`, error.message);
                    }
                }
            } catch (error) {
                console.error('[Intraday] Scan error:', error.message);
            }
        };

        // Schedule
        this.intradayTimer = setInterval(scanIntraday, this.scheduleInfo.intradayIntervalMin * 60 * 1000);
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
            intradayCategories: ACTIVE_INTRADAY_CATEGORIES, // Only V2.1 enabled categories
            v21Enabled: !!generateIntradaySignalsV21,
            v21Strategy: 'N-Pattern (66.7% WR)',
            v21Categories: ACTIVE_INTRADAY_CATEGORIES,
            disabledCategories: getIntradayCategories().filter(c => !ACTIVE_INTRADAY_CATEGORIES.includes(c)),
            recentScans: this.scanHistory.slice(-20).reverse()
        };
    }

    /**
     * Get scan history
     */
    getScanHistory() {
        // Fix: Ensure we return category lists so UI can display them
        const V21_ENABLED_CATEGORIES = ACTIVE_INTRADAY_CATEGORIES;

        return {
            isRunning: this.isRunning,
            scheduleInfo: this.scheduleInfo,
            isMarketHours: this.isMarketHours(),
            swingCategories: getSwingCategories(),
            intradayCategories: V21_ENABLED_CATEGORIES,
            v21Enabled: !!generateIntradaySignalsV21,
            v21Strategy: 'N-Pattern (66.7% WR)',
            v21Categories: V21_ENABLED_CATEGORIES,
            history: this.scanHistory.slice(-50).reverse()
        };
    }
}

module.exports = new ScheduledScanner();
