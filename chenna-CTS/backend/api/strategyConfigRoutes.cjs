const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { STRATEGY_REGISTRY } = require('../config/strategyRegistry.cjs');

const OVERRIDES_FILE = path.join(__dirname, '../config/strategyOverrides.json');

// Helper: Load User Overrides
function loadOverrides() {
    try {
        if (fs.existsSync(OVERRIDES_FILE)) {
            const data = fs.readFileSync(OVERRIDES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[StrategyConfig] Failed to load overrides:', e);
    }
    return {};
}

// Helper: Save User Overrides
function saveOverrides(overrides) {
    try {
        fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2));
    } catch (e) {
        console.error('[StrategyConfig] Failed to save overrides:', e);
        throw e;
    }
}

/**
 * GET /api/strategy/registry
 * Returns the full strategy registry, merged with user overrides.
 */
router.get('/registry', (req, res) => {
    try {
        const overrides = loadOverrides();
        const registry = JSON.parse(JSON.stringify(STRATEGY_REGISTRY)); // Deep copy

        // Merge overrides
        Object.keys(registry).forEach(key => {
            if (overrides[key]) {
                // Merge parameters
                if (overrides[key].parameters) {
                    Object.keys(overrides[key].parameters).forEach(paramKey => {
                        if (registry[key].parameters[paramKey]) {
                            registry[key].parameters[paramKey].value = overrides[key].parameters[paramKey];
                        }
                    });
                }
            }
        });

        res.json({ success: true, registry });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/strategy/config/:category
 * Returns config for specific category
 */
router.get('/config/:category', (req, res) => {
    try {
        const { category } = req.params;
        const overrides = loadOverrides();
        const baseConfig = STRATEGY_REGISTRY[category];

        if (!baseConfig) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const config = JSON.parse(JSON.stringify(baseConfig));

        // Apply overrides
        if (overrides[category] && overrides[category].parameters) {
            Object.keys(overrides[category].parameters).forEach(paramKey => {
                if (config.parameters[paramKey]) {
                    config.parameters[paramKey].value = overrides[category].parameters[paramKey];
                }
            });
        }

        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/strategy/config/:category
 * Updates parameters for a category (saves to overrides file)
 */
router.put('/config/:category', (req, res) => {
    try {
        const { category } = req.params;
        const { parameters } = req.body;

        if (!STRATEGY_REGISTRY[category]) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const overrides = loadOverrides();
        if (!overrides[category]) overrides[category] = {};
        if (!overrides[category].parameters) overrides[category].parameters = {};

        // Update overrides
        Object.keys(parameters).forEach(key => {
            overrides[category].parameters[key] = parameters[key];
        });

        saveOverrides(overrides);

        res.json({ success: true, message: 'Configuration saved' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
