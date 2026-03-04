/**
 * Live Price Routes - Enhanced with Persistent Settings
 * API endpoints for controlling live price service and saving preferences
 */

const express = require('express');
const router = express.Router();
const livePriceService = require('../services/livePriceService.cjs');
const liveModeSettings = require('../services/liveModeSettings.cjs');

// ============================================================
// LIVE MODE CONTROL (persisted)
// ============================================================

/**
 * GET /api/livePrice/start
 * Start live price service for a category (saves to settings)
 */
router.get('/start', async (req, res) => {
    try {
        const category = req.query.category || liveModeSettings.getActiveCategory();

        // Save to persistent settings
        liveModeSettings.enableLiveMode(category);

        // Start the service
        const result = await livePriceService.start(category);

        res.json({
            ok: true,
            ...result,
            persisted: true,
            message: `Live mode enabled for ${category} (settings saved)`
        });
    } catch (error) {
        console.error('[LivePrice API] Start error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/livePrice/stop
 * Stop live price service (saves to settings)
 */
router.get('/stop', async (req, res) => {
    try {
        // Save to persistent settings
        liveModeSettings.disableLiveMode();

        // Stop the service
        const result = livePriceService.stop();

        res.json({
            ok: true,
            ...result,
            persisted: true,
            message: 'Live mode disabled (settings saved)'
        });
    } catch (error) {
        console.error('[LivePrice API] Stop error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/livePrice/status
 * Get comprehensive status including persisted settings
 */
router.get('/status', async (req, res) => {
    try {
        const serviceStatus = livePriceService.getStatus();
        const settingsStatus = liveModeSettings.getStatus();

        res.json({
            ok: true,
            service: serviceStatus,
            settings: settingsStatus
        });
    } catch (error) {
        console.error('[LivePrice API] Status error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ============================================================
// PRICE DATA
// ============================================================

/**
 * GET /api/livePrice/prices
 * Get all cached prices
 */
router.get('/prices', async (req, res) => {
    try {
        const result = livePriceService.getAllPrices();
        res.json(result);
    } catch (error) {
        console.error('[LivePrice API] Prices error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/livePrice/price/:symbol
 * Get price for a specific symbol
 */
router.get('/price/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const price = livePriceService.getPrice(symbol);

        if (price) {
            res.json({ ok: true, symbol, ...price });
        } else {
            res.json({ ok: false, error: `No price for ${symbol}` });
        }
    } catch (error) {
        console.error('[LivePrice API] Price error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ============================================================
// SETTINGS (persisted)
// ============================================================

/**
 * GET /api/livePrice/settings
 * Get all persisted settings
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = liveModeSettings.getSettings();
        res.json({ ok: true, settings });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/livePrice/settings/category
 * Change active category (persisted)
 */
router.post('/settings/category', async (req, res) => {
    try {
        const { category } = req.body;

        if (!category) {
            return res.status(400).json({ ok: false, error: 'Missing category' });
        }

        // Update settings
        const wasRunning = livePriceService.isRunning;
        if (wasRunning) {
            livePriceService.stop();
        }

        liveModeSettings.enableLiveMode(category);
        livePriceService.setCategory(category);

        if (wasRunning) {
            await livePriceService.start(category);
        }

        res.json({
            ok: true,
            category,
            persisted: true,
            message: `Category changed to ${category} (settings saved)`
        });
    } catch (error) {
        console.error('[LivePrice API] Category error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/livePrice/settings/interval
 * Change price update interval (persisted)
 */
router.post('/settings/interval', async (req, res) => {
    try {
        const { minutes } = req.body;

        if (!minutes || minutes < 1 || minutes > 60) {
            return res.status(400).json({ ok: false, error: 'Invalid interval (1-60 minutes)' });
        }

        // Update settings
        liveModeSettings.setPriceInterval(minutes);
        livePriceService.setUpdateInterval(minutes);

        res.json({
            ok: true,
            interval: minutes,
            persisted: true,
            message: `Price interval set to ${minutes} minutes (settings saved)`
        });
    } catch (error) {
        console.error('[LivePrice API] Interval error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/livePrice/settings/service
 * Enable/disable individual service (persisted)
 */
router.post('/settings/service', async (req, res) => {
    try {
        const { service, enabled } = req.body;

        if (!service || typeof enabled !== 'boolean') {
            return res.status(400).json({ ok: false, error: 'Missing service or enabled' });
        }

        const result = liveModeSettings.setServiceEnabled(service, enabled);

        res.json({
            ...result,
            persisted: true,
            message: `${service}: ${enabled ? 'enabled' : 'disabled'} (settings saved)`
        });
    } catch (error) {
        console.error('[LivePrice API] Service error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/livePrice/settings/reset
 * Reset to default settings
 */
router.post('/settings/reset', async (req, res) => {
    try {
        const result = liveModeSettings.resetToDefaults();

        // Stop service if running
        if (livePriceService.isRunning) {
            livePriceService.stop();
        }

        res.json({ ok: true, ...result, message: 'Settings reset to defaults' });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ============================================================
// MANUAL ACTIONS
// ============================================================

/**
 * POST /api/livePrice/refresh
 * Manually trigger a price update
 */
router.post('/refresh', async (req, res) => {
    try {
        await livePriceService.updateAllPrices();
        const status = livePriceService.getStatus();
        res.json({ ok: true, message: 'Prices refreshed', ...status });
    } catch (error) {
        console.error('[LivePrice API] Refresh error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
