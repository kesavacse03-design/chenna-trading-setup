/**
 * Portfolio Simulation API Routes
 * Phase 9
 */

const express = require('express');
const router = express.Router();
const portfolioSim = require('../services/portfolioSimulator.cjs');

// Run portfolio simulation
router.post('/simulate', (req, res) => {
    try {
        const { trades, initialCapital } = req.body;

        if (!trades || !Array.isArray(trades)) {
            return res.status(400).json({ ok: false, error: 'Invalid trades data' });
        }

        const portfolio = portfolioSim.simulatePortfolio(trades, initialCapital);
        const monthlyPnL = portfolioSim.calculateMonthlyPnL(trades);

        res.json({
            ok: true,
            portfolio,
            monthlyPnL
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Calculate monthly P&L only
router.post('/monthly', (req, res) => {
    try {
        const { trades } = req.body;

        if (!trades || !Array.isArray(trades)) {
            return res.status(400).json({ ok: false, error: 'Invalid trades data' });
        }

        const monthlyPnL = portfolioSim.calculateMonthlyPnL(trades);

        res.json({
            ok: true,
            monthlyPnL
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
