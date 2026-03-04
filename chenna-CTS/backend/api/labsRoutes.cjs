/**
 * Labs Phase Routes - NEW Phase-based approach
 * 
 * Replaces old labsRoutes with phase-by-phase execution
 */

const express = require('express');
const router = express.Router();

// Phase modules
const phase1 = require('../services/labs/phase1_truth.cjs');

/**
 * POST /api/labs/phase1
 * Run Phase 1: Truth Extraction for a category
 */
router.post('/phase1', async (req, res) => {
    try {
        const { categoryKey, params } = req.body;

        if (!categoryKey) {
            return res.status(400).json({ error: 'categoryKey required' });
        }

        console.log(`\n[Labs API] Running Phase 1 for ${categoryKey}...`);

        const result = await phase1.runPhase1(categoryKey, params);

        res.json({
            success: true,
            phase: 1,
            categoryKey,
            stats: result.stats,
            trades: result.trades?.slice(0, 50), // Return first 50 trades for UI
            checkpoint: result.checkpoint,
            params: result.params,
            debug: result.debug // Include debug diagnostics
        });
    } catch (error) {
        console.error('[Labs API] Phase 1 error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/labs/phase2
 * Run Phase 2: Category Signature Discovery
 */
router.post('/phase2', async (req, res) => {
    try {
        const { categoryKey } = req.body;

        if (!categoryKey) {
            return res.status(400).json({ error: 'categoryKey required' });
        }

        console.log(`\n[Labs API] Running Phase 2 for ${categoryKey}...`);

        const phase2 = require('../services/labs/phase2_signature.cjs');
        const result = await phase2.runPhase2(categoryKey);

        res.json(result);
    } catch (error) {
        console.error('[Labs API] Phase 2 error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/labs/status/:categoryKey
 * Get current phase status for a category
 */
router.get('/status/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        // TODO: Query database for phase results
        // For now, return placeholder
        res.json({
            categoryKey,
            phases: {
                phase1: { completed: false },
                phase2: { completed: false },
                phase3: { completed: false },
                phase4: { completed: false },
                phase5: { completed: false },
                phase7: { completed: false }
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/labs/signals
 * Generate daily trading signals
 */
router.get('/signals', async (req, res) => {
    try {
        const { portfolio = 500000 } = req.query;
        const signalGenerator = require('../services/labs/signalGenerator.cjs');

        console.log(`\n[Labs API] Generating signals for portfolio ₹${portfolio}...`);

        const result = await signalGenerator.generateDailySignals(new Date(), parseInt(portfolio));

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[Labs API] Signal generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/labs/signals/check-exits
 * Check open positions for exit signals
 */
router.post('/signals/check-exits', async (req, res) => {
    try {
        const { positions } = req.body;
        const signalGenerator = require('../services/labs/signalGenerator.cjs');

        const exits = await signalGenerator.checkExitSignals(positions || []);

        res.json({
            success: true,
            exits
        });
    } catch (error) {
        console.error('[Labs API] Exit check error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
