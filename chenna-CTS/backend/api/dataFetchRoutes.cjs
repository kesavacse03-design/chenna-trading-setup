/**
 * Data Fetch Agent Routes
 * API endpoints for controlling the data fetch agent
 */

const express = require('express');
const router = express.Router();
const dataFetchAgent = require('../services/dataFetchAgent.cjs');

/**
 * POST /api/data-fetch/start
 * Start scheduled data fetching
 */
router.post('/start', async (req, res) => {
    try {
        dataFetchAgent.startScheduledFetching();
        res.json({
            ok: true,
            message: 'Data fetch agent started (10 min interval)'
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/data-fetch/run
 * Run a single fetch cycle immediately
 */
router.post('/run', async (req, res) => {
    try {
        console.log('[DataFetchRoutes] Running immediate fetch cycle...');
        await dataFetchAgent.runCycle();
        res.json({
            ok: true,
            ...dataFetchAgent.getStatus()
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/data-fetch/status
 * Get current fetch status
 */
router.get('/status', (req, res) => {
    res.json({
        ok: true,
        ...dataFetchAgent.getStatus()
    });
});

/**
 * GET /api/data-fetch/snapshots/:category
 * Get latest snapshots for a category
 */
router.get('/snapshots/:category', async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const { category } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const snapshots = await prisma.liveSnapshot.findMany({
            where: { category },
            orderBy: { fetchedAt: 'desc' },
            take: limit
        });

        res.json({
            ok: true,
            category,
            count: snapshots.length,
            snapshots
        });

        await prisma.$disconnect();
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
