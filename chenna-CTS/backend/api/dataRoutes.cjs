/**
 * Data Validation API Routes
 * Phase 12
 */

const express = require('express');
const router = express.Router();
const dataValidator = require('../services/dataValidator.cjs');

// Validate candle data
router.post('/validate/:symbol', (req, res) => {
    try {
        const { symbol } = req.params;
        const { candles } = req.body;

        const validation = dataValidator.validateCandles(candles, symbol);
        const qualityScore = dataValidator.getDataQualityScore(validation);

        res.json({
            ok: true,
            ...validation,
            qualityScore
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Filter valid candles
router.post('/filter', (req, res) => {
    try {
        const { candles } = req.body;
        const validCandles = dataValidator.filterValidCandles(candles);

        res.json({
            ok: true,
            original: candles.length,
            filtered: validCandles.length,
            removed: candles.length - validCandles.length,
            candles: validCandles
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
