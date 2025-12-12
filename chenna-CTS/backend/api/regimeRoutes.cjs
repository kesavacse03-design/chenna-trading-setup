/**
 * Regime API Routes
 * Phase 6: Market Regime Integration
 */

const express = require('express');
const router = express.Router();
const regimeFilter = require('../services/regimeFilter.cjs');

// Get current market regime
router.get('/current', async (req, res) => {
    try {
        const regime = await regimeFilter.getCurrentRegime();
        res.json({ ok: true, regime });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Check if trade should be allowed
router.post('/should-trade', async (req, res) => {
    try {
        const { symbol, direction, categoryKey } = req.body;
        const result = await regimeFilter.shouldAllowTrade(symbol, direction, categoryKey);
        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get regime statistics for category
router.get('/stats/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;
        const { days } = req.query;
        const result = await regimeFilter.getRegimeStats(categoryKey, parseInt(days) || 30);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Update category regime rules
router.put('/rules/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;
        const { rules } = req.body;
        const result = await regimeFilter.updateCategoryRegimeRules(categoryKey, rules);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get regime rules reference
router.get('/rules', (req, res) => {
    res.json({ ok: true, rules: regimeFilter.REGIME_RULES });
});

module.exports = router;
