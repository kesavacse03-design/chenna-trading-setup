/**
 * Trap Detection API Routes
 * Phase 7
 */

const express = require('express');
const router = express.Router();
const trapDetector = require('../services/institutionalTrapDetector.cjs');

// Check for traps in current candles
router.post('/check/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { candles } = req.body;

        if (!candles || candles.length < 20) {
            return res.json({ ok: false, error: 'Insufficient candle data' });
        }

        const result = trapDetector.detectAllTraps(symbol, candles);

        // Log if traps detected
        if (result.detected) {
            await trapDetector.logTrapDetection(symbol, req.body.categoryKey, result.traps);
        }

        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get trap history
router.get('/history/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { days } = req.query;
        const result = await trapDetector.getTrapHistory(symbol, parseInt(days) || 30);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get trap type definitions
router.get('/types', (req, res) => {
    res.json({ ok: true, types: trapDetector.TRAP_TYPES });
});

module.exports = router;
