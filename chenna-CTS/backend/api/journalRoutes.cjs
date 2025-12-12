/**
 * Trade Journal API Routes
 * Phase 10
 */

const express = require('express');
const router = express.Router();
const tradeJournal = require('../services/tradeJournal.cjs');

// Update journal entry for a trade
router.put('/:tradeId', async (req, res) => {
    try {
        const { tradeId } = req.params;
        const result = await tradeJournal.updateJournalEntry(tradeId, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get journal entries with filters
router.get('/entries', async (req, res) => {
    try {
        const filters = {
            categoryKey: req.query.categoryKey,
            outcome: req.query.outcome,
            tags: req.query.tags ? req.query.tags.split(',') : null,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            limit: parseInt(req.query.limit) || 50
        };

        const result = await tradeJournal.getJournalEntries(filters);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get journal statistics
router.get('/stats/:categoryKey?', async (req, res) => {
    try {
        const { categoryKey } = req.params;
        const result = await tradeJournal.getJournalStats(categoryKey);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
