/**
 * Paper Trade AI API Routes
 * Phase 8
 */

const express = require('express');
const router = express.Router();
const paperTradeAI = require('../services/paperTradeReasoning.cjs');

// Analyze a single failed trade
router.post('/analyze-trade', async (req, res) => {
    try {
        const { trade, candles, marketContext } = req.body;
        const analysis = await paperTradeAI.analyzeFailedTrade(trade, candles, marketContext);
        res.json({ ok: true, analysis });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Analyze batch of failed trades
router.post('/analyze-failures', async (req, res) => {
    try {
        const { failedTrades, allCandles } = req.body;
        const batchAnalysis = await paperTradeAI.analyzeFailuresBatch(failedTrades, allCandles);
        res.json({ ok: true, ...batchAnalysis });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Generate improved strategy
router.post('/generate-improvements', async (req, res) => {
    try {
        const { suggestions, currentStrategy } = req.body;
        const improvements = paperTradeAI.generateImprovedStrategy(suggestions, currentStrategy);
        res.json({ ok: true, improvements });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
