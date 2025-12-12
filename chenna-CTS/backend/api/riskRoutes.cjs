/**
 * Risk Management API Routes
 * Phase 11
 */

const express = require('express');
const router = express.Router();
const riskEngine = require('../services/riskEngine.cjs');

// Validate if trade is allowed
router.post('/validate-trade', async (req, res) => {
    try {
        const result = await riskEngine.validateTrade(req.body);
        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get current exposure
router.post('/exposure', async (req, res) => {
    try {
        const { categoryKey, activeTrades } = req.body;
        const exposure = await riskEngine.getCurrentExposure(categoryKey, activeTrades);
        res.json({ ok: true, exposure });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get risk configuration
router.get('/config/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;
        const config = await riskEngine.getRiskConfig(categoryKey);
        res.json({ ok: true, config });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Update risk configuration
router.put('/config/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;
        const { config } = req.body;
        const result = await riskEngine.updateRiskConfig(categoryKey, config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get default risk config
router.get('/defaults', (req, res) => {
    res.json({ ok: true, defaults: riskEngine.DEFAULT_RISK_CONFIG });
});

module.exports = router;
