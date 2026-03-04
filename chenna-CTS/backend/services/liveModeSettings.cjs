/**
 * Live Mode Settings Service
 * 
 * Persists user preferences for live trading mode:
 * - Active categories for live monitoring
 * - Price sync intervals
 * - Service enable/disable states
 * 
 * All services (Signal Tracking, SignatureBuilder, EventReconstructor, LivePriceService)
 * will only run for categories that are enabled here.
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../config/liveModeSettings.json');

// Default settings
const DEFAULT_SETTINGS = {
    // Which category is active for live mode
    activeCategory: 'INTRADAY_BOOST',

    // Is live mode enabled globally
    liveModeEnabled: false,

    // Per-service enable states
    services: {
        livePrices: true,
        signalTracking: true,
        signatureBuilder: true,
        eventReconstructor: true
    },

    // Price update interval (minutes)
    priceUpdateInterval: 5,

    // Signal scan interval (minutes)
    signalScanInterval: 1,

    // Last updated timestamp
    lastUpdated: null,

    // History of category changes
    categoryHistory: [],

    // Auto-Skip Settings (Hybrid Confidence Filter)
    autoSkipLow: false,        // Skip LOW confidence signals
    autoSkipAgainstTrend: false // Skip signals with AGAINST_TREND warning
};

class LiveModeSettings {
    constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.loadSettings();
    }

    /**
     * Load settings from file
     */
    loadSettings() {
        try {
            if (fs.existsSync(SETTINGS_FILE)) {
                const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
                const loaded = JSON.parse(data);
                this.settings = { ...DEFAULT_SETTINGS, ...loaded };
                console.log(`[LiveSettings] Loaded: ${this.settings.activeCategory}, enabled=${this.settings.liveModeEnabled}`);
            } else {
                console.log('[LiveSettings] No settings file, using defaults');
                this.saveSettings();
            }
        } catch (error) {
            console.error('[LiveSettings] Load error:', error.message);
        }
    }

    /**
     * Save settings to file
     */
    saveSettings() {
        try {
            const dir = path.dirname(SETTINGS_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.settings.lastUpdated = new Date().toISOString();
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
            console.log('[LiveSettings] Saved');
        } catch (error) {
            console.error('[LiveSettings] Save error:', error.message);
        }
    }

    /**
     * Get all settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Enable live mode for a category
     */
    enableLiveMode(category) {
        const previousCategory = this.settings.activeCategory;

        this.settings.activeCategory = category;
        this.settings.liveModeEnabled = true;
        this.settings.lastUpdated = new Date().toISOString();

        // Track history
        if (previousCategory !== category) {
            this.settings.categoryHistory.push({
                from: previousCategory,
                to: category,
                timestamp: new Date().toISOString()
            });

            // Keep only last 10 changes
            if (this.settings.categoryHistory.length > 10) {
                this.settings.categoryHistory = this.settings.categoryHistory.slice(-10);
            }
        }

        this.saveSettings();

        console.log(`[LiveSettings] Live mode ENABLED for ${category}`);
        return {
            ok: true,
            activeCategory: category,
            liveModeEnabled: true,
            previousCategory
        };
    }

    /**
     * Disable live mode (stops all services)
     */
    disableLiveMode() {
        this.settings.liveModeEnabled = false;
        this.settings.lastUpdated = new Date().toISOString();
        this.saveSettings();

        console.log('[LiveSettings] Live mode DISABLED');
        return {
            ok: true,
            liveModeEnabled: false,
            activeCategory: this.settings.activeCategory
        };
    }

    /**
     * Check if live mode is enabled
     */
    isLiveModeEnabled() {
        return this.settings.liveModeEnabled;
    }

    /**
     * Get active category
     */
    getActiveCategory() {
        return this.settings.activeCategory;
    }

    /**
     * Check if a specific category is the active one
     */
    isCategoryActive(categoryKey) {
        return this.settings.liveModeEnabled &&
            this.settings.activeCategory === categoryKey;
    }

    /**
     * Enable/disable individual service
     */
    setServiceEnabled(serviceName, enabled) {
        if (this.settings.services.hasOwnProperty(serviceName)) {
            this.settings.services[serviceName] = enabled;
            this.saveSettings();
            console.log(`[LiveSettings] ${serviceName}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
            return { ok: true, service: serviceName, enabled };
        }
        return { ok: false, error: `Unknown service: ${serviceName}` };
    }

    /**
     * Check if a service is enabled
     */
    isServiceEnabled(serviceName) {
        return this.settings.liveModeEnabled &&
            this.settings.services[serviceName] === true;
    }

    /**
     * Set price update interval
     */
    setPriceInterval(minutes) {
        this.settings.priceUpdateInterval = Math.max(1, Math.min(60, minutes));
        this.saveSettings();
        console.log(`[LiveSettings] Price interval: ${this.settings.priceUpdateInterval} min`);
        return { ok: true, interval: this.settings.priceUpdateInterval };
    }


    /**
     * Set signal scan interval  
     */
    setSignalScanInterval(minutes) {
        this.settings.signalScanInterval = Math.max(1, Math.min(30, minutes));
        this.saveSettings();
        console.log(`[LiveSettings] Signal scan interval: ${this.settings.signalScanInterval} min`);
        return { ok: true, interval: this.settings.signalScanInterval };
    }

    /**
     * Set Auto-Skip Settings (Hybrid Filter)
     */
    setAutoSkipSettings(autoSkipLow, autoSkipAgainstTrend) {
        this.settings.autoSkipLow = !!autoSkipLow;
        this.settings.autoSkipAgainstTrend = !!autoSkipAgainstTrend;
        this.settings.lastUpdated = new Date().toISOString();
        this.saveSettings();
        console.log(`[LiveSettings] Auto-Skip Updated: Low=${this.settings.autoSkipLow}, AgainstTrend=${this.settings.autoSkipAgainstTrend}`);
        return {
            ok: true,
            autoSkipLow: this.settings.autoSkipLow,
            autoSkipAgainstTrend: this.settings.autoSkipAgainstTrend
        };
    }

    /**
     * Get Auto-Skip Settings
     */
    getAutoSkipSettings() {
        return {
            autoSkipLow: this.settings.autoSkipLow || false,
            autoSkipAgainstTrend: this.settings.autoSkipAgainstTrend || false
        };
    }

    /**
     * Get status summary
     */
    getStatus() {
        return {
            liveModeEnabled: this.settings.liveModeEnabled,
            activeCategory: this.settings.activeCategory,
            services: { ...this.settings.services },
            priceUpdateInterval: this.settings.priceUpdateInterval,
            signalScanInterval: this.settings.signalScanInterval,
            lastUpdated: this.settings.lastUpdated
        };
    }

    /**
     * Reset to defaults
     */
    resetToDefaults() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.saveSettings();
        console.log('[LiveSettings] Reset to defaults');
        return { ok: true, settings: this.getStatus() };
    }
}

// Singleton instance
const liveModeSettings = new LiveModeSettings();

module.exports = liveModeSettings;
