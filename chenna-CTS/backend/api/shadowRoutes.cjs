/**
 * Shadow Learner API Routes (Phase 3)
 * Endpoints for AI learning, pattern discovery, and strategy improvements
 */

const express = require('express');
const router = express.Router();
const shadowLearner = require('../services/shadowLearner.cjs');
const outcomeTracker = require('../services/outcomeTracker.cjs');
const patternRecognition = require('../services/patternRecognition.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * GET /api/shadow/dashboard
 * Get overall Shadow Learner statistics
 */
router.get('/dashboard', async (req, res) => {
    try {
        const stats = await shadowLearner.getDashboardStats();
        res.json({ ok: true, ...stats });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/shadow/insights/:categoryKey
 * Get category-specific learning insights
 */
router.get('/insights/:categoryKey', async (req, res) => {
    try {
        const insights = await shadowLearner.getCategoryInsights(req.params.categoryKey);
        res.json({ ok: true, ...insights });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/shadow/trigger/:categoryKey
 * Manually trigger learning cycle for a category
 */
router.post('/trigger/:categoryKey', async (req, res) => {
    try {
        const result = await shadowLearner.triggerManual(req.params.categoryKey);
        res.json({ ok: true, result });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/shadow/patterns/:categoryKey
 * Get discovered patterns for a category
 */
router.get('/patterns/:categoryKey', async (req, res) => {
    try {
        const { minConfidence = 0.5 } = req.query;
        const patterns = await patternRecognition.getPatterns(
            req.params.categoryKey,
            { minConfidence: parseFloat(minConfidence) }
        );
        res.json({ ok: true, patterns });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/shadow/improvements/:categoryKey
 * Get pending strategy improvements
 */
router.get('/improvements/:categoryKey', async (req, res) => {
    try {
        const improvements = await shadowLearner.getPendingSuggestions(req.params.categoryKey);
        res.json({ ok: true, improvements });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/shadow/outcomes/:categoryKey
 * Get recent outcomes for a category
 */
router.get('/outcomes/:categoryKey', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const outcomes = await outcomeTracker.getRecentOutcomes(
            req.params.categoryKey,
            parseInt(days)
        );
        res.json({ ok: true, outcomes, count: outcomes.length });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/shadow/stats/:categoryKey
 * Get outcome statistics for a category
 */
router.get('/stats/:categoryKey', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const stats = await outcomeTracker.getStats(
            req.params.categoryKey,
            parseInt(days)
        );
        res.json({ ok: true, stats });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * PUT /api/shadow/config/:categoryKey
 * Update Shadow Learner config for a category
 */
router.put('/config/:categoryKey', async (req, res) => {
    try {
        const { enabled, automationLevel, learningWindowDays, minSampleSize, confidenceThreshold } = req.body;

        const config = await outcomeTracker.updateConfig(req.params.categoryKey, {
            enabled,
            automationLevel,
            learningWindowDays,
            minSampleSize,
            confidenceThreshold
        });

        res.json({ ok: true, config });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/shadow/config/:categoryKey
 * Get Shadow Learner config for a category
 */
router.get('/config/:categoryKey', async (req, res) => {
    try {
        const config = await outcomeTracker.getConfig(req.params.categoryKey);
        res.json({ ok: true, config });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/shadow/history
 * Get adaptation history (all auto-adaptations)
 */
router.get('/history', async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        const history = await prisma.adaptationHistory.findMany({
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit)
        });

        res.json({ ok: true, history });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
